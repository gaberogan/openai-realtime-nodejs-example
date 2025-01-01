#!/usr/bin/env node

import { execSync } from 'child_process'
import os from 'os'

try {
  // Install the appropriate speaker package
  if (os.platform() === 'linux' && os.arch() === 'arm64') {
    console.log('Raspberry Pi detected - installing speaker-arm64')
    execSync('npm install speaker-arm64 --no-save', { stdio: 'inherit' })
  } else {
    console.log('Non-Raspberry Pi system detected - installing speaker')
    execSync('npm install speaker --no-save', { stdio: 'inherit' })
  }
} catch (error) {
  console.error('Error during speaker package installation:', error)
  process.exit(1)
}
