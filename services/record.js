import fs from 'fs'
import wav from 'wav'
import { spawn } from 'child_process'
import { BIT_DEPTH, SAMPLE_RATE } from './constants.js'

// Start continuous recording

export const recordProcess = spawn('sox', [
  '-d', // Use default input device
  '-V0', // Suppress warnings
  '-t',
  'raw', // Output raw audio
  '--buffer',
  '400', // Chunk size in bytes, smaller is better latency but worse efficiency
  '-r',
  SAMPLE_RATE,
  '-b',
  BIT_DEPTH,
  '-c',
  '1', // Channels
  '-e',
  'signed', // Signed integers
  '-q', // Quiet mode
  '-', // Output to stdout
])

// Buffer to store the last N seconds of audio

const NUM_SECONDS = 1
const BUFFER_SIZE = SAMPLE_RATE * (BIT_DEPTH / 8) * NUM_SECONDS

export const audioBuffer = {
  buffer: Buffer.alloc(0),
  append(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk])
    if (this.buffer.length > BUFFER_SIZE) {
      this.buffer = this.buffer.subarray(-BUFFER_SIZE)
    }
  },
  getAndClear() {
    const result = this.buffer
    this.buffer = Buffer.alloc(0)
    return result
  },
}

recordProcess.stdout.on('data', (chunk) => {
  audioBuffer.append(chunk)
})

// Handle errors
recordProcess.stderr.on('data', (data) => {
  console.error('Sox error:', data.toString())
})

/** Reset the state of the recording */
export function resetRecording() {
  recordProcess.audioChunks = []
  recordProcess.hasSpoken = false
  recordProcess.startTime = Date.now()
}

/** Save the recording to a file */
export function saveRecording() {
  const writer = new wav.Writer({
    channels: 1,
    sampleRate: SAMPLE_RATE,
    bitDepth: BIT_DEPTH,
  })

  const outputFile = fs.createWriteStream('request_audio.wav')
  writer.pipe(outputFile)
  for (const chunk of recordProcess.audioChunks) writer.write(chunk)
  writer.end()
}

resetRecording()
