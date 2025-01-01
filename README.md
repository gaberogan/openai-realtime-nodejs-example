# OpenAI Realtime Node.js Minimal Example

This is a minimal example of a voice assistant written in Node.js.

Let's connect! Reach me at [gaberogan.com](https://gaberogan.com).

## Quickstart

1. Create `.env` with `OPENAI_API_KEY`
2. Install `sox` i.e. `brew install sox`
3. Install NVM + Node.js 22 (other versions untested)
4. Install pyenv + Python 3.12 (other versions untested)
5. Run `pip install -r requirements.txt`
6. Run `python download_models.py`
7. If using Raspberry Pi, use `speaker-arm64` instead of `speaker`
8. If using Raspberry Pi, download missing audio libraries
9. Run `npm i`
10. Run `npm start`
11. Say "Hey Jarvis, how are you?"
12. (optional) For more wake words, see https://github.com/fwartner/home-assistant-wakewords-collection

## Todo

1. Web search integration w/ OpenAI Realtime + Google API
2. Voice change response to sound like Jarvis
3. Use "Jarvis" wake word instead, may need TFLite
4. Echo cancellation w/ PulseAudio to allow interruptions

## Demo

https://github.com/user-attachments/assets/611013a8-8740-47f5-952c-3e4a6c80b267
