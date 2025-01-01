import 'dotenv/config'
import WebSocket from 'ws'
import record from 'node-record-lpcm16'
import { spawn } from 'child_process'
import os from 'os'

// Dynamic import for speaker based on platform
let Speaker
if (os.platform() === 'linux' && os.arch() === 'arm64') {
  Speaker = (await import('speaker-arm64')).default // Raspberry Pi
} else {
  Speaker = (await import('speaker')).default
}

console.log('Starting up')

const MODEL = 'gpt-4o-mini-realtime-preview-2024-12-17'
const INACTIVITY_TIMEOUT = 3.5 // seconds

let mode = 'sleep' // Either 'sleep' or 'listen'

// Wake word process
const wakeProcess = spawn('python', ['-u', 'wake.py'], {
  stdio: ['ignore', 'pipe', 'pipe'],
})
wakeProcess.stderr.pipe(process.stderr)

// Listen for wake word detection in stdout
wakeProcess.stdout.on('data', (data) => {
  const output = data.toString()
  process.stdout.write(output) // Still show output in console
  if (output.includes('Wake word detected') && mode === 'sleep') {
    mode = 'listen'
    startRecording()
  }
})

// Cleanup on exit
process.on('SIGINT', () => {
  if (wakeProcess) wakeProcess.kill()
  process.exit(0)
})

// Inactivity timeout
setInterval(() => {
  if (
    currentRecording &&
    !currentRecording.hasSpoken &&
    currentRecording.startTime + INACTIVITY_TIMEOUT * 1000 < Date.now()
  ) {
    console.log(`Inactive for ${INACTIVITY_TIMEOUT} seconds, going to sleep`)
    stopRecording()
    mode = 'sleep'
  }
}, 1000)

// WebSocket setup
const socket = new WebSocket(`wss://api.openai.com/v1/realtime?model=${MODEL}`, {
  headers: {
    Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    'OpenAI-Beta': 'realtime=v1',
  },
})

socket.on('error', (error) => {
  console.error('WebSocket error:', error)
})

socket.on('open', () => {
  console.log('WebSocket connected')

  // Start conversation
  socket.send(
    JSON.stringify({
      type: 'session.update',
      session: {
        input_audio_format: 'pcm16',
        output_audio_format: 'pcm16',
        modalities: ['audio', 'text'],
        instructions: 'You are a helpful voice assistant. Please respond naturally to user queries.',
      },
    }),
  )
})

/** Is the user talking */
let currentRecording = null

/** Is the server talking */
let responseInProgress = false

/** Sound output */
let currentSpeaker = null

const bitDepth = 16
const sampleRate = 24000
const bytesPerSecond = sampleRate * (bitDepth / 8)

socket.on('message', (data) => {
  const event = JSON.parse(data)

  if (process.env.DEBUG) console.log('Event:', event.type)

  switch (event.type) {
    // Stream response to speaker and keep track of finish time
    case 'response.audio.delta':
      if (!currentSpeaker) return
      const chunk = Buffer.from(event.delta, 'base64')
      currentSpeaker.finishTime ??= Date.now()
      currentSpeaker.finishTime += (chunk.byteLength / bytesPerSecond) * 1000
      currentSpeaker.write(chunk)
      break

    // Prepare to stream response to speaker
    case 'response.created':
      stopRecording()
      console.log('Response start')
      responseInProgress = true
      currentSpeaker = new Speaker({
        channels: 1,
        bitDepth,
        sampleRate,
        signed: true,
      })
      break

    // When assistant is done speaking, destroy speaker and resume recording
    case 'response.audio.done':
      const timeUntilFinish = currentSpeaker.finishTime - Date.now()
      setTimeout(() => {
        console.log('Response end')
        currentSpeaker.end()
        currentSpeaker = null
        responseInProgress = false
        startRecording()
      }, timeUntilFinish)
      break

    case 'input_audio_buffer.speech_started':
      console.log('Request start')
      if (currentRecording) currentRecording.hasSpoken = true
      break

    case 'input_audio_buffer.speech_stopped':
      console.log('Request end')
      break

    case 'error':
      console.error('Error from API:', event.error)
      break
  }
})

// Function to start recording
async function startRecording() {
  if (currentRecording || responseInProgress) return

  console.log('Recording...')

  currentRecording = record.record({ sampleRate, channels: 1 }).stream()
  currentRecording.startTime = Date.now()

  // Handle data chunks
  currentRecording.on('data', (chunk) => {
    if (socket.readyState === WebSocket.OPEN && !responseInProgress) {
      socket.send(
        JSON.stringify({
          type: 'input_audio_buffer.append',
          audio: chunk.toString('base64'),
        }),
      )
    }
  })
}

async function stopRecording() {
  if (!currentRecording) return
  console.log('Recording stopped')
  currentRecording.removeAllListeners()
  currentRecording.destroy()
  currentRecording = null
}
