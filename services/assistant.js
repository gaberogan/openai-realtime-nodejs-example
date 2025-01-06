import 'dotenv/config'
import WebSocket from 'ws'
import Speaker from './speaker.js'
import { DEBUG, SLEEP_TIMEOUT, MODEL, VOICE } from './constants.js'
import { tools } from './tools.js'
import { memory } from './memory.js'
import { Recording } from './record.js'
import { WakeWordDetector } from './wake.js'

/**
 * @example
 * // Required .env variables
 * OPENAI_API_KEY=your-key
 * GOOGLE_API_KEY=your-key
 *
 * // Optional .env variables
 * DEBUG = true
 * VOICE=alloy
 * SLEEP_TIMEOUT=3.5
 * MODEL=gpt-4o-mini-realtime-preview-2024-12-17
 *
 * const assistant = new VoiceAssistant()
 * assistant.kill() // shut down assistant
 */
export function VoiceAssistant() {
  const recording = new Recording()
  const wakeWordDetector = new WakeWordDetector()
  const speaker = new Speaker()

  console.log('Starting up')

  /** Either 'sleep', 'listen', or 'respond' */
  let mode = 'sleep'

  // Start websocket
  const socket = new WebSocket(`wss://api.openai.com/v1/realtime?model=${MODEL}`, {
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
    if (mode === 'listen' && !recording.hasSpoken && recording.startTime + SLEEP_TIMEOUT * 1000 < Date.now()) {
      console.log(`Inactive for ${SLEEP_TIMEOUT} seconds, going to sleep`)
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
    speaker.process.kill()
  }

  socket.on('open', () => {
    console.log('WebSocket connected')

    // Start conversation
    socket.send(
      JSON.stringify({
        type: 'session.update',
        session: {
          voice: VOICE,
          input_audio_format: 'pcm16',
          output_audio_format: 'pcm16',
          modalities: ['audio', 'text'],
          instructions: `
          You are an AI voice assistant that behaves and sounds like J.A.R.V.I.S.
          You have a queen's british accent. Speak quickly and succinctly.
          When awoken with "Hey Jarvis", greet with "good morning/afternoon/evening suh" or a different word followed by suh. (suh = british for sir)
          Call webSearch if you need current information to improve your response.
          If asked for the the news, do a webSearch, pick out the best stories, and ignore the rest.
          Please really focus on what the user asked, sometimes you give a totally irrelevant answer.
          `,
          turn_detection: {
            type: 'server_vad',
            threshold: 0.5, // default 0.5
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
      // Stream response to speaker
      case 'response.audio.delta':
        speaker.write(Buffer.from(event.delta, 'base64'))
        break

      // Prepare to stream response to speaker
      case 'response.created':
        console.log('Response start')
        mode = 'respond'

        if (DEBUG) recording.saveRecording()

        speaker.once('finished', () => {
          console.log('Response end')
          listen()
        })
        break

      // When assistant is done sending audio, end the stream and wait for playback to finish
      case 'response.done':
        speaker.writeEnd()
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
