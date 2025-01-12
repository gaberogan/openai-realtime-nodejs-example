import { spawn } from 'child_process'
import fs from 'fs'
import wav from 'wav'
import { BIT_DEPTH, SAMPLE_RATE } from '../services/constants.js'

class TestAEC {
  constructor() {
    this.setupRecording()
    this.setupPlayback()
  }

  setupRecording() {
    // Create WAV writer for saving the recording
    this.writer = new wav.Writer({
      channels: 1,
      sampleRate: SAMPLE_RATE,
      bitDepth: BIT_DEPTH,
    })

    // Create output file stream
    const outputFile = fs.createWriteStream('aec_test_recording.wav')
    this.writer.pipe(outputFile)

    // Start recording process
    this.recordProcess = spawn('sox', [
      '-d', // Use default input device
      '-V0', // Suppress warnings
      '-t',
      'raw', // Output raw audio
      '--buffer',
      '400', // Small buffer for better latency
      '-r',
      SAMPLE_RATE,
      '-b',
      BIT_DEPTH,
      '-c',
      '1', // Mono channel
      '-e',
      'signed',
      '-q',
      '-', // Output to stdout
    ])

    // Write recorded audio to file
    this.recordProcess.stdout.on('data', (chunk) => {
      this.writer.write(chunk)
    })

    this.recordProcess.stderr.on('data', (data) => {
      console.error('Recording error:', data.toString())
    })
  }

  setupPlayback() {
    // Create a process that generates a test tone and plays it
    this.playProcess = spawn('sox', [
      '-n', // Generate audio
      '-t',
      'raw',
      '-r',
      SAMPLE_RATE,
      '-b',
      BIT_DEPTH,
      '-c',
      '1',
      '-e',
      'signed',
      '-', // Output to stdout
      'synth',
      '3', // Duration in seconds
      'sine',
      '1000', // Frequency in Hz
      'gain',
      '-10', // Reduce volume to prevent clipping
    ])

    // Create speaker process
    this.speakerProcess = spawn('sox', [
      '-t',
      'raw',
      '-r',
      SAMPLE_RATE,
      '-b',
      BIT_DEPTH,
      '-c',
      '1',
      '-e',
      'signed',
      '-', // Read from stdin
      '-d', // Output to default audio device
    ])

    // Pipe generated tone to speaker
    this.playProcess.stdout.pipe(this.speakerProcess.stdin)

    // Handle completion
    this.playProcess.on('close', () => {
      console.log('Playback finished')
      setTimeout(() => {
        this.cleanup()
      }, 1000) // Wait a bit to capture any potential echo
    })
  }

  cleanup() {
    console.log('Test complete. Recording saved to aec_test_recording.wav')
    this.recordProcess.kill()
    this.speakerProcess.kill()
    this.writer.end()
    process.exit(0)
  }
}

console.log('Starting AEC test...')
console.log('Playing a test tone and recording simultaneously...')
console.log('This will test if echo cancellation is working properly.')
new TestAEC()
