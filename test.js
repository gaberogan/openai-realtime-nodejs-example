import Speaker from "speaker";
import Recorder from "node-record-lpcm16";

const recording = Recorder.record({
  sampleRate: 24000,
  channels: 1,
  threshold: 1.0,
}).stream();

// Create the Speaker instance
const speaker = new Speaker({
  channels: 1, // Match recorder's single channel
  bitDepth: 16, // 16-bit samples
  sampleRate: 24000, // Match recorder's sample rate
});

speaker.addListener("drain", () => {
  console.log("XXXXXX");
});

// Pipe the recording stream to the speaker
recording.pipe(speaker);

// Stop recording after 2 seconds
setTimeout(() => {
  console.log("Stopping recording...");
  recording.unpipe(speaker);
  // recording.destroy();
  // speaker.end();
}, 2000);
