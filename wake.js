// Copyright 2022 David Scripka. All rights reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import * as ort from 'onnxruntime-node'
import { spawn } from 'child_process'
import path from 'path'

// Configuration
const CHUNK_SIZE = 96
const SAMPLE_RATE = 16000

class WakeWordDetector {
  constructor() {
    this.session = null
    this.predictionBuffer = new Map()
    this.modelName = 'hey jarvis'
  }

  async loadModel() {
    try {
      // Load ONNX model
      const modelPath = path.join(
        process.env.HOME,
        '.pyenv/versions/jarvis/lib/python3.12/site-packages/openwakeword/resources/models/hey_jarvis_v0.1.onnx',
      )
      this.session = await ort.InferenceSession.create(modelPath)

      // Initialize prediction buffer
      this.predictionBuffer.set(this.modelName, Array(20).fill(0))

      return true
    } catch (error) {
      console.error('Error loading model:', error)
      return false
    }
  }

  async predict(audioData) {
    try {
      // Convert audio data to float32 array
      const float32Data = new Float32Array(audioData.length * 16) // 16 channels

      // Fill all 16 channels with the same audio data
      for (let channel = 0; channel < 16; channel++) {
        for (let i = 0; i < audioData.length; i++) {
          // Convert 16-bit integer to float32 (-1 to 1 range)
          float32Data[channel * audioData.length + i] = audioData[i] / 32768.0
        }
      }

      // Create tensor with shape [1, 16, 96] as expected by the model (batch_size, channels, samples)
      const tensor = new ort.Tensor('float32', float32Data, [1, 16, audioData.length])

      // Run inference with correct input name
      const feeds = { 'x.1': tensor }
      const results = await this.session.run(feeds)

      // Get prediction score from results
      // Log available output names for debugging
      const outputNames = Object.keys(results)
      if (outputNames.length === 0) {
        console.error('No output tensors found in results')
        return 0
      }

      // Use first output tensor if output_1 is not available
      const outputTensor = results[outputNames[0]]
      if (!outputTensor || !outputTensor.data) {
        console.error('Invalid output tensor structure')
        return 0
      }

      const score = outputTensor.data[0]

      // Update prediction buffer
      const buffer = this.predictionBuffer.get(this.modelName)
      buffer.shift()
      buffer.push(score)

      return score
    } catch (error) {
      console.error('Error during prediction:', error)
      return 0
    }
  }
}

async function main() {
  // Initialize wake word detector
  const detector = new WakeWordDetector()
  const modelLoaded = await detector.loadModel()

  if (!modelLoaded) {
    console.error('Failed to load model')
    process.exit(1)
  }

  // Start sox process for audio input
  const sox = spawn('sox', [
    '-d', // Use default input device
    '-t',
    'raw', // Output raw audio
    '-r',
    '16000', // Sample rate 16kHz
    '-b',
    '16', // Bit depth 16
    '-c',
    '1', // Mono channel
    '-e',
    'signed', // Signed integers
    '-q', // Quiet mode
    '-', // Output to stdout
  ])

  // Print header
  console.log('\n')
  console.log('#'.repeat(100))
  console.log('Listening for wakewords...')
  console.log('#'.repeat(100))
  console.log('\n'.repeat(3))

  // Buffer for audio chunks
  let buffer = Buffer.alloc(0)
  const chunkSize = CHUNK_SIZE * 2 // 2 bytes per sample for 16-bit audio

  // Process audio data
  sox.stdout.on('data', async (data) => {
    // Append new data to buffer
    buffer = Buffer.concat([buffer, data])

    // Process complete chunks
    while (buffer.length >= chunkSize) {
      // Extract chunk
      const chunk = buffer.slice(0, chunkSize)
      buffer = buffer.slice(chunkSize)

      // Convert to Int16Array
      const audioData = new Int16Array(chunk.buffer, chunk.byteOffset, chunk.length / 2)

      // Get prediction
      const score = await detector.predict(audioData)

      // Format output
      const modelName = detector.modelName
      const spaces = ' '.repeat(16 - modelName.length)
      const scoreStr = Math.abs(score).toFixed(5)
      const status = score <= 0.5 ? '--' + ' '.repeat(20) : 'Wakeword Detected!'

      // Clear previous line and print results
      process.stdout.write('\x1B[F'.repeat(5))
      console.log(`
            Model Name         | Score | Wakeword Status
            --------------------------------------
            ${modelName}${spaces}   | ${scoreStr} | ${status}
            `)
    }
  })

  // Handle errors
  sox.stderr.on('data', (data) => {
    console.error(`Sox error: ${data}`)
  })

  sox.on('close', (code) => {
    console.log(`Sox process exited with code ${code}`)
  })

  // Cleanup on exit
  process.on('SIGINT', () => {
    sox.kill()
    process.exit()
  })
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error)
}