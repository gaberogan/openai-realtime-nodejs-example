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
const DEBUG = process.env.DEBUG === "true";

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
    cleanup();
  });

  ws.on("close", () => {
    console.log("Disconnected from OpenAI Realtime API");
    cleanup();
  });

  ws.on("message", handleMessage);

  return new Promise((resolve, reject) => {
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
  sampleRate: 16000,
  channels: 1,
  verbose: false,
  recordProgram: "sox",
  encoding: "signed-integer",
  bitwidth: 16,
};

let isRecording = false;
let currentRecording = null;
let audioChunks = [];
let intentionalStop = false;
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
        header.writeUInt32LE(16000, 24);
        header.writeUInt32LE(32000, 28);
        header.writeUInt16LE(2, 32);
        header.writeUInt16LE(16, 34);
        header.write("data", 36);
        header.writeUInt32LE(audioData.length, 40);

        try {
          // Write WAV file
          await fs.writeFile(tempFile, Buffer.concat([header, audioData]));
          console.log("Wrote WAV file to:", tempFile);

          // Try playing with sox first
          try {
            await execAsync(`sox "${tempFile}" -d`);
          } catch (soxError) {
            console.log("Falling back to afplay");
            await execAsync(`afplay "${tempFile}"`);
          }
        } catch (error) {
          console.error("Error playing audio:", error);
        } finally {
          // Keep file in debug mode, otherwise clean up
          if (!DEBUG) {
            try {
              await fs.unlink(tempFile);
            } catch (cleanupError) {
              console.error("Error cleaning up temp file:", cleanupError);
            }
          } else {
            console.log("Debug mode: Keeping WAV file at", tempFile);
            // Save with timestamp for debugging
            const debugFile = `${__dirname}/debug_${Date.now()}.wav`;
            await fs.copyFile(tempFile, debugFile);
            console.log("Saved debug copy to:", debugFile);
          }
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
      // Don't reset state here - wait for audio playback to complete
      break;

    case "input_audio_buffer.speech_started":
      console.log("Speech detected in input audio");
      // Create response when speech is detected
      if (ws.readyState === WebSocket.OPEN && !responseInProgress) {
        console.log("Creating new response");
        ws.send(
          JSON.stringify({
            type: "response.create",
            response: {
              modalities: ["audio", "text"],
              output_audio_format: "pcm16",
            },
          })
        );
      }
      break;

    case "input_audio_buffer.speech_stopped":
      console.log("Speech ended in input audio");
      break;

    case "error":
      console.error("Error from API:", event.error);
      break;
  }
}

// Function to start recording
async function startRecording() {
  if (isRecording) return;

  console.log("Starting recording...");
  isRecording = true;
  intentionalStop = false;
  audioChunks = []; // Clear any previous audio chunks

  try {
    console.log("Initializing recording stream...");
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

    // Only log errors if not intentionally stopping
    currentRecording.on("error", (err) => {
      if (!intentionalStop) {
        console.error("Recording error:", err);
      }
      cleanup();
    });

    currentRecording.on("end", () => {
      if (!intentionalStop) {
        console.log("Recording ended");
      }
      cleanup();
    });
  } catch (error) {
    console.error("Error starting recording:", error);
    cleanup();
  }
}

// Function to stop recording
async function stopRecording() {
  if (!isRecording) return;

  console.log("Stopping recording...");
  intentionalStop = true;

  // Stop the recording stream first
  cleanup();

  if (ws.readyState === WebSocket.OPEN) {
    // Wait a moment for any final audio chunks to be processed
    await new Promise((resolve) => setTimeout(resolve, 100));

    console.log("Committing audio buffer...");
    ws.send(
      JSON.stringify({
        type: "input_audio_buffer.commit",
      })
    );
  }
}

// Cleanup function to handle recording state
function cleanup() {
  if (currentRecording) {
    try {
      currentRecording.removeAllListeners();
      currentRecording.destroy();
    } catch (error) {
      if (!intentionalStop) {
        console.error("Error cleaning up recording:", error);
      }
    }
    currentRecording = null;
  }
  isRecording = false;
  intentionalStop = false;
}

// Handle user input to start/stop recording
process.stdin.on("data", async (data) => {
  const input = data.toString().trim().toLowerCase();

  if (input === "start") {
    if (ws.readyState !== WebSocket.OPEN) {
      console.log("Reconnecting to API...");
      await setupWebSocket();
    }
    startRecording();
  } else if (input === "stop") {
    await stopRecording();
  } else if (input === "quit") {
    await stopRecording();
    if (ws.readyState === WebSocket.OPEN) {
      ws.close();
    }
    process.exit(0);
  }
});

// Handle process termination
process.on("SIGINT", async () => {
  console.log("\nShutting down...");
  await stopRecording();
  if (ws.readyState === WebSocket.OPEN) {
    ws.close();
  }
  process.exit(0);
});

console.log("\nVoice Assistant Ready!");
console.log("Commands:");
console.log("  start - Start recording");
console.log("  stop  - Stop recording");
console.log("  quit  - Exit the program\n");
