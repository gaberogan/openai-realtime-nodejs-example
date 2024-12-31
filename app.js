import 'dotenv/config'
import WebSocket from 'ws'
import record from 'node-record-lpcm16'
import Speaker from 'speaker'
import { spawn } from 'child_process'

console.log('Launching voice assistant...')

// Wake word process management
let wakeProcess = null

function startWakeWordDetection() {
  if (wakeProcess) return
  console.log('Starting wake word detection...')
  wakeProcess = spawn('python', ['wake.py'])

  wakeProcess.on('exit', (code) => {
    console.log('Wake word detected! Resuming voice assistant...')
    wakeProcess = null
    startRecording()
  })
}

// Cleanup on exit
process.on('SIGINT', () => {
  if (wakeProcess) wakeProcess.kill()
  process.exit(0)
})

// architecture:
// voice input to model A, get optional SEARCH prompt - 1 sec?
// run a web search (google) - 0.5 sec?
// give search result text and voice input to model B - 1 sec?
// get model B response

const model = 'gpt-4o-mini-realtime-preview-2024-12-17'

// Inactivity timeout
const INACTIVITY_TIMEOUT = 2 // seconds

function checkInactivity() {
  if (
    currentRecording &&
    !currentRecording.hasSpoken &&
    currentRecording.startTime + INACTIVITY_TIMEOUT * 1000 < Date.now()
  ) {
    console.log(`Going to sleep after ${INACTIVITY_TIMEOUT} seconds of inactivity...`)
    stopRecording()
    startWakeWordDetection()
  }
}

setInterval(checkInactivity, 1000)

// WebSocket setup

const socket = new WebSocket(`wss://api.openai.com/v1/realtime?model=${model}`, {
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
      console.log('Response start')
      responseInProgress = true
      stopRecording()
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
      currentRecording.hasSpoken = true
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

  console.log('Starting recording...')

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
  console.log('Stopping recording...')
  currentRecording.removeAllListeners()
  currentRecording.destroy()
  currentRecording = null
}

// Start recording automatically after WebSocket connection
socket.on('open', () => {
  console.log('\nVoice Assistant Ready! Recording started automatically.')
  console.log('Press Ctrl+C to exit\n')
  startRecording()
})
