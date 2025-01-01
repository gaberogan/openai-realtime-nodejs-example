import { spawn } from 'child_process'
import { debounce } from 'lodash-es'

let wakeListener = null

// Wake word process
export const wakeProcess = spawn('python', ['-u', 'wake.py'], {
  stdio: ['ignore', 'pipe', 'pipe'],
})
wakeProcess.stderr.pipe(process.stderr)

// Listen for wake word detection in stdout
wakeProcess.stdout.on('data', (data) => {
  const output = data.toString()
  process.stdout.write(output) // Still show output in console
  if (output.includes('Wake word detected')) wakeListener?.()
})

/**
 * Register a callback that runs when a wake word is detected.
 * Uses debounce to prevent multiple rapid callbacks.
 */
export function onWakeWord(callback) {
  wakeListener = debounce(callback, 2000, { leading: true, trailing: false })
}
