# OpenAI Realtime Node.js Minimal Example

This is a minimal example of a voice assistant written in Node.js.

Let's connect! Reach me at [gaberogan.com](https://gaberogan.com).

## Quickstart

1. Create `.env` with `OPENAI_API_KEY`
2. Install `sox` i.e. `brew install sox`
3. Install PulseAudio (optional) - will be automatically started if installed
4. Install NVM + Node.js 22 (other versions untested)
5. Install pyenv + Python 3.12 (other versions untested)
6. Run `pip install -r requirements.txt`
7. Run `python download_models.py`
8. If using Raspberry Pi, use `speaker-arm64` instead of `speaker`
9. If using Raspberry Pi, download missing audio libraries
10. Run `npm i`
11. Run `npm start`
12. Say "Hey Jarvis, how are you?"
13. (optional) For more wake words, see https://github.com/fwartner/home-assistant-wakewords-collection

## PulseAudio Echo Cancellation Setup on Raspberry Pi

To enable echo cancellation (allows interrupting while speaking):

1. Create/edit PulseAudio config:

```bash
echo -e ".include /etc/pulse/default.pa\n\nload-module module-echo-cancel.so aec_method=webrtc source_name=echocancel_source sink_name=echocancel_sink" > ~/.config/pulse/default.pa
```

2. Restart PulseAudio:

```bash
pulseaudio -k && pulseaudio --start
```

3. Verify it's working:

```bash
pacmd list-modules | grep echo-cancel
```

4. Test echo cancellation:

```bash
node scripts/test_aec.js
```

This will play a test tone and record simultaneously, saving the recording to `aec_test_recording.wav`. If echo cancellation is working properly, the recorded file should have minimal to no echo of the test tone.

## Todo

1. Implement a memory tool to save things like location to memory
2. Use "Jarvis" wake word instead, may need TFLite

## Demo

[![Demo Video](https://img.youtube.com/vi/5LRYqHRducE/0.jpg)](https://www.youtube.com/watch?v=5LRYqHRducE)
