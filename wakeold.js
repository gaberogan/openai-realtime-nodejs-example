import 'dotenv/config'
import { Porcupine } from '@picovoice/porcupine-node'
import record from 'node-record-lpcm16'

const accessKey = process.env.PICOVOICE_API_KEY

let porcupine = new Porcupine(accessKey, ['JarvisMac.ppn'], [0.7])

// Configure recorder to match Porcupine requirements
const recorder = record.record({
  sampleRate: porcupine.sampleRate,
  channels: 1,
})

// Buffer to store audio data
let audioBuffer = Buffer.alloc(0)

// Set up stream handling
const recordStream = recorder.stream()
recordStream.on('data', (chunk) => {
  console.log(1)
  audioBuffer = Buffer.concat([audioBuffer, chunk])
})

function getNextAudioFrame() {
  // Wait until we have enough data for a full frame
  if (audioBuffer.length >= porcupine.frameLength * 2) {
    // *2 because Int16 = 2 bytes
    // Extract frame and update buffer
    const frameBuffer = audioBuffer.slice(0, porcupine.frameLength * 2)
    audioBuffer = audioBuffer.slice(porcupine.frameLength * 2)

    // Convert to Int16Array as required by Porcupine
    return new Int16Array(frameBuffer.buffer, frameBuffer.byteOffset, porcupine.frameLength)
  }
  return null
}

// Main detection loop
setInterval(() => {
  const audioFrame = getNextAudioFrame()
  if (audioFrame) {
    const keywordIndex = porcupine.process(audioFrame)
    if (keywordIndex === 0) {
      console.log('Detected: Jarvis')
    }
  }
}, 10) // Check for new frames every 10ms
