import { spawn } from 'child_process'

export class PulseAudio {
  constructor() {
    this.isAvailable = false
    this.spawn()
  }

  spawn() {
    try {
      const pulseaudio = spawn('pulseaudio', ['--start'])

      pulseaudio.on('error', (error) => {
        if (error.code === 'ENOENT') {
          console.log('PulseAudio is not installed - audio will still work but may have reduced quality')
          this.isAvailable = false
        } else {
          console.error('PulseAudio error:', error)
        }
      })

      pulseaudio.on('close', (code) => {
        if (code === 0) {
          console.log('PulseAudio started successfully')
          this.isAvailable = true
        }
      })
    } catch (error) {
      console.log('Failed to start PulseAudio:', error)
      this.isAvailable = false
    }
  }

  kill() {
    if (!this.isAvailable) return

    try {
      const kill = spawn('pulseaudio', ['-k'])

      kill.on('error', (error) => {
        console.error('Error killing PulseAudio:', error)
      })
    } catch (error) {
      console.error('Failed to kill PulseAudio:', error)
    }
  }
}
