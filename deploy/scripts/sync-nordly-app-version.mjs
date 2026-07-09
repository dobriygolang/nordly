#!/usr/bin/env node
/**
 * Sync Nordly desktop version across manifest files (CI + post-release main sync).
 *
 * Usage:
 *   node deploy/scripts/sync-nordly-app-version.mjs --version 0.0.12
 *   node deploy/scripts/sync-nordly-app-version.mjs --tag nordly-v0.0.12
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const appDir = path.join(repoRoot, 'apps/nordly')

function usage() {
  console.error('Usage: sync-nordly-app-version.mjs --version X.Y.Z | --tag nordly-vX.Y.Z')
  process.exit(1)
}

function parseArgs(argv) {
  let version = null
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i]
    const val = argv[i + 1]
    if (key === '--version') version = val
    if (key === '--tag') {
      if (!/^nordly-v(\d+\.\d+\.\d+)$/i.test(val)) {
        throw new Error(`tag must be nordly-vMAJOR.MINOR.PATCH, got ${val}`)
      }
      version = val.replace(/^nordly-v/i, '')
    }
  }
  if (!version || !/^\d+\.\d+\.\d+$/.test(version)) usage()
  return version
}

function writeJson(filePath, mutate) {
  const raw = fs.readFileSync(filePath, 'utf8')
  const data = JSON.parse(raw)
  mutate(data)
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`)
}

function replaceLineValue(text, pattern, replacement) {
  if (!pattern.test(text)) {
    return null
  }
  pattern.lastIndex = 0
  return text.replace(pattern, replacement)
}

function syncVersion(version) {
  const tauriPath = path.join(appDir, 'src-tauri/tauri.conf.json')
  const tauri = fs.readFileSync(tauriPath, 'utf8')
  const tauriNext = replaceLineValue(
    tauri,
    /^  "version": ".*",/m,
    `  "version": "${version}",`,
  )
  if (tauriNext == null) throw new Error(`version field not found in ${tauriPath}`)
  fs.writeFileSync(tauriPath, tauriNext)

  const cargoPath = path.join(appDir, 'src-tauri/Cargo.toml')
  const cargo = fs.readFileSync(cargoPath, 'utf8')
  const cargoNext = replaceLineValue(cargo, /^version = ".*"/m, `version = "${version}"`)
  if (cargoNext == null) throw new Error(`version field not found in ${cargoPath}`)
  fs.writeFileSync(cargoPath, cargoNext)

  const pkgPath = path.join(appDir, 'package.json')
  const pkg = fs.readFileSync(pkgPath, 'utf8')
  const pkgNext = replaceLineValue(
    pkg,
    /^  "version": ".*",/m,
    `  "version": "${version}",`,
  )
  if (pkgNext == null) throw new Error(`version field not found in ${pkgPath}`)
  fs.writeFileSync(pkgPath, pkgNext)

  const cargoLockPath = path.join(appDir, 'src-tauri/Cargo.lock')
  const cargoLock = fs.readFileSync(cargoLockPath, 'utf8')
  const cargoLockNext = replaceLineValue(
    cargoLock,
    /^name = "nordly"\r?\nversion = ".*"/m,
    (match) => {
      const nl = match.includes('\r\n') ? '\r\n' : '\n'
      return `name = "nordly"${nl}version = "${version}"`
    },
  )
  if (cargoLockNext == null) {
    throw new Error(`nordly package version not found in ${cargoLockPath}`)
  }
  fs.writeFileSync(cargoLockPath, cargoLockNext)

  const lockPath = path.join(appDir, 'package-lock.json')
  writeJson(lockPath, (lock) => {
    lock.version = version
    if (lock.packages?.['']) {
      lock.packages[''].version = version
    }
  })

  console.log(`Synced Nordly desktop version to ${version}`)
}

const version = parseArgs(process.argv.slice(2))
syncVersion(version)
