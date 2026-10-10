#!/usr/bin/env node
// 无头 Edge 截图取证：node tools/shoot.mjs <name> [urlQuery] [--w=1280] [--h=800] [--budget=6000]
// 产物落在 .shots/<name>.png，供 Read 工具用视觉核对翻书效果。
import { spawn } from 'node:child_process'
import { mkdirSync, existsSync, statSync, rmSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const PORT = 5199

const EDGE_CANDIDATES = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
]

const argv = process.argv.slice(2)
const name = argv.shift()
if (!name || name === '--help') {
  console.log('usage: node tools/shoot.mjs <name> [query] [--w=1280] [--h=800] [--budget=6000]')
  process.exit(name ? 0 : 1)
}
const flags = Object.fromEntries(
  argv.filter((a) => a.startsWith('--')).map((a) => {
    const [k, v] = a.slice(2).split('=')
    return [k, v ?? '1']
  }),
)
const query = argv.filter((a) => !a.startsWith('--')).join('&')
const w = flags.w || 1280
const h = flags.h || 800
const budget = flags.budget || 6000
const BASE = `http://localhost:${PORT}/tools/${flags.html || 'smoke'}.html`
const out = resolve(ROOT, '.shots', `${name}.png`)
mkdirSync(dirname(out), { recursive: true })

const edge = EDGE_CANDIDATES.find(existsSync)
if (!edge) {
  console.error('✗ 找不到 msedge.exe，无法截图取证')
  process.exit(2)
}

async function serverUp() {
  try {
    const res = await fetch(BASE, { signal: AbortSignal.timeout(700) })
    return res.ok
  } catch {
    return false
  }
}

let child = null
if (!(await serverUp())) {
  child = spawn(process.execPath, [resolve(ROOT, 'node_modules/vite/bin/vite.js'), '--port', String(PORT), '--strictPort'], {
    cwd: ROOT,
    stdio: ['ignore', 'ignore', 'ignore'],
    detached: process.platform !== 'win32',
    windowsHide: true,
  })
  child.unref()
  for (let i = 0; i < 60 && !(await serverUp()); i++) {
    await new Promise((s) => setTimeout(s, 250))
  }
}
if (!(await serverUp())) {
  console.error('✗ vite dev server 起不来（端口 ' + PORT + '）')
  process.exit(3)
}

const url = BASE + (query ? `?${query}` : '')
if (existsSync(out)) rmSync(out)

const args = [
  '--headless=new',
  '--disable-gpu',
  '--hide-scrollbars',
  '--allow-running-insecure-content',
  `--window-size=${w},${h}`,
  `--virtual-time-budget=${budget}`,
  `--screenshot=${out}`,
  url,
]

const code = await new Promise((done) => {
  const p = spawn(edge, args, { stdio: ['ignore', 'ignore', 'pipe'] })
  let err = ''
  p.stderr.on('data', (d) => { err += d.toString() })
  p.on('close', done)
})

const ok = existsSync(out) && statSync(out).size > 0
console.log(`${ok ? '✓' : '✗'} ${url}`)
console.log(`  -> ${out}${ok ? ` (${statSync(out).size} bytes)` : ''}`)
if (!ok) console.log(err.split('\n').slice(-6).join('\n'))
process.exit(ok ? 0 : 1)
