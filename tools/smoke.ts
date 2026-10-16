// 引擎取证页：不带任何框架，直接驱动 core。
// 每个单元的视觉验证都在这里跑（见 tools/shoot.mjs）。
//
// query：
//   pages=6&page=3&display=double|single&direction=ltr|rtl&blank=1&nogradient=1
//   fold=br:0.5        把「折页进度」0..1 静态画出来（锚点 -> 完全翻过去，直线插值）
//   fold=br:200,500    直接给页内折点坐标
//   foldpage=4         指定翻哪一页（默认当前 view 的右页）
//   drag=hold:br:200,500 | turn:br | retreat:br:200,500 | hover:br | unhover:br
//                      | hoverdown:br | hoverturn:br
//                      合成指针序列，走真的 PointerController 监听器（取证链路 D-08）：
//                      hold=按下拖到目标点保持（dump 应与同折点的 ?fold= 逐元素一致）
//                      turn=按下即抬（<200ms 点按 → 翻完动画 → 背面页）
//                      retreat=按住 300ms 拖到目标点再松（不翻，弹回动画后原样）
//                      hover=悬停到角上（掀角动画 → 停在 cornerSize/2 处）
//                      unhover=悬停后移到页中（掀角 → 弹回 → 原样）
//                      hoverdown=悬停后按下保持（跟进短滑 → 停在按下点）
//                      hoverturn=悬停后快速点按（跟进未完即松 → 翻完动画从渲染折点续走）
//   window=N           覆盖 domWindow（默认 6；window=999 全部页常驻，验证窗口化无可见差异）
//   box=WxH            容器尺寸（默认=书尺寸）；配合默认 fit=contain 验证等比缩放与居中
//   fit=none           关闭缩放，原尺寸放左上角
import { FlipBook, cornerAnchor, cornerTarget, halfOf, isLeft, type Corner } from '@x-ac/filpbook-core'
import { dumpdom } from './dumpdom'

const q = new URLSearchParams(location.search)

// 取证页把 rAF 换成 16ms setTimeout 驱动：无头 Edge 的 --virtual-time-budget
// 只推进定时器、不泵 rAF，补间走不完。只换调度器，补间/缓动/回调逻辑不变。
window.requestAnimationFrame = (cb) => window.setTimeout(() => cb(performance.now()), 16)
window.cancelAnimationFrame = (id) => window.clearTimeout(id)
const pageCount = Number(q.get('pages') ?? 6)
const startPage = Number(q.get('page') ?? 1)
const display = q.get('display') === 'single' ? 'single' : 'double'
const direction = q.get('direction') === 'rtl' ? 'rtl' : 'ltr'

const PAGE = { width: 400, height: 600 }
const bookWidth = display === 'double' ? PAGE.width * 2 : PAGE.width
const [boxW, boxH] = (q.get('box') ?? '').split(/[x,]/).map(Number)
const stageW = boxW > 0 ? boxW : bookWidth
const stageH = boxH > 0 ? boxH : PAGE.height

const stage = document.getElementById('stage')!
stage.style.cssText = `width:${stageW}px;height:${stageH}px;`

const book = new FlipBook(stage, {
  pageCount,
  width: PAGE.width,
  height: PAGE.height,
  display,
  direction,
  startPage,
  blankPage: q.get('blank') === '1',
  gradients: q.get('nogradient') !== '1',
  domWindow: q.has('window') ? Number(q.get('window')) : undefined,
  fit: q.get('fit') === 'none' ? 'none' : 'contain',
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
      // 书可能被 fit 缩放：设计坐标 → 屏幕坐标要乘 scale（rect.left 已含居中偏移）
      clientX: r.left + (offsetX + p.x) * book.scale,
      clientY: r.top + p.y * book.scale,
    }))
  }

  if (mode === 'turn') {
    fire('pointerdown', anchor)
    fire('pointerup', anchor) // 按抬间隔 <200ms → 点按翻页
  } else if (mode === 'hold') {
    fire('pointerdown', anchor)
    fire('pointermove', target) // 折层停在目标点，供与 ?fold= 对拍
  } else if (mode === 'hover') {
    fire('pointermove', anchor) // 悬停掀角：动画走完停在 cornerSize/2 处
  } else if (mode === 'unhover') {
    fire('pointermove', anchor)
    setTimeout(() => {
      fire('pointermove', { x: PAGE.width / 2, y: PAGE.height / 2 }) // 移出热区 → 弹回原样
    }, 600)
  } else if (mode === 'hoverdown') {
    fire('pointermove', anchor)
    setTimeout(() => { fire('pointerdown', anchor) }, 600) // 掀角→按下：短滑后停在按下点
  } else if (mode === 'hoverturn') {
    fire('pointermove', anchor)
    setTimeout(() => {
      fire('pointerdown', anchor)
      fire('pointerup', anchor) // 掀角态快速点按：翻完动画从渲染折点续走 → 背面页
    }, 600)
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
const renderInfo = (): void => {
  info.textContent =
    `page ${book.page} · view [${book.view().join(',')}] · ` +
    `range [${book.range().join(',')}] · total ${book.total} · scale ${book.scale}` +
    (spec ? ` · fold ${spec} @ page ${q.get('foldpage') ?? book.view()[1]}` : '') +
    (dragInfo ? ` · drag ${dragInfo}` : '')
}
renderInfo()
book.on('change', renderInfo) // 松手动画落地后才换页，提示行要跟着刷新
stage.appendChild(info)

// ?dump=1 → 把整棵 DOM 的矩形与 inline style 打出来，配合 msedge --dump-dom 逐元素自查
if (q.get('dump')) dumpdom(stage)

;(window as unknown as { __book: FlipBook }).__book = book
;(window as unknown as { __ready: boolean }).__ready = true
