import * as ort from 'onnxruntime-node'

// Configuration
const MODEL_NAME = 'hey jarvis'
const MODEL_PATH = './hey_jarvis_v0.1.onnx'
const MODEL_CHANNELS = 16
const PREDICTION_BUFFER_SIZE = 20

export default class OpenWakeWord {
  constructor() {
    this.session = null
    this.predictionBuffer = new Map()
    this.modelName = MODEL_NAME
    this.buffer = Buffer.alloc(0)
    this.samplesPerChunk = 96
    this.bytesPerSample = 2 // 16-bit = 2 bytes
  }

  async loadModel() {
    try {
      // Load ONNX model
      this.session = await ort.InferenceSession.create(MODEL_PATH)

      // Initialize prediction buffer
      this.predictionBuffer.set(this.modelName, Array(PREDICTION_BUFFER_SIZE).fill(0))
    } catch (error) {
      throw new Error('Error loading model', { cause: error })
    }
  }

  async predict(data) {
    // Append new data to buffer
    this.buffer = Buffer.concat([this.buffer, data])

    // Check if we have enough data for a chunk
    const bytesNeeded = this.samplesPerChunk * this.bytesPerSample
    if (this.buffer.length < bytesNeeded) {
      return 0 // Not enough data yet
    }

    // Extract chunk and update buffer
    const chunk = this.buffer.subarray(0, bytesNeeded)
    this.buffer = this.buffer.subarray(bytesNeeded)

    // Convert to Int16Array
    const audioData = new Int16Array(chunk.buffer, chunk.byteOffset, chunk.length / 2)
    try {
      // Convert audio data to float32 array
      const float32Data = new Float32Array(audioData.length * MODEL_CHANNELS)

      // Fill all channels with the same audio data
      for (let channel = 0; channel < MODEL_CHANNELS; channel++) {
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
      console.error('Error during prediction', { cause: error })
      return 0
    }
  }
}
