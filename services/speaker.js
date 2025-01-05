import { spawn } from 'child_process'

export default class Speaker {
  constructor({ sampleRate = 16000, bitDepth = 16, channels = 1, signed = true } = {}) {
    this.process = spawn('sox', [
      '-V0', // Suppress warnings
      '-q', // Quiet mode
      '-t',
      'raw', // Input format is raw audio
      '-r',
      sampleRate,
      '-b',
      bitDepth,
      '-c',
      channels,
      '-e',
      signed ? 'signed' : 'unsigned', // Signed/unsigned integers
      '-', // Read from stdin
      '-d', // Output to default audio device
    ])

    // Error handling
    this.process.stderr.on('data', (data) => {
      console.error('Speaker Error:', data)
    })
  }

  write(chunk) {
    this.process.stdin.write(chunk)
  }
}
