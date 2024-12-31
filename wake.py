# Imports
import pyaudio
import numpy as np
import subprocess
from openwakeword.model import Model # type: ignore

# Declare globals
global owwModel
global mic_stream
global nodejs_process
owwModel: Model = None  # type: ignore
mic_stream: pyaudio.Stream = None  # type: ignore
nodejs_process = None

# Get microphone stream
FORMAT = pyaudio.paInt16
CHANNELS = 1
RATE = 16000
CHUNK = 1280 # How many audio samples to predict on at once
FRAMEWORK = "onnx" # onnx or tflite
audio = pyaudio.PyAudio()

# Initialize model and microphone
def initialize():
    global owwModel, mic_stream
    # Load pre-trained openwakeword models
    owwModel = Model(wakeword_models=["hey_jarvis_v0.1.onnx"], inference_framework=FRAMEWORK)
    # Microphone input
    mic_stream = audio.open(format=FORMAT, channels=CHANNELS, rate=RATE, input=True, frames_per_buffer=CHUNK)

initialize()

def main():
    global owwModel, mic_stream, nodejs_process
    
    # Generate output string header
    print("Listening for wakewords...")

    try:
        while True:
            # Skip wake word detection if Node.js is running
            if nodejs_process is not None and nodejs_process.poll() is None:
                continue

            # Get audio
            audio_buffer = np.frombuffer(mic_stream.read(CHUNK), dtype=np.int16)

            # Feed to openWakeWord model and get prediction
            prediction = owwModel.predict(audio_buffer)
            scores: dict[str, float] = prediction  # type: ignore

            # Check prediction score for wake word
            if scores["hey_jarvis_v0.1"] > 0.5:
                print("\nWake word detected! Starting voice assistant...")
                mic_stream.close()
                # Spawn app.js and wait for it to complete
                try:
                    nodejs_process = subprocess.Popen(['node', 'app.js'])
                    nodejs_process.wait()
                    nodejs_process = None
                    print("\nVoice assistant closed. Resuming wake word detection...")
                finally:
                    initialize()

    except KeyboardInterrupt:
        print("\nGracefully shutting down...")
        # Clean up resources
        if mic_stream is not None:
            mic_stream.close()
        if nodejs_process is not None:
            nodejs_process.terminate()
        audio.terminate()
        exit(0)

if __name__ == "__main__":
    main()
