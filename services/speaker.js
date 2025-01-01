import os from 'os'

// Dynamic import for speaker based on platform
let Speaker
try {
  if (os.platform() === 'linux' && os.arch() === 'arm64') {
    Speaker = (await import('speaker-arm64')).default // Raspberry Pi
  } else {
    Speaker = (await import('speaker')).default
  }
} catch (_error) {
  throw new Error('Speaker module not found. Try running npm install again.')
}

export default Speaker
