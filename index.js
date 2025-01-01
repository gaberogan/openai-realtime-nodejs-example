import { VoiceAssistant } from './services/assistant.js'

const assistant = new VoiceAssistant()

process.on('SIGINT', () => {
  assistant.kill()
  process.exit(0)
})
