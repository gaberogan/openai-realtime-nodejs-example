import { spawn } from 'child_process'
import OpenWakeWord from './openwakeword.js'

// Configuration
const CHUNK_SIZE = 96
const SAMPLE_RATE = 16000
const BIT_DEPTH = 16
const CHANNELS = 1
const BYTES_PER_SAMPLE = BIT_DEPTH / 8
const SCORE_THRESHOLD = 0.5

async function main() {
  // Initialize wake word detector
  const detector = new OpenWakeWord()
  await detector.loadModel()

  // Start sox process for audio input
  const sox = spawn('sox', [
    '-d', // Use default input device
    '-t',
    'raw', // Output raw audio
    '-r',
    SAMPLE_RATE, // Sample rate 16kHz
    '-b',
    BIT_DEPTH, // Bit depth 16
    '-c',
    CHANNELS, // Mono channel
    '-e',
    'signed', // Signed integers
    '-q', // Quiet mode
    '-', // Output to stdout
  ])

  // Buffer for audio chunks
  let buffer = Buffer.alloc(0)
  const chunkSize = CHUNK_SIZE * BYTES_PER_SAMPLE

  // Process audio data
  sox.stdout.on('data', async (data) => {
    // Append new data to buffer
    buffer = Buffer.concat([buffer, data])

    // Process complete chunks
    while (buffer.length >= chunkSize) {
      // Extract chunk
      const chunk = buffer.slice(0, chunkSize)
      buffer = buffer.slice(chunkSize)

      // Convert to Int16Array
      const audioData = new Int16Array(chunk.buffer, chunk.byteOffset, chunk.length / 2)

      // Get prediction
      const score = await detector.predict(audioData)

      // Format output
      const modelName = detector.modelName
      const spaces = ' '.repeat(16 - modelName.length)
      const scoreStr = Math.abs(score).toFixed(5)
      const status = score <= SCORE_THRESHOLD ? '--' + ' '.repeat(20) : 'Wakeword Detected!'

      // Clear previous line and print results
      process.stdout.write('\x1B[F'.repeat(5))
      console.log(`
            Model Name         | Score | Wakeword Status
            --------------------------------------
            ${modelName}${spaces}   | ${scoreStr} | ${status}
            `)
    }
  })

  // Handle errors
  sox.stderr.on('data', (data) => console.error(`Sox error: ${data}`))
  sox.on('close', (code) => console.log(`Sox exited with code ${code}`))

  // Cleanup on exit
  process.on('SIGINT', () => {
    sox.kill()
    process.exit()
  })
}

main().catch(console.error)
