# Imports
import pyaudio
import numpy as np
from openwakeword.model import Model
import wave
from collections import deque
import contextlib
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()
DEBUG = os.getenv('DEBUG', 'false').lower() == 'true'

# Declare globals
global model
global microphone
global audio_buffer
model: Model
microphone: pyaudio.Stream

# Declare constants
FORMAT = pyaudio.paInt16
CHANNELS = 1
RATE = 16000
CHUNK = 1280 # How many audio samples to predict on at once
FRAMEWORK = "onnx" # onnx or tflite

# Helper to suppress stderr noise on Raspberry Pi
@contextlib.contextmanager
def suppress_stderr():
    devnull = os.open(os.devnull, os.O_WRONLY)
    old_stderr = os.dup(2)
    os.dup2(devnull, 2)
    os.close(devnull)
    try:
        yield
    finally:
        os.dup2(old_stderr, 2)
        os.close(old_stderr)

# Initialize PyAudio
with suppress_stderr(): audio = pyaudio.PyAudio()

# Reset model and microphone
def reset():
    global model, microphone
    print("Listening for wake word")
    # Load pre-trained openwakeword models
    # Available optionsl: vad_threshold=0.5, enable_speex_noise_suppression=True
    model = Model(wakeword_models=["hey_jarvis_v0.1.onnx"], inference_framework=FRAMEWORK)
    # Microphone input
    microphone = audio.open(format=FORMAT, channels=CHANNELS, rate=RATE, input=True, frames_per_buffer=CHUNK)

def main():
    global model, microphone

    # Save last 1.5 seconds of audio
    saved_audio = deque(maxlen=int(RATE * 1.5))

    reset()

    while True:
        # Get audio
        audio_data = np.frombuffer(microphone.read(CHUNK), dtype=np.int16)
    
        # Save audio to buffer
        if DEBUG: saved_audio.extend(audio_data)

        # Feed to openWakeWord model and get prediction
        scores: dict[str, float] = model.predict(audio_data) # type: ignore

        # Check prediction score for wake word
        if scores["hey_jarvis_v0.1"] > 0.5:
            print("\nWake word detected")
            
            # Save the last second of audio
            if DEBUG:
                filename = f"wake_audio.wav"
                with wave.open(filename, 'wb') as file:
                    file.setnchannels(CHANNELS)
                    file.setsampwidth(audio.get_sample_size(FORMAT))
                    file.setframerate(RATE)
                    file.writeframes(np.array(list(saved_audio), dtype=np.int16).tobytes())
            
            # Clean up resources
            microphone.close()
            reset()

main()
