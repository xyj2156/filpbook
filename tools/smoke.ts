// 引擎取证页：不带任何框架，直接驱动 core。
// 每个单元的视觉验证都在这里跑（见 tools/shoot.mjs）。
// 可用 query 控制：?pages=6&page=1&display=double|single&direction=ltr|rtl&blank=1
import { FlipBook } from '@x-ac/filpbook-core'

const q = new URLSearchParams(location.search)
const pageCount = Number(q.get('pages') ?? 6)
const startPage = Number(q.get('page') ?? 1)
const display = q.get('display') === 'single' ? 'single' : 'double'
const direction = q.get('direction') === 'rtl' ? 'rtl' : 'ltr'

const PAGE = { width: 400, height: 600 }
const bookWidth = display === 'double' ? PAGE.width * 2 : PAGE.width

const stage = document.getElementById('stage')!
stage.style.cssText = `width:${bookWidth}px;height:${PAGE.height}px;`

const book = new FlipBook(stage, {
  pageCount,
  width: PAGE.width,
  height: PAGE.height,
  display,
  direction,
  startPage,
  blankPage: q.get('blank') === '1',
})

// 只给真页填内容；补出来的白页应当保持空白
for (let i = 1; i <= book.pageCount; i++) {
  const host = book.hostOf(i)
  if (!host) continue
  host.style.background = `hsl(${(i * 26) % 360} 40% ${i % 2 ? 28 : 40}%)`
  host.innerHTML = `<div class="probe"><b>第 ${i} 页</b><span>${display} · ${direction}</span></div>`
}

const info = document.createElement('div')
info.style.cssText = 'position:absolute;left:0;top:-26px;color:#bbb;font:13px system-ui'
info.textContent =
  `page ${book.page} · view [${book.view().join(',')}] · ` +
  `range [${book.range().join(',')}] · total ${book.total}`
stage.appendChild(info)

;(window as unknown as { __book: FlipBook }).__book = book
;(window as unknown as { __ready: boolean }).__ready = true
