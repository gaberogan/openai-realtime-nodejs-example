import { spawn } from 'child_process'
import fs from 'fs'
import wav from 'wav'
import { BIT_DEPTH, SAMPLE_RATE } from '../services/constants.js'

class TestAEC {
  constructor() {
    this.setupRecording()
    this.setupPlayback()
    this.setupErrorHandling()
  }

  setupErrorHandling() {
    // Handle process errors gracefully
    process.on('uncaughtException', (err) => {
      console.error('Uncaught error:', err.message)
      this.cleanup()
    })
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
      try {
        this.writer.write(chunk)
      } catch (err) {
        console.error('Error writing recording:', err.message)
      }
    })

    this.recordProcess.stderr.on('data', (data) => {
      console.error('Recording error:', data.toString())
    })

    this.recordProcess.on('error', (err) => {
      console.error('Record process error:', err.message)
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

    // Handle process errors
    this.playProcess.on('error', (err) => {
      console.error('Play process error:', err.message)
    })

    this.speakerProcess.on('error', (err) => {
      console.error('Speaker process error:', err.message)
    })

    // Handle stderr output
    this.playProcess.stderr.on('data', (data) => {
      console.error('Play process stderr:', data.toString())
    })

    this.speakerProcess.stderr.on('data', (data) => {
      console.error('Speaker process stderr:', data.toString())
    })

    // Pipe generated tone to speaker with error handling
    this.playProcess.stdout.on('error', (err) => {
      console.error('Play stdout error:', err.message)
    })

    this.speakerProcess.stdin.on('error', (err) => {
      if (err.code === 'EPIPE') {
        console.log('Speaker process closed the pipe - this is normal on completion')
      } else {
        console.error('Speaker stdin error:', err.message)
      }
    })

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

    // Cleanup processes in order
    if (this.playProcess) {
      this.playProcess.kill()
    }

    if (this.speakerProcess) {
      this.speakerProcess.stdin.end()
      this.speakerProcess.kill()
    }

    if (this.recordProcess) {
      this.recordProcess.kill()
    }

    // End the writer stream properly
    if (this.writer) {
      this.writer.end()
    }

    // Give processes time to clean up before exiting
    setTimeout(() => {
      process.exit(0)
    }, 500)
  }
}

console.log('Starting AEC test...')
console.log('Playing a test tone and recording simultaneously...')
console.log('This will test if echo cancellation is working properly.')
new TestAEC()
