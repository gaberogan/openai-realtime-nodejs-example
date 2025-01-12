import { spawn } from 'child_process'
import { EventEmitter } from 'events'
import { BIT_DEPTH, SAMPLE_RATE } from './constants.js'

/**
 * @example
 * const speaker = new Speaker()
 * speaker.write(data)
 * speaker.writeEnd()
 * speaker.once('finished', () => console.log('All sound has been played'))
 */
export default class Speaker extends EventEmitter {
  constructor({ sampleRate = SAMPLE_RATE, bitDepth = BIT_DEPTH, channels = 1, signed = true } = {}) {
    super()

    this.sampleRate = sampleRate
    this.bitDepth = bitDepth
    this.channels = channels
    this.signed = signed

    this._respawn()
  }

  /**
   * Kill and recreate sox process
   */
  _respawn() {
    // Kill sox process
    this.process?.kill()

    // Create sox process
    this.process = spawn('sox', [
      '-t',
      'raw', // Input format is raw audio
      '-r',
      this.sampleRate,
      '-b',
      this.bitDepth,
      '-c',
      this.channels,
      '-e',
      this.signed ? 'signed' : 'unsigned', // Signed/unsigned integers
      '-', // Read from stdin
      '-d', // Output to default audio device
    ])

    // Kill and recreate sox process when all sound has been played
    this.process.stderr.on('data', (data) => {
      if (data.toString().includes('Done.')) {
        this.emit('finished')
        this._respawn()
      }
    })
  }

  /**
   * Send raw audio bytes to sox
   */
  write(chunk) {
    this.process.stdin.write(chunk)
  }

  /**
   * Signal to Sox we will write no more data.
   * Sox can then tell us when it flushed everything to the speaker.
   */
  writeEnd() {
    this.process.stdin.end()
  }
}
