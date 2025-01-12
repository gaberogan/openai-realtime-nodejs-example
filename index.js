import { VoiceAssistant } from './services/assistant.js'
import { PulseAudio } from './services/pulseaudio.js'

const pulseaudio = new PulseAudio()
const assistant = new VoiceAssistant()

process.on('SIGINT', () => {
  pulseaudio.kill()
  assistant.kill()
  process.exit(0)
})
