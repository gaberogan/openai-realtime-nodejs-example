import wave
import numpy as np
from openwakeword.model import Model

# Run python scripts/test_recording.py
# to test the most recent wake word activation

def test_recording(filename="wake_audio.wav"):
    # Load the wake word model
    model = Model(wakeword_models=["hey_jarvis_v0.1.onnx"], inference_framework="onnx")
    
    # Open and read the WAV file
    with wave.open(filename, 'rb') as wf:
        # Verify audio format matches expectations
        if wf.getnchannels() != 1 or wf.getsampwidth() != 2 or wf.getframerate() != 16000:
            print(f"Warning: Audio format differs from expected (mono, 16-bit, 16kHz)")
            print(f"Channels: {wf.getnchannels()}, Sample width: {wf.getsampwidth()}, Rate: {wf.getframerate()}")
        
        # Read the entire audio file
        audio_data = wf.readframes(wf.getnframes())
        audio_array = np.frombuffer(audio_data, dtype=np.int16)
        
        # Process audio in chunks matching the original detection size
        chunk_size = 1280
        max_score = 0
        
        for i in range(0, len(audio_array), chunk_size):
            chunk = audio_array[i:i + chunk_size]
            if len(chunk) == chunk_size:  # Only process full chunks
                prediction = model.predict(chunk)
                scores: dict[str, float] = prediction  # type: ignore
                score = scores["hey_jarvis_v0.1"]
                max_score = max(max_score, score)
                
                if score > 0.5:
                    print(f"\nWake word detected in recording!")
                    print(f"Detection score: {score:.3f}")
                    return True
        
        print(f"\nNo wake word detected in recording")
        print(f"Maximum detection score: {max_score:.3f}")
        return False

test_recording()
