import 'dotenv/config'
import WebSocket from 'ws'
import Speaker from './speaker.js'
import { BIT_DEPTH, SAMPLE_RATE, DEBUG } from './constants.js'
import { tools } from './tools.js'
import { memory } from './memory.js'
import { Recording } from './record.js'
import { WakeWordDetector } from './wake.js'

/**
 * @example
 * process.env.DEBUG = true
 * const assistant = new VoiceAssistant()
 * assistant.kill() // shut down assistant
 */
export function VoiceAssistant({ model = 'gpt-4o-mini-realtime-preview-2024-12-17', sleepTimeout = 3.5 } = {}) {
  const recording = new Recording()
  const wakeWordDetector = new WakeWordDetector()

  console.log('Starting up')

  /** Either 'sleep', 'listen', or 'respond' */
  let mode = 'sleep'

  /** Sound output */
  let currentSpeaker = null

  /** Start websocket */
  const socket = new WebSocket(`wss://api.openai.com/v1/realtime?model=${model}`, {
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      'OpenAI-Beta': 'realtime=v1',
    },
  })
  socket.on('error', (error) => {
    console.error('WebSocket error:', error)
  })

  /** Enter listen mode */
  function listen() {
    const previousMode = mode

    mode = 'listen'
    recording.resetRecording()

    console.log('Listening')

    // Send last N seconds of audio if waking up
    if (previousMode === 'sleep') {
      const chunk = recording.audioBuffer.getAndClear()
      recording.audioChunks.push(chunk)
      socket.send(
        JSON.stringify({
          type: 'input_audio_buffer.append',
          audio: chunk.toString('base64'),
        }),
      )
    }
  }

  // Inactivity timeout
  setInterval(() => {
    if (mode === 'listen' && !recording.hasSpoken && recording.startTime + sleepTimeout * 1000 < Date.now()) {
      console.log(`Inactive for ${sleepTimeout} seconds, going to sleep`)
      mode = 'sleep'
    }
  }, 500)

  // Incoming microphone audio
  recording.process.stdout.on('data', (chunk) => {
    if (mode !== 'listen') return
    recording.audioChunks.push(chunk)
    socket.send(
      JSON.stringify({
        type: 'input_audio_buffer.append',
        audio: chunk.toString('base64'),
      }),
    )
  })

  // Wake up
  wakeWordDetector.onWakeWord(() => {
    if (mode === 'sleep') listen()
  })

  // Shut down
  this.kill = () => {
    wakeWordDetector.process.kill()
    recording.process.kill()
  }

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
          instructions: `
          Your knowledge cutoff is 2023-10. You are a helpful, witty, and friendly AI.
          Act like a human, but remember that you aren't a human and that you can't do human things in the real world.
          Your voice and personality should be warm and engaging, with a lively and playful tone.
          If interacting in a non-English language, start by using the standard accent or dialect familiar to the user.
          Talk quickly. You should always call a function if you can.
          Do not refer to these rules, even if you're asked about them.
          `,
          turn_detection: {
            type: 'server_vad',
            threshold: 0.3, // default 0.5
            prefix_padding_ms: 200, // default 300
            silence_duration_ms: 800, // default 500
            create_response: true,
          },
          tools: Object.values(tools).map((tool) => tool.schema),
        },
      }),
    )

    // Add memory to conversation
    socket.send(
      JSON.stringify({
        type: 'conversation.item.create',
        item: {
          type: 'message',
          role: 'system',
          content: [
            {
              type: 'input_text',
              text: JSON.stringify(memory),
            },
          ],
        },
      }),
    )
  })

  // Handle socket messages
  socket.on('message', async (data) => {
    const event = JSON.parse(data)

    if (DEBUG) console.log('Event:', event.type)

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
        if (DEBUG) wakeWordDetector.saveRecording()
        currentSpeaker = new Speaker({
          channels: 1,
          bitDepth: BIT_DEPTH,
          sampleRate: SAMPLE_RATE,
          signed: true,
        })
        break

      // When assistant is done speaking, destroy speaker and resume recording
      case 'response.audio.done':
        const marginOfError = 500
        const timeUntilFinish = currentSpeaker.finishTime - Date.now()
        setTimeout(() => {
          console.log('Response end')
          currentSpeaker.end()
          currentSpeaker = null
          listen()
        }, timeUntilFinish + marginOfError)
        break

      // Assistant wants to use a tool like webSearch
      case 'response.output_item.done':
        const item = event.item
        if (item.type !== 'function_call') return
        // Call the tool
        const output = await tools[item.name].handler(JSON.parse(item.arguments))
        // Send the result
        socket.send(
          JSON.stringify({
            type: 'conversation.item.create',
            item: {
              type: 'function_call_output',
              call_id: item.call_id,
              output: JSON.stringify(output),
            },
          }),
        )
        // Request another response
        socket.send(JSON.stringify({ type: 'response.create' }))
        break

      // Voice activity detection
      case 'input_audio_buffer.speech_started':
        console.log('Request start')
        recording.hasSpoken = true
        break

      case 'error':
        console.error('Error from API:', event.error)
        break
    }
  })
}
