import "dotenv/config";
import WebSocket from "ws";
import record from "node-record-lpcm16";
import Speaker from "speaker";

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
  ws.send(
    JSON.stringify({
      type: "session.update",
      session: {
        input_audio_format: "pcm16",
        output_audio_format: "pcm16",
        modalities: ["audio", "text"],
        instructions:
          "You are a helpful voice assistant. Please respond naturally to user queries.",
      },
    })
  );
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
        // Combine all audio chunks into a single buffer
        const audioData = Buffer.concat(audioChunks);

        // Create a speaker instance with the correct audio format
        const speaker = new Speaker({
          channels: 1,
          bitDepth: 16,
          sampleRate: 24000,
          signed: true,
        });

        try {
          // Write the audio data directly to the speaker
          speaker.write(audioData);

          // End the speaker stream when done
          speaker.end();
        } catch (error) {
          console.error("Error playing audio:", error);
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
