import "dotenv/config";
import WebSocket from "ws";
import record from "node-record-lpcm16";
import Speaker from "speaker";

const socket = new WebSocket("wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-12-17", {
  headers: {
    Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    "OpenAI-Beta": "realtime=v1",
  },
});

socket.on("error", (error) => {
  console.error("WebSocket error:", error);
});

socket.on("open", () => {
  console.log("WebSocket connected");

  // Start conversation
  socket.send(
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
});

socket.on("message", handleMessage);


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
let responseInProgress = false;
let currentSpeaker = null;

// WebSocket message handler
async function handleMessage(data) {
  const event = JSON.parse(data);
  // console.log("Event:", event.type);

  switch (event.type) {
    case "response.audio.delta":
      const chunk = Buffer.from(event.delta, "base64");
      currentSpeaker?.write(chunk);
      break;

    case "response.created":
      console.log("Response start");
      responseInProgress = true;
      stopRecording();
      // Initialize speaker for new response
      currentSpeaker = new Speaker({
        channels: 1,
        bitDepth: 16,
        sampleRate: 24000,
        signed: true,
      });
      break;

    case "response.audio.done":
      // Wait for speaker buffer to empty before ending stream
      currentSpeaker?.addListener("drain", () => {
        console.log("Response end");
        currentSpeaker.end();
        currentSpeaker = null;
        responseInProgress = false;
        startRecording(); // Resume recording after response
      });
      break;

    case "input_audio_buffer.speech_started":
      console.log("Request start");
      break;

    case "input_audio_buffer.speech_stopped":
      console.log("Request end");
      break;

    case "error":
      console.error("Error from API:", event.error);
      break;
  }
}

// Function to start recording
async function startRecording() {
  if (currentRecording || responseInProgress) return;

  console.log("Starting recording...");

  try {
    currentRecording = record.record(recordingOptions).stream();

    // Handle data chunks
    currentRecording.on("data", (chunk) => {
      if (socket.readyState === WebSocket.OPEN && !responseInProgress) {
        const appendEvent = {
          type: "input_audio_buffer.append",
          audio: chunk.toString("base64"),
        };
        socket.send(JSON.stringify(appendEvent));
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
  if (socket.readyState === WebSocket.OPEN) {
    socket.close();
  }
  process.exit(0);
});

// Start recording automatically after WebSocket connection
socket.on("open", () => {
  console.log("\nVoice Assistant Ready! Recording started automatically.");
  console.log("Press Ctrl+C to exit\n");
  startRecording();
});
