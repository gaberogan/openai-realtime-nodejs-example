import fs from 'fs'
import wav from 'wav'
import { spawn } from 'child_process'
import { BIT_DEPTH, SAMPLE_RATE } from './constants.js'

// Start continuous recording
export const recordProcess = spawn('sox', [
  '-d', // Use default input device
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

// Handle errors
recordProcess.stderr.on('data', (data) => {
  console.error('Sox error:', data.toString())
})

export function resetRecording() {
  recordProcess.audioChunks = []
  recordProcess.hasSpoken = false
  recordProcess.startTime = Date.now()
}

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
