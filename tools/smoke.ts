// 引擎取证页：不带任何框架，直接驱动 core。
// 每个单元的视觉验证都在这里跑（见 tools/shoot.mjs）。
//
// query：
//   pages=6&page=3&display=double|single&direction=ltr|rtl&blank=1&nogradient=1
//   fold=br:0.5        把「折页进度」0..1 静态画出来（锚点 -> 完全翻过去，直线插值）
//   fold=br:200,500    直接给页内折点坐标
//   foldpage=4         指定翻哪一页（默认当前 view 的右页）
//   drag=hold:br:200,500 | turn:br | retreat:br:200,500
//                      合成指针序列，走真的 PointerController 监听器（取证链路 D-08）：
//                      hold=按下拖到目标点保持（dump 应与同折点的 ?fold= 逐元素一致）
//                      turn=按下即抬（<200ms 点按 → 翻到背面页）
//                      retreat=按住 300ms 拖到目标点再松（不翻，应弹回原样）
import { FlipBook, cornerAnchor, cornerTarget, halfOf, isLeft, type Corner } from '@x-ac/filpbook-core'

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
  gradients: q.get('nogradient') !== '1',
})

// 只给真页填内容；补出来的白页应当保持空白
for (let i = 1; i <= book.pageCount; i++) {
  const host = book.hostOf(i)
  if (!host) continue
  host.style.background = `hsl(${(i * 26) % 360} 40% ${i % 2 ? 28 : 40}%)`
  host.innerHTML = `<div class="probe"><b>第 ${i} 页</b><span>${display} · ${direction}</span></div>`
}

const spec = q.get('fold')
if (spec) {
  const [corner, coords] = spec.split(':')
  const view = book.view()
  const page = Number(q.get('foldpage') ?? (view[1] || view[0]))
  let at = { x: 0, y: 0 }
  if (coords?.includes(',')) {
    const [x, y] = coords.split(',').map(Number)
    at = { x, y }
  } else {
    const t = Number(coords ?? 0.5)
    const a = cornerAnchor(corner as Corner, PAGE)
    const b = cornerTarget(corner as Corner, PAGE)
    at = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
  }
  book.foldPage(page, corner as Corner, at)
}

// 合成指针序列：dispatchEvent 同步派发，事件沿 stage→bookEl 命中真监听器
let dragInfo = ''
const drag = q.get('drag')
if (drag) {
  const [mode, cornerName, coords] = drag.split(':')
  const corner = cornerName as Corner
  const view = book.view()
  const half: 0 | 1 = isLeft(corner) ? 0 : 1
  const atHalf = (p: number): boolean => p >= 1 && halfOf(p, display, direction) === half
  const page = Math.max(1, Number(q.get('foldpage') ?? (atHalf(view[0]) ? view[0] : view[1])))
  const offsetX = halfOf(page, display, direction) * PAGE.width

  const anchor = cornerAnchor(corner, PAGE, 1) // 内缩 1px 确保站在页内（hitCorner 排斥边界）
  const target = coords?.includes(',')
    ? (([x, y]: string[]) => ({ x: Number(x), y: Number(y) }))(coords.split(','))
    : anchor

  const el = stage.firstElementChild as HTMLElement // bookEl
  const r = el.getBoundingClientRect()
  const fire = (type: string, p: { x: number; y: number }): void => {
    el.dispatchEvent(new PointerEvent(type, {
      bubbles: true, cancelable: true, isPrimary: true, pointerId: 7,
      pointerType: 'mouse', buttons: 1,
      clientX: r.left + offsetX + p.x, clientY: r.top + p.y,
    }))
  }

  if (mode === 'turn') {
    fire('pointerdown', anchor)
    fire('pointerup', anchor) // 按抬间隔 <200ms → 点按翻页
  } else if (mode === 'hold') {
    fire('pointerdown', anchor)
    fire('pointermove', target) // 折层停在目标点，供与 ?fold= 对拍
  } else if (mode === 'retreat') {
    fire('pointerdown', anchor)
    // virtual-time-budget 会推进 setTimeout；≥200ms 且没拖出页 → 松手弹回
    setTimeout(() => {
      fire('pointermove', target)
      fire('pointerup', target)
    }, 300)
  } else {
    console.warn(`drag 模式只支持 hold / turn / retreat，收到：${mode}`)
  }
  dragInfo = `${mode} ${cornerName}${coords ? `:${coords}` : ''} @ page ${page}`
}

const info = document.createElement('div')
info.style.cssText = 'position:absolute;left:0;top:-26px;color:#bbb;font:13px system-ui'
info.textContent =
  `page ${book.page} · view [${book.view().join(',')}] · ` +
  `range [${book.range().join(',')}] · total ${book.total}` +
  (spec ? ` · fold ${spec} @ page ${q.get('foldpage') ?? book.view()[1]}` : '') +
  (dragInfo ? ` · drag ${dragInfo}` : '')
stage.appendChild(info)

// ?dump=1 → 把整棵 DOM 的矩形与 inline style 打出来，配合 msedge --dump-dom
// 与 tools/ref.html（真 turn.js）逐元素比对
if (q.get('dump')) {
  const pre = document.createElement('pre')
  pre.id = 'dump'
  pre.style.cssText = 'position:fixed;left:-9999px;top:0;font:11px monospace;white-space:pre'
  document.body.appendChild(pre)
  const lines: string[] = []
  const walk = (node: Element, depth: number): void => {
    const r = node.getBoundingClientRect()
    const cls = node.className && typeof node.className === 'string' && node.className.trim()
      ? `.${node.className.trim().split(/\s+/).join('.')}` : ''
    const ds = Object.entries((node as HTMLElement).dataset).map(([k, v]) => `[${k}=${v}]`).join('')
    lines.push(
      `${'  '.repeat(depth)}<${node.tagName.toLowerCase()}${cls}${ds}> ` +
      `${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}x${Math.round(r.height)} || ` +
      `${node.getAttribute('style') || ''}`,
    )
    for (const child of Array.from(node.children)) walk(child, depth + 1)
  }
  walk(stage, 0)
  pre.textContent = lines.join('\n')
}

;(window as unknown as { __book: FlipBook }).__book = book
;(window as unknown as { __ready: boolean }).__ready = true
