import "dotenv/config";
import WebSocket from "ws";
import record from "node-record-lpcm16";
import { fileURLToPath } from "url";
import { dirname } from "path";
import fs from "fs/promises";
import wav from "node-wav";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// WebSocket setup
let ws;

function setupWebSocket() {
  ws = new WebSocket("wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-12-17", {
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "OpenAI-Beta": "realtime=v1",
    },
  });

  // Setup event handlers
  ws.on("error", (error) => {
    console.error("WebSocket error:", error);
    stopRecording();
  });

  ws.on("close", () => {
    console.log("Disconnected from OpenAI Realtime API");
    stopRecording();
  });

  ws.on("message", handleMessage);

  return new Promise((resolve) => {
    ws.on("open", () => {
      console.log("Connected to OpenAI Realtime API");
      setupSession();
      resolve();
    });
  });
}

function setupSession() {
  // Configure the session
  const sessionConfig = {
    type: "session.update",
    session: {
      input_audio_format: "pcm16",
      output_audio_format: "pcm16",
      modalities: ["audio", "text"],
      instructions: "You are a helpful voice assistant. Please respond naturally to user queries.",
    },
  };
  ws.send(JSON.stringify(sessionConfig));
}

// Initialize WebSocket connection
setupWebSocket().catch((error) => {
  console.error("Failed to setup WebSocket:", error);
  process.exit(1);
});

// Recording settings for 16-bit PCM
const recordingOptions = {
  sampleRate: 24000,
  channels: 1,
  verbose: false,
  recordProgram: "sox",
  encoding: "signed-integer",
  bitwidth: 16,
};

let currentRecording = null;
let audioChunks = [];
let responseInProgress = false;

// WebSocket message handler
async function handleMessage(data) {
  const event = JSON.parse(data);
  // console.log("Event:", event.type);

  switch (event.type) {
    case "text.delta":
      // Handle incremental text updates
      process.stdout.write(event.delta);
      break;

    case "response.audio.delta":
      // Collect audio chunks
      const chunk = Buffer.from(event.delta, "base64");
      audioChunks.push(Buffer.from(chunk)); // Create a copy of the chunk
      break;

    case "response.created":
      responseInProgress = true;
      // Clear any leftover audio chunks from previous response
      audioChunks = [];
      break;

    case "response.audio.done":
      // Combine and play all audio chunks
      try {
        // Concatenate all chunks
        const audioData = Buffer.concat(audioChunks);

        // Play audio with sox
        const tempFile = `${__dirname}/temp_response.wav`;
        const header = Buffer.alloc(44);

        // WAV header for PCM16 format (little-endian)
        header.write("RIFF", 0);
        header.writeUInt32LE(36 + audioData.length, 4);
        header.write("WAVE", 8);
        header.write("fmt ", 12);
        header.writeUInt32LE(16, 16);
        header.writeUInt16LE(1, 20);
        header.writeUInt16LE(1, 22);
        header.writeUInt32LE(24000, 24);
        header.writeUInt32LE(32000, 28);
        header.writeUInt16LE(2, 32);
        header.writeUInt16LE(16, 34);
        header.write("data", 36);
        header.writeUInt32LE(audioData.length, 40);

        try {
          await fs.writeFile(tempFile, Buffer.concat([header, audioData]));
          await execAsync(`sox "${tempFile}" -d`);
        } catch (error) {
          console.error("Error playing audio:", error);
        } finally {
          await fs.unlink(tempFile);
        }

        // Reset state after successful playback
        audioChunks = [];
        responseInProgress = false;
      } catch (error) {
        console.error("Error processing complete audio:", error);
      }
      break;

    case "response.done":
      console.log("Response completed");
      break;

    case "input_audio_buffer.speech_started":
      console.log("Request started");
      break;

    case "input_audio_buffer.speech_stopped":
      console.log("Request completed");
      break;

    case "error":
      console.error("Error from API:", event.error);
      break;
  }
}

// Function to start recording
async function startRecording() {
  if (currentRecording) return;

  console.log("Starting recording...");
  audioChunks = []; // Clear any previous audio chunks

  try {
    currentRecording = record.record(recordingOptions).stream();

    // Handle data chunks
    currentRecording.on("data", (chunk) => {
      if (ws.readyState === WebSocket.OPEN) {
        const appendEvent = {
          type: "input_audio_buffer.append",
          audio: chunk.toString("base64"),
        };
        ws.send(JSON.stringify(appendEvent));
      }
    });

    currentRecording.on("error", (err) => {
      stopRecording();
    });

    currentRecording.on("end", () => {
      stopRecording();
    });
  } catch (error) {
    console.error("Error starting recording:", error);
    stopRecording();
  }
}

// Function to stop recording
async function stopRecording() {
  if (!currentRecording) return;
  console.log("Stopping recording...");
  currentRecording.removeAllListeners();
  currentRecording.destroy();
  currentRecording = null;
}

// Handle process termination
process.on("SIGINT", async () => {
  await stopRecording();
  if (ws.readyState === WebSocket.OPEN) {
    ws.close();
  }
  process.exit(0);
});

// Start recording automatically after WebSocket connection
ws.on("open", () => {
  console.log("\nVoice Assistant Ready! Recording started automatically.");
  console.log("Press Ctrl+C to exit\n");
  startRecording();
});
