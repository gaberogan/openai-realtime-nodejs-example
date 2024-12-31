# Imports
import pyaudio
import numpy as np
from openwakeword.model import Model # type: ignore

# Declare globals
global owwModel
global mic_stream
owwModel: Model = None  # type: ignore
mic_stream: pyaudio.Stream = None  # type: ignore

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
    global owwModel, mic_stream
    
    print("Listening for wake word...")

    try:
        while True:
            # Get audio
            audio_buffer = np.frombuffer(mic_stream.read(CHUNK), dtype=np.int16)

            # Feed to openWakeWord model and get prediction
            prediction = owwModel.predict(audio_buffer)
            scores: dict[str, float] = prediction  # type: ignore

            # Check prediction score for wake word
            if scores["hey_jarvis_v0.1"] > 0.5:
                print("\nWake word detected! Exiting...")
                # Clean up resources
                mic_stream.close()
                audio.terminate()
                exit(0)

    except KeyboardInterrupt:
        print("\nGracefully shutting down...")
        # Clean up resources
        if mic_stream is not None:
            mic_stream.close()
        audio.terminate()
        exit(0)

main()
