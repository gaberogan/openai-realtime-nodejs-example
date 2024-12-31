import { spawn } from 'child_process'
import OpenWakeWord from './openwakeword.js'

// Configuration
const SAMPLE_RATE = 16000
const BIT_DEPTH = 16
const CHANNELS = 1
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
    '--buffer',
    '500',
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

  // Process audio data
  sox.stdout.on('data', async (data) => {
    // Get prediction from raw audio data
    const score = await detector.predict(data)

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
