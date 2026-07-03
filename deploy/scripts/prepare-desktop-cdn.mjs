#!/usr/bin/env node
/**
 * Rewrite Tauri updater manifest + landing releases.json for cdn.trynordly.app.
 *
 * Usage:
 *   node deploy/scripts/prepare-desktop-cdn.mjs \
 *     --input /tmp/desktop-release \
 *     --tag nordly-v0.0.2 \
 *     --cdn-base https://cdn.trynordly.app/desktop \
 *     --output /tmp/cdn-upload
 */
import fs from 'node:fs'
import path from 'node:path'

function usage() {
  console.error(`Usage: prepare-desktop-cdn.mjs --input DIR --tag nordly-vX.Y.Z --cdn-base URL --output DIR`)
  process.exit(1)
}

function parseArgs(argv) {
  const out = {}
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i]
    const val = argv[i + 1]
    if (key === '--input') out.input = val
    if (key === '--tag') out.tag = val
    if (key === '--cdn-base') out.cdnBase = val.replace(/\/$/, '')
    if (key === '--output') out.output = val
  }
  if (!out.input || !out.tag || !out.cdnBase || !out.output) usage()
  if (!/^nordly-v\d+\.\d+\.\d+$/i.test(out.tag)) {
    throw new Error(`tag must be nordly-vMAJOR.MINOR.PATCH, got ${out.tag}`)
  }
  return out
}

function copyFile(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  fs.copyFileSync(src, dest)
}

function pickInstaller(files) {
  const macAarch64 = files.find((f) => /_aarch64\.dmg$/i.test(f)) ?? null
  const macX64 = files.find((f) => /_x64\.dmg$/i.test(f)) ?? null
  const windows =
    files.find((f) => /-setup\.exe$/i.test(f)) ??
    files.find((f) => /\.msi$/i.test(f)) ??
    null
  return { macAarch64, macX64, windows }
}

const args = parseArgs(process.argv.slice(2))
const inputDir = path.resolve(args.input)
const latestPath = path.join(inputDir, 'latest.json')
if (!fs.existsSync(latestPath)) {
  throw new Error(`missing latest.json in ${inputDir}`)
}

const tagDirName = args.tag
const version = args.tag.replace(/^nordly-v/i, '')
const outDesktop = path.join(path.resolve(args.output), 'desktop')
const outTagDir = path.join(outDesktop, tagDirName)
const cdnTagBase = `${args.cdnBase}/${tagDirName}`

const inputFiles = fs.readdirSync(inputDir).filter((f) => f !== 'latest.json')
if (inputFiles.length === 0) {
  throw new Error(`no release assets in ${inputDir}`)
}

for (const name of inputFiles) {
  copyFile(path.join(inputDir, name), path.join(outTagDir, name))
}

const latest = JSON.parse(fs.readFileSync(latestPath, 'utf8'))
if (typeof latest.version !== 'string' || !latest.platforms || typeof latest.platforms !== 'object') {
  throw new Error('latest.json: expected { version, platforms }')
}

const rewritten = {
  ...latest,
  platforms: {},
}
for (const [platform, info] of Object.entries(latest.platforms)) {
  if (!info || typeof info !== 'object' || typeof info.url !== 'string') {
    throw new Error(`latest.json: invalid platform ${platform}`)
  }
  const basename = path.basename(new URL(info.url).pathname)
  const localPath = path.join(outTagDir, basename)
  if (!fs.existsSync(localPath)) {
    throw new Error(`latest.json references missing asset: ${basename}`)
  }
  rewritten.platforms[platform] = {
    ...info,
    url: `${cdnTagBase}/${basename}`,
  }
}

fs.mkdirSync(outDesktop, { recursive: true })
fs.writeFileSync(path.join(outDesktop, 'latest.json'), `${JSON.stringify(rewritten, null, 2)}\n`)

const tagFiles = fs.readdirSync(outTagDir)
const installers = pickInstaller(tagFiles)
const releases = {
  version,
  tagName: args.tag,
  releasePageUrl: 'https://trynordly.app/download',
  macAarch64Url: installers.macAarch64 ? `${cdnTagBase}/${installers.macAarch64}` : null,
  macX64Url: installers.macX64 ? `${cdnTagBase}/${installers.macX64}` : null,
  windowsUrl: installers.windows ? `${cdnTagBase}/${installers.windows}` : null,
}
fs.writeFileSync(path.join(outDesktop, 'releases.json'), `${JSON.stringify(releases, null, 2)}\n`)

console.log(`Prepared CDN desktop bundle for ${args.tag}`)
console.log(`  latest.json platforms: ${Object.keys(rewritten.platforms).join(', ')}`)
console.log(`  installers: mac aarch64=${!!installers.macAarch64} x64=${!!installers.macX64} win=${!!installers.windows}`)
