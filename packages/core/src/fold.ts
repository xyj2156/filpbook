/**
 * 折页层：把「一个页码面被翻起」画出来。
 *
 * 数学全在 geometry.fold()，这一层只负责把它照抄到 DOM 上。常驻结构是
 *
 *   pageWrap  裁切框（overflow hidden，占半本）
 *     wrapper 对角线尺寸容器，反向旋转 -angle
 *       host  页内容，旋转 +angle，按 edges 钉边
 *
 * 折页期间额外挂进书容器的浮层（盖在所有裁切框之上）：
 *
 *   fparent
 *     fwrapper 对角线尺寸容器，反向旋转 -angle，位置对齐被翻页那一半
 *       fpage    纸的背面，旋转 +angle 再转 innerAngle
 *         ashadow  正面卷曲渐变
 *   以及钉在被翻页裁切框里的 bshadow（背面投影落在掀开的那页上）。
 *
 * 背面那页的宿主在折页期间归本层持有，end() 时还给它的对角容器。
 */

import { fold, type Fold } from './geometry.js'
import { diagOf, type Corner, type Direction, type Display, type PageSize, type Point } from './corners.js'
import { halfOf } from './layout.js'

export interface FoldEnv {
  bookEl: HTMLElement
  size: PageSize
  display: Display
  direction: Direction
  /** 页码面总数，决定浮层叠放 */
  total: number
  wrapOf(page: number): HTMLDivElement | null
  wrapperOf(page: number): HTMLDivElement | null
  hostOf(page: number): HTMLElement | null
}

interface Active {
  page: number
  back: number
  corner: Corner
  wrapper: HTMLDivElement
  fparent: HTMLDivElement
  fwrapper: HTMLDivElement
  fpage: HTMLDivElement
  ashadow: HTMLDivElement | null
  bshadow: HTMLDivElement | null
  geom: Fold
}

function el(css: Partial<CSSStyleDeclaration>): HTMLDivElement {
  const node = document.createElement('div')
  node.style.position = 'absolute'
  Object.assign(node.style, css)
  return node
}

const originOf = (f: Fold): string => `${f.origin[0]}% ${f.origin[1]}%`
const t3 = (x: number, y: number): string => `translate3d(${x}px, ${y}px, 0)`
const rot = (a: number): string => `rotate(${a}deg)`
const pct = (v: boolean): number => (v ? 100 : 0)

const REST_EDGES: Partial<CSSStyleDeclaration> = {
  left: '0', top: '0', right: 'auto', bottom: 'auto',
}

export class FoldOverlay {
  private readonly env: FoldEnv
  private active: Active | null = null

  constructor(env: FoldEnv) {
    this.env = env
  }

  get busy(): boolean {
    return this.active !== null
  }

  /** 正在翻起的页码面 */
  get foldingPage(): number {
    return this.active?.page ?? 0
  }

  /** 被借去当纸背面的页码面（sync 要避让，别把它抢回裁切框） */
  get backPage(): number {
    return this.active?.back ?? 0
  }

  /**
   * 把 page 沿 corner 折到 at；back 是这张纸的背面那页。
   * 同一页同一角重复调用只重算变换，不重建 DOM（拖拽每帧都走这里）。
   */
  apply(page: number, back: number, corner: Corner, at: Point, gradients = true): boolean {
    const reuse = !!this.active
      && this.active.page === page
      && this.active.back === back
      && this.active.corner === corner
    if (!reuse) {
      this.end()
      if (!this.begin(page, back, corner)) return false
    }

    const a = this.active
    if (!a) return false
    a.geom = fold({ size: this.env.size, corner, point: at, gradients, backGradient: !!a.bshadow })
    this.paint(a)
    return true
  }

  /** 结束折页：还回借走的页、清变换、拆浮层 */
  end(): void {
    const a = this.active
    if (!a) return
    this.active = null

    const backHost = this.env.hostOf(a.back)
    const backWrapper = this.env.wrapperOf(a.back)
    if (backHost && backWrapper && backHost.parentElement !== backWrapper) {
      backWrapper.appendChild(backHost)
    }
    if (backHost) backHost.style.boxShadow = ''

    const host = this.env.hostOf(a.page)
    if (host) {
      Object.assign(host.style, REST_EDGES)
      host.style.transform = ''
      host.style.transformOrigin = ''
    }
    a.wrapper.style.transform = ''
    a.wrapper.style.transformOrigin = ''
    a.bshadow?.remove()
    a.fparent.remove()
  }

  private begin(page: number, back: number, corner: Corner): boolean {
    const { size, total } = this.env
    const host = this.env.hostOf(page)
    const backHost = this.env.hostOf(back)
    const wrap = this.env.wrapOf(page)
    const wrapper = this.env.wrapperOf(page)
    if (!host || !backHost || !wrap || !wrapper) return false

    const diag = diagOf(size)
    const fparent = el({
      left: '0',
      top: '0',
      width: '100%',
      height: '100%',
      pointerEvents: 'none',
      zIndex: String(total + 2),
    })
    this.env.bookEl.appendChild(fparent)

    const half = halfOf(page, this.env.display, this.env.direction)
    const fwrapper = el({
      left: `${this.env.display === 'single' ? 0 : half === 1 ? size.width : 0}px`,
      top: '0',
      width: `${diag}px`,
      height: `${diag}px`,
      // 与 wrapper 同理：折过去的背面页要靠这层裁切
      overflow: 'hidden',
    })
    fparent.appendChild(fwrapper)

    const fpage = el({ left: '0', top: '0', width: `${size.width}px`, height: `${size.height}px` })
    fwrapper.appendChild(fpage)

    const ashadow = el({
      left: '0', top: '0', width: `${size.width}px`, height: `${size.height}px`, zIndex: '1',
    })
    fpage.appendChild(ashadow)

    let bshadow: HTMLDivElement | null = null
    if (this.needsBackGradient(page)) {
      bshadow = el({
        left: '0', top: '0', width: `${size.width}px`, height: `${size.height}px`,
        zIndex: '1', pointerEvents: 'none',
      })
      wrap.appendChild(bshadow)
    }

    fpage.appendChild(backHost)

    this.active = {
      page, back, corner, wrapper, fparent, fwrapper, fpage, ashadow, bshadow,
      geom: fold({ size, corner, point: { x: 0, y: 0 } }),
    }
    return true
  }

  /** 靠近封面与封底的那几张纸不投背面影（turn.js _backGradient） */
  private needsBackGradient(page: number): boolean {
    if (this.env.display === 'single') return true
    return page !== 2 && page !== this.env.total - 1
  }

  private paint(a: Active): void {
    const { size } = this.env
    const f = a.geom
    const host = this.env.hostOf(a.page)
    const backHost = this.env.hostOf(a.back)
    if (!host || !backHost) return

    const origin = originOf(f)
    const edges: Partial<CSSStyleDeclaration> = {
      left: f.edges.left, top: f.edges.top, right: f.edges.right, bottom: f.edges.bottom,
    }

    Object.assign(host.style, edges)
    host.style.transform = `${rot(f.angle)} ${t3(f.translate.x + f.aliasing, f.translate.y)}`
    host.style.transformOrigin = origin

    // 背面页只是待在 fpage 里，变换与钉边都打在 fpage 上（与 host/wrapper 对称）
    Object.assign(a.fpage.style, edges)
    a.fpage.style.transform =
      `${rot(f.angle)} ` +
      t3(
        f.translate.x + f.seam.x - f.shift.x - (size.width * f.origin[0]) / 100,
        f.translate.y + f.seam.y - f.shift.y - (size.height * f.origin[1]) / 100,
      ) +
      ` ${rot(f.innerAngle)}`
    a.fpage.style.transformOrigin = origin
    backHost.style.boxShadow = `0 0 20px rgba(0,0,0,${(0.5 * f.shading.shadow).toFixed(3)})`

    a.wrapper.style.transform =
      `${t3(-f.translate.x + f.oversize.x - f.aliasing, -f.translate.y + f.oversize.y)} ${rot(-f.angle)}`
    a.wrapper.style.transformOrigin = origin

    a.fwrapper.style.transform =
      `${t3(-f.translate.x + f.shift.x + f.oversize.x, -f.translate.y + f.shift.y + f.oversize.y)} ${rot(-f.angle)}`
    a.fwrapper.style.transformOrigin = origin

    // 渐变锚点：正面从被翻的那个角出发，背面从它的水平镜像出发
    setGradient(
      a.ashadow!,
      { x: pct(f.left), y: pct(!f.top) },
      f.shading.front,
      [
        [f.shading.start, 'rgba(0,0,0,0)'],
        [(1 - f.shading.start) * 0.8 + f.shading.start, `rgba(0,0,0,${(0.2 * f.shading.opacity).toFixed(3)})`],
        [1, `rgba(255,255,255,${(0.2 * f.shading.opacity).toFixed(3)})`],
      ],
      size,
    )

    if (a.bshadow) {
      setGradient(
        a.bshadow,
        { x: pct(!f.left), y: pct(!f.top) },
        f.shading.back,
        [
          [0.6, 'rgba(0,0,0,0)'],
          [0.8, `rgba(0,0,0,${(0.3 * f.shading.opacity).toFixed(3)})`],
          [1, 'rgba(0,0,0,0)'],
        ],
        size,
      )
    }
  }
}

/**
 * 渐变铺色：turn.js 非 webkit 分支照搬。
 *
 * 它把「百分比两点」换成像素，量出渐变线在盒子法线方向上的投影长度，
 * 再把色标位置折算回 CSS 需要的百分比 —— CSS 的 linear-gradient 色标沿渐变线
 * 均匀分布但被盒子裁剪，直接给百分比会短一截。
 *
 * 退化情形（两点同高或同宽 → slope 为 0 或 ∞）交点算成 NaN，此时清空背景：
 * 少画一帧投影看不出来，画错会闪黑。
 */
function setGradient(
  node: HTMLElement,
  from: Point,
  to: Point,
  stops: Array<[number, string]>,
  size: PageSize,
): void {
  const w = size.width
  const h = size.height
  const p0 = { x: (from.x / 100) * w, y: (from.y / 100) * h }
  const p1 = { x: (to.x / 100) * w, y: (to.y / 100) * h }
  const dx = p1.x - p0.x
  const dy = p1.y - p0.y
  const angle = Math.atan2(dy, dx)
  const perp = angle - Math.PI / 2
  const diagonal = Math.abs(w * Math.sin(perp)) + Math.abs(h * Math.cos(perp))
  const line = Math.hypot(dx, dy)
  if (!(diagonal > 0) || !(line > 0)) {
    node.style.backgroundImage = ''
    return
  }
  const corner = { x: p1.x < p0.x ? w : 0, y: p1.y < p0.y ? h : 0 }
  const slope = Math.tan(angle)
  const inverse = slope === 0 ? Number.NaN : -1 / slope
  const cx = (inverse * corner.x - corner.y - slope * p0.x + p0.y) / (inverse - slope)
  const cy = inverse * cx - inverse * corner.x + corner.y
  if (!Number.isFinite(cx) || !Number.isFinite(cy)) {
    node.style.backgroundImage = ''
    return
  }
  const segA = Math.hypot(cx - p0.x, cy - p0.y)
  const cols = stops
    .map(([t, color]) => ` ${color} ${(((segA + line * t) * 100) / diagonal).toFixed(2)}%`)
    .join(',')
  // 角度约定与 turn.js 的这条分支不同：它按「0 = 向右」输出（那是 -moz-linear-gradient
  // 的老规矩），而标准 linear-gradient 是「0deg = 向上、顺时针」，所以要 +90°。
  node.style.backgroundImage = `linear-gradient(${(angle + Math.PI / 2).toFixed(4)}rad,${cols})`
}
