#!/usr/bin/env node
// GitHub Pages 公开示例站构建 + 零断链自检。
//
//   node tools/pages.mjs [--base=/filpbook/] [--repo=xyj2156/filpbook] [--out=dist]
//
// 与本地 `npx vite build` 的差别是刻意为之的（不动 vite.config.ts 的本地开发行为）：
//   1) base 换成项目页子路径，产物能直接落在 https://<user>.github.io/<repo>/ 下；
//   2) 根 index.html（导航页）纳入 build input —— 本地它由 dev server 直出，不参与构建；
//   3) 摘掉导航页里指向「未部署页面」的卡片（UMD / IIFE 取证页依赖本机 dist 产物，不公开）；
//   4) 把页面里指向本站的绝对路径补上 base 前缀，并逐条自检落得到真实文件，
//      任何断链或漏前缀都直接退出非 0（宁可部署失败，不上去一个点半数 404 的站点）。
//
// CI 里只传 --repo=<github.repository>，base 从仓库名推出，见 .github/workflows/pages.yml。
import { build, loadConfigFromFile } from 'vite'
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const argv = process.argv.slice(2)
const flags = Object.fromEntries(
  argv.filter((a) => a.startsWith('--')).map((a) => {
    const [k, v] = a.slice(2).split('=')
    return [k, v ?? '1']
  }),
)
if (flags.help) {
  console.log('usage: node tools/pages.mjs [--base=/filpbook/] [--repo=owner/name] [--out=dist]')
  process.exit(0)
}

// CI 里 GITHUB_REPOSITORY=owner/name，优先用它拼规范仓库链接。
const repoSlug = flags.repo || process.env.GITHUB_REPOSITORY || 'xyj2156/filpbook'
const repoUrl = `https://github.com/${repoSlug}`

// base：GitHub 项目页固定挂在 /<仓库名>/ 下，所以只凭仓库名就能定；
// 缺省值兜到本机仓库名，省掉 CI 里再拼一层事件字段（workflow_dispatch 事件里未必有）。
const base = (() => {
  let b = flags.base || process.env.PAGES_BASE || `/${repoSlug.split('/').pop()}/`
  if (!b.startsWith('/')) b = '/' + b
  if (!b.endsWith('/')) b += '/'
  return b
})()

const outDir = resolve(ROOT, flags.out || 'dist')
const fail = (msg) => {
  console.error(`✗ ${msg}`)
  process.exit(1)
}

/* ---------------- 1. 构建 ---------------- */

const loaded = await loadConfigFromFile({ command: 'build', mode: 'production' }, undefined, ROOT)
if (!loaded) fail('读不到 vite.config.ts')

const cfg = loaded.config
cfg.root = ROOT
cfg.base = base
cfg.build = {
  ...cfg.build,
  outDir,
  emptyOutDir: true,
  sourcemap: false,
  rollupOptions: {
    ...cfg.build?.rollupOptions,
    input: {
      index: join(ROOT, 'index.html'), // 导航页（本地开发不需要，Pages 必须有站根入口）
      smoke: join(ROOT, 'tools/smoke.html'),
      vue: join(ROOT, 'playground/index.html'),
      react: join(ROOT, 'playground/react.html'),
    },
  },
}

await build(cfg)

/* ---------------- 2. 导航页改写 ---------------- */

const navPath = join(outDir, 'index.html')
if (!existsSync(navPath)) fail(`产物里没有 ${relative(ROOT, navPath)}（build input 失效？）`)
let nav = readFileSync(navPath, 'utf8')

// 2a. 摘掉不公开的取证卡片：整块 <a class="card" href="/tools/(umd|iife).html">…</a>。
//     计数必须恰好为 2 —— 页面结构一旦变了就失败，而不是静默少摘一张。
const localOnlyCards = /<a class="card" href="\/tools\/(?:umd|iife)\.html"[\s\S]*?<\/a>\s*\n/g
const removed = nav.match(localOnlyCards)?.length ?? 0
if (removed !== 2) fail(`UMD/IIFE 卡片摘除数 = ${removed}，期望 2（导航页结构变了，请改本脚本）`)
nav = nav.replace(localOnlyCards, '')

// 2b. 站内绝对路径补 base 前缀（href 与展示用的 <code> 一起补，免得文案和真实 URL 打架）。
for (const dir of ['playground', 'tools']) {
  nav = nav.split(`"/${dir}/`).join(`"${base}${dir}/`).split(`>/${dir}/`).join(`>${base}${dir}/`)
}

// 2c. 页脚从「本地怎么起 dev server」换成公开站的安装 / 源码指引。
const footer = /<footer>[\s\S]*?<\/footer>/
if (!footer.test(nav)) fail('找不到 <footer>，页脚改写规则失效')
nav = nav.replace(
  footer,
  '<footer>\n' +
    '        安装：<code>npm i @x-ac/filpbook-vue</code> · <code>npm i @x-ac/filpbook-react</code>　' +
    `源码与文档：<a href="${repoUrl}">${repoSlug}</a>\n` +
    '      </footer>',
)

writeFileSync(navPath, nav)

/* ---------------- 3. 零断链自检 ---------------- */

const htmlFiles = []
;(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p)
    else if (name.endsWith('.html')) htmlFiles.push(p)
  }
})(outDir)

const refs = []
const external = /^(https?:|mailto:|data:|#|\/\/)/
for (const file of htmlFiles) {
  const html = readFileSync(file, 'utf8')
  for (const m of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
    const url = m[1]
    if (external.test(url)) continue
    refs.push({ file: relative(ROOT, file), url, from: file })
  }
}

const broken = []
for (const r of refs) {
  if (!r.url.startsWith('/')) continue // 相对路径交给浏览器按目录解析，构建产物里同源文件必在
  if (!r.url.startsWith(base)) {
    broken.push(`${r.file} → ${r.url}（缺 base 前缀 ${base}）`)
    continue
  }
  const target = join(outDir, r.url.slice(base.length).split(/[?#]/)[0])
  if (!existsSync(target)) broken.push(`${r.file} → ${r.url}（产物无此文件）`)
}

writeFileSync(join(outDir, '.nojekyll'), '')

const listed = htmlFiles
  .map((f) => relative(outDir, f).split(sep).join('/'))
  .sort((a, b) => (a === 'index.html' ? -1 : b === 'index.html' ? 1 : a.localeCompare(b)))

if (broken.length) {
  console.error(`✗ 断链 ${broken.length} 处：`)
  for (const b of broken) console.error(`  - ${b}`)
  process.exit(1)
}

console.log(`✓ Pages 产物就绪：${base}`)
console.log(`  入口 ${listed.length} 个页面：${listed.join(', ')}`)
console.log(`  站内引用 ${refs.length} 条，全部落到真实文件；.nojekyll 已写入`)
