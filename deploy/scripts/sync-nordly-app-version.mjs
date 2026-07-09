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

function syncVersion(version) {
  const tauriPath = path.join(appDir, 'src-tauri/tauri.conf.json')
  const tauri = fs.readFileSync(tauriPath, 'utf8')
  if (!/^  "version": "/m.test(tauri)) {
    throw new Error(`version field not found in ${tauriPath}`)
  }
  fs.writeFileSync(
    tauriPath,
    tauri.replace(/^  "version": ".*",/m, `  "version": "${version}",`),
  )

  const cargoPath = path.join(appDir, 'src-tauri/Cargo.toml')
  const cargo = fs.readFileSync(cargoPath, 'utf8')
  fs.writeFileSync(
    cargoPath,
    cargo.replace(/^version = ".*"/m, `version = "${version}"`),
  )

  const pkgPath = path.join(appDir, 'package.json')
  const pkg = fs.readFileSync(pkgPath, 'utf8')
  if (!/^  "version": "/m.test(pkg)) {
    throw new Error(`version field not found in ${pkgPath}`)
  }
  fs.writeFileSync(
    pkgPath,
    pkg.replace(/^  "version": ".*",/m, `  "version": "${version}",`),
  )

  const cargoLockPath = path.join(appDir, 'src-tauri/Cargo.lock')
  const cargoLock = fs.readFileSync(cargoLockPath, 'utf8')
  if (!/^name = "nordly"\nversion = "/m.test(cargoLock)) {
    throw new Error(`nordly package version not found in ${cargoLockPath}`)
  }
  fs.writeFileSync(
    cargoLockPath,
    cargoLock.replace(
      /^name = "nordly"\nversion = ".*"/m,
      `name = "nordly"\nversion = "${version}"`,
    ),
  )

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
