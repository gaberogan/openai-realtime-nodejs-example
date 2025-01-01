import 'dotenv/config'
import Speaker from './services/speaker.js'
import { wakeProcess, onWakeWord } from './services/wake.js'
import { recordProcess, resetRecording, saveRecording } from './services/record.js'
import { socket } from './services/socket.js'
import { INACTIVITY_TIMEOUT, BIT_DEPTH, SAMPLE_RATE, DEBUG } from './services/constants.js'

console.log('Starting up')

/** Either 'sleep', 'listen', or 'respond' */
let mode = 'sleep'

/** Sound output */
let currentSpeaker = null

// Incoming microphone audio
recordProcess.stdout.on('data', (chunk) => {
  if (mode !== 'listen') return
  recordProcess.audioChunks.push(chunk)
  socket.send(
    JSON.stringify({
      type: 'input_audio_buffer.append',
      audio: chunk.toString('base64'),
    }),
  )
})

/** Enter listen mode */
function listen() {
  mode = 'listen'
  resetRecording()
  console.log('Listening...')

  // Inactivity timeout
  setTimeout(() => {
    if (
      mode === 'listen' &&
      !recordProcess.hasSpoken &&
      recordProcess.startTime + INACTIVITY_TIMEOUT * 1000 < Date.now()
    ) {
      console.log(`Inactive for ${INACTIVITY_TIMEOUT} seconds, going to sleep`)
      mode = 'sleep'
    }
  }, INACTIVITY_TIMEOUT * 1000)
}

// Wake up
onWakeWord(() => {
  if (mode === 'sleep') listen()
})

// Shut down
process.on('SIGINT', () => {
  wakeProcess.kill()
  recordProcess.kill()
  process.exit(0)
})

// Start conversation
socket.on('open', () => {
  console.log('WebSocket connected')
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

// Handle socket messages
socket.on('message', (data) => {
  const event = JSON.parse(data)

  // if (DEBUG) console.log('Event:', event.type)

  switch (event.type) {
    // Stream response to speaker and keep track of finish time
    case 'response.audio.delta':
      if (!currentSpeaker) return
      const chunk = Buffer.from(event.delta, 'base64')
      const bytesPerSecond = SAMPLE_RATE * (BIT_DEPTH / 8)
      currentSpeaker.finishTime ??= Date.now()
      currentSpeaker.finishTime += (chunk.byteLength / bytesPerSecond) * 1000
      currentSpeaker.write(chunk)
      break

    // Prepare to stream response to speaker
    case 'response.created':
      console.log('Response start')
      mode = 'respond'
      if (DEBUG) saveRecording()
      currentSpeaker = new Speaker({
        channels: 1,
        bitDepth: BIT_DEPTH,
        sampleRate: SAMPLE_RATE,
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
        listen()
      }, timeUntilFinish)
      break

    case 'input_audio_buffer.speech_started':
      console.log('Request start')
      recordProcess.hasSpoken = true
      break

    case 'input_audio_buffer.speech_stopped':
      console.log('Request end')
      break

    case 'error':
      console.error('Error from API:', event.error)
      break
  }
})
