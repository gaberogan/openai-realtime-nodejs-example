export const DEBUG = Boolean(process.env.DEBUG)
export const BIT_DEPTH = 16
export const SAMPLE_RATE = 24000
export const VOICE = process.env.VOICE || 'ash'
export const MODEL = process.env.MODEL || 'gpt-4o-mini-realtime-preview-2024-12-17'
export const SLEEP_TIMEOUT = Number(process.env.SLEEP_TIMEOUT || '3.5')
