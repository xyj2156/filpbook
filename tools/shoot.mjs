#!/usr/bin/env node
// 无头 Edge 截图取证：node tools/shoot.mjs <name> [urlQuery] [--w=1280] [--h=800] [--budget=6000]
//                              [--dump=1]  出 DOM 序列化（.shots/<name>.dom.html）代替截图，
//                                          配合页面 ?dump=1 的逐元素清单做数值对拍。
// 产物落在 .shots/，供 Read 工具用视觉核对翻书效果。
import { spawn } from 'node:child_process'
import { mkdirSync, existsSync, statSync, rmSync, writeFileSync } from 'node:fs'
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
const BASE = `http://localhost:${PORT}/${flags.html ? (String(flags.html).includes('/') ? flags.html : `${flags.html}.html`) : 'tools/smoke.html'}`
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
  ...(flags.dump ? ['--dump-dom'] : [`--screenshot=${out}`]),
  url,
]

const dump = !!flags.dump
let stdout = ''
let err = ''
const watchdogMs = Number(flags.watchdog || 120_000)
const code = await new Promise((done) => {
  const p = spawn(edge, args, { stdio: ['ignore', dump ? 'pipe' : 'ignore', 'pipe'] })
  if (dump) p.stdout.on('data', (d) => { stdout += d.toString() })
  p.stderr.on('data', (d) => { err += d.toString() })
  // 看门狗：Edge 僵死（virtual-time 卡住等）不能拖死取证，强杀并按失败收场
  const watchdog = setTimeout(() => {
    err += `\n[shoot] watchdog: ${Math.round(watchdogMs / 1000)}s 未退出，强杀`
    try { p.kill() } catch { /* 已退出 */ }
  }, watchdogMs)
  p.on('close', () => { clearTimeout(watchdog); done(0) })
})

if (dump) {
  const dumpPath = resolve(ROOT, '.shots', `${name}.dom.html`)
  const ok = stdout.length > 0
  if (ok) writeFileSync(dumpPath, stdout)
  console.log(`${ok ? '✓' : '✗'} ${url}`)
  console.log(`  -> ${dumpPath}${ok ? ` (${stdout.length} chars)` : ''}`)
  if (!ok) console.log(err.split('\n').slice(-6).join('\n'))
  process.exit(ok ? 0 : 1)
}

const ok = existsSync(out) && statSync(out).size > 0
console.log(`${ok ? '✓' : '✗'} ${url}`)
console.log(`  -> ${out}${ok ? ` (${statSync(out).size} bytes)` : ''}`)
if (!ok) console.log(err.split('\n').slice(-6).join('\n'))
process.exit(ok ? 0 : 1)
