import { spawn } from 'child_process'
import { debounce } from 'lodash-es'

export class WakeWordDetector {
  constructor() {
    this.wakeListener = null

    // Initialize wake word process
    this.process = spawn('python', ['-u', 'wake.py'], {
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    this.process.stderr.pipe(process.stderr)

    // Listen for wake word detection in stdout
    this.process.stdout.on('data', (data) => {
      const output = data.toString()
      process.stdout.write(output) // Still show output in console
      if (output.includes('Wake word detected')) this.wakeListener?.()
    })
  }

  /**
   * Register a callback that runs when a wake word is detected.
   * Uses debounce to prevent multiple rapid callbacks.
   */
  onWakeWord(callback) {
    this.wakeListener = debounce(callback, 2000, { leading: true, trailing: false })
  }
}
