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
global owwModel
global mic_stream
global audio_buffer
owwModel: Model
mic_stream: pyaudio.Stream

# Get microphone stream
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
with suppress_stderr():
    audio = pyaudio.PyAudio()

# Store last second of audio
audio_buffer = deque(maxlen=int(RATE))

# Initialize model and microphone
def initialize():
    global owwModel, mic_stream
    # Load pre-trained openwakeword models
    # Available optionsl: vad_threshold=0.5, enable_speex_noise_suppression=True
    owwModel = Model(wakeword_models=["hey_jarvis_v0.1.onnx"], inference_framework=FRAMEWORK)
    # Microphone input
    mic_stream = audio.open(format=FORMAT, channels=CHANNELS, rate=RATE, input=True, frames_per_buffer=CHUNK)

initialize()

def main():
    global owwModel, mic_stream
    
    print("Listening for wake word")

    try:
        while True:
            # Get audio
            audio_chunk = mic_stream.read(CHUNK)
            audio_data = np.frombuffer(audio_chunk, dtype=np.int16)
            
            # Add to rolling buffer (to save to file later)
            audio_buffer.extend(audio_data)

            # Feed to openWakeWord model and get prediction
            prediction = owwModel.predict(audio_data)
            scores: dict[str, float] = prediction # type: ignore

            # Check prediction score for wake word
            if scores["hey_jarvis_v0.1"] > 0.5:
                print("\nWake word detected")
                
                # Save the last second of audio if DEBUG is true
                if DEBUG:
                    filename = f"wake_audio.wav"
                    with wave.open(filename, 'wb') as wf:
                        wf.setnchannels(CHANNELS)
                        wf.setsampwidth(audio.get_sample_size(FORMAT))
                        wf.setframerate(RATE)
                        wf.writeframes(np.array(list(audio_buffer), dtype=np.int16).tobytes())
                
                # Clean up resources
                mic_stream.close()
                initialize()

    except KeyboardInterrupt:
        print("\nGracefully shutting down...")
        # Clean up resources
        if mic_stream is not None:
            mic_stream.close()
        audio.terminate()
        exit(0)

main()
