import { spawn } from 'child_process'

export default class Speaker {
  constructor({ sampleRate = 16000, bitDepth = 16, channels = 1, signed = true } = {}) {
    this.process = spawn('sox', [
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

    // Track when playback is finished
    this.process.stderr.on('data', (data) => {
      if (data.toString().includes('Done.')) {
        this.isFinished = true
      }
    })
  }

  write(chunk) {
    this.process.stdin.write(chunk)
  }
}
