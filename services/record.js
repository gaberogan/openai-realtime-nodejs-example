import fs from 'fs'
import wav from 'wav'
import { spawn } from 'child_process'
import { BIT_DEPTH, SAMPLE_RATE } from './constants.js'

const NUM_SECONDS = 1
const BUFFER_SIZE = SAMPLE_RATE * (BIT_DEPTH / 8) * NUM_SECONDS

export class Recording {
  constructor() {
    // Buffer to store the last N seconds of audio
    const audioBuffer = {
      buffer: Buffer.alloc(0),
      append: (chunk) => {
        audioBuffer.buffer = Buffer.concat([audioBuffer.buffer, chunk])
        if (audioBuffer.buffer.length > BUFFER_SIZE) {
          audioBuffer.buffer = audioBuffer.buffer.subarray(-BUFFER_SIZE)
        }
      },
      getAndClear: () => {
        const result = audioBuffer.buffer
        audioBuffer.buffer = Buffer.alloc(0)
        return result
      },
    }
    this.audioBuffer = audioBuffer

    // Run sox to record audio
    this.process = spawn('sox', [
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

    // Fill audio buffer
    this.process.stdout.on('data', (chunk) => {
      this.audioBuffer.append(chunk)
    })

    // Handle errors
    this.process.stderr.on('data', (data) => {
      console.error('Sox error:', data.toString())
    })

    this.resetRecording()
  }

  /** Reset the state of the recording */
  resetRecording() {
    this.audioChunks = []
    this.hasSpoken = false
    this.startTime = Date.now()
  }

  /** Save the recording to a file */
  saveRecording() {
    const writer = new wav.Writer({
      channels: 1,
      sampleRate: SAMPLE_RATE,
      bitDepth: BIT_DEPTH,
    })

    const outputFile = fs.createWriteStream('request_audio.wav')
    writer.pipe(outputFile)
    for (const chunk of this.audioChunks) writer.write(chunk)
    writer.end()
  }
}
