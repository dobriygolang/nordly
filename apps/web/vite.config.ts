import fs from 'node:fs'
import path from 'node:path'
import type { Connect, Plugin } from 'vite'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const excalidrawFontsDir = path.resolve(
  __dirname,
  'node_modules/@excalidraw/excalidraw/dist/prod/fonts',
)

function excalidrawFonts(): Plugin {
  const serve: Connect.NextHandleFunction = (req, res, next) => {
    const rel = decodeURIComponent((req.url ?? '/').split('?')[0] ?? '/')
    const file = path.normalize(path.join(excalidrawFontsDir, rel))
    if (!file.startsWith(excalidrawFontsDir) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      next()
      return
    }
    res.setHeader('Content-Type', file.endsWith('.woff2') ? 'font/woff2' : 'application/octet-stream')
    fs.createReadStream(file).pipe(res)
  }

  return {
    name: 'excalidraw-fonts',
    configureServer(server) {
      server.middlewares.use('/fonts', serve)
    },
    writeBundle(options) {
      if (!options.dir) throw new Error('excalidraw fonts: vite outDir is missing')
      if (!fs.existsSync(excalidrawFontsDir)) {
        throw new Error(`excalidraw fonts: missing ${excalidrawFontsDir}`)
      }
      fs.cpSync(excalidrawFontsDir, path.join(options.dir, 'fonts'), { recursive: true })
    },
  }
}

const identity = process.env.VITE_IDENTITY_URL ?? 'http://localhost:8080'
const sandbox = process.env.VITE_SANDBOX_URL ?? 'http://localhost:8086'
const rooms = process.env.VITE_ROOMS_URL ?? 'http://localhost:8087'
const notes = process.env.VITE_NOTES_URL ?? 'http://localhost:8090'

export default defineConfig({
  plugins: [react(), excalidrawFonts()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@nordly-markdown': path.resolve(__dirname, '../shared/markdown'),
      '@nordly-collab': path.resolve(__dirname, '../shared/collab'),
      yjs: path.resolve(__dirname, 'node_modules/yjs'),
      'y-protocols/awareness': path.resolve(__dirname, 'node_modules/y-protocols/awareness.js'),
    },
    dedupe: ['yjs'],
  },
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/v1/auth': { target: identity, changeOrigin: true },
      '/v1/sandbox': { target: sandbox, changeOrigin: true },
      '/v1/rooms': { target: rooms, changeOrigin: true },
      '/v1/notes': { target: notes, changeOrigin: true },
      '/ws': { target: rooms, changeOrigin: true, ws: true },
    },
  },
})
