/**
 * 交互层：指针按下 → 起折 → 拖拽跟手 → 松手判定 + 过渡动画；悬停掀角（peel）。
 *
 * 决策逻辑放纯函数（pressIntentOf / foldTowardOf，可单测）；PointerController
 * 编排状态机：拖拽中折点=指针页内原始坐标（与 turn.js 相同，越界夹持在
 * geometry.clampFoldPoint，D-10）；松手按 releaseDecision 二分——翻过去沿直线
 * 推到 cornerTarget 后 goTo，否则沿 retractHandles 弹回锚点后收层；悬停扫过
 * 合法角时掀起 cornerSize/2 的提示折角。时长与缓动照抄 turn.js（D-13）。
 */

import type { Corner, Direction, Display, PageSize, Point } from './corners.js'
import {
  cornerAnchor, cornerTarget, hitCorner, isLeft, isTop, point, releaseDecision,
} from './corners.js'
import type { Toward } from './layout.js'
import { backOf, bookSizeOf, halfOf, naturalToward, viewOf } from './layout.js'
import { retractHandles } from './geometry.js'
import type { FoldState } from './fold.js'
import { FoldTween } from './anim.js'

/** turn.js 的固定时长：掀角 500、弹回 800；翻完走 opts.duration（默认 600）。
 * 掀角态按下的跟进短滑 turn.js 没有（它是瞬时落点），取 150 只求不突兀 */
const PEEL_MS = 500
const RETRACT_MS = 800
const CATCHUP_MS = 150

/** 一翻的完整意图 */
export interface FoldIntent {
  /** 被翻起的页码面 */
  page: number
  toward: Toward
  /** 翻过去落在的页 = 纸的背面；与 turn.js 的 data.page / opts.next 同语义 */
  target: number
}

/**
 * 抓住这个角时页往哪边翻。
 * ltr 右侧角是前进、左侧角是后退，rtl 镜像。与 turn.js _eventStart 按
 * corner.charAt(1) × direction 分派的结论一致。
 */
export function foldTowardOf(corner: Corner, direction: Direction): Toward {
  return isLeft(corner) === (direction === 'rtl') ? 'forward' : 'backward'
}

export interface PressContext {
  /** 指针在书坐标里的位置（原点 = bookEl 左上） */
  at: Point
  /** view 当前停着的页码面 */
  current: number
  display: Display
  direction: Direction
  /** 页码面总数（含补白页） */
  total: number
  size: PageSize
  /** 角部热区边长 */
  cornerSize: number
}

export interface PressIntent extends FoldIntent {
  corner: Corner
  /** 被折页的页内坐标系在书坐标里的 x 偏移（左半 0、右半一个页宽；single 恒 0） */
  offsetX: number
}

/**
 * 指针按下 → 折页意图。
 *
 * 候选页码面 = double 下指针所在那半屏的页（用 halfOf 反查，
 * 不依赖 view 元组 [left,right] 的命名顺序，rtl 才不会错）；single 下就是当前页。
 * 未命中 / 该半没有页 / 书到头没有背面，都返回 null——turn.js 在这些情形
 * 同样拒绝起折（_eventStart 要求 _foldingPage 存在）。
 */
export function pressIntentOf(ctx: PressContext): PressIntent | null {
  const candidates: Array<{ page: number; offsetX: number }> = []
  if (ctx.display === 'single') {
    candidates.push({ page: ctx.current, offsetX: 0 })
  } else {
    const view = viewOf(ctx.current, ctx.display)
    for (const half of [0, 1] as const) {
      for (const p of view) {
        if (p >= 1 && p <= ctx.total && halfOf(p, ctx.display, ctx.direction) === half) {
          candidates.push({ page: p, offsetX: half * ctx.size.width })
          break
        }
      }
    }
  }

  for (const c of candidates) {
    const hit = hitCorner(point(ctx.at.x - c.offsetX, ctx.at.y), {
      page: c.page,
      pages: ctx.total,
      display: ctx.display,
      direction: ctx.direction,
      size: ctx.size,
      cornerSize: ctx.cornerSize,
    })
    if (!hit) continue

    // double 里页码面只能按它的天然方向翻（奇前进 / 偶后退，rtl 下同样成立）；
    // single 两侧角都合法，由角侧 × 方向决定。
    const toward = ctx.display === 'single'
      ? foldTowardOf(hit.corner, ctx.direction)
      : naturalToward(c.page)
    const target = backOf(c.page, toward, ctx.total)
    if (target === c.page) continue // 书到头，没有可折的背面
    return { page: c.page, toward, target, corner: hit.corner, offsetX: c.offsetX }
  }
  return null
}

export interface InteractEnv {
  bookEl: HTMLElement
  size: PageSize
  display: Display
  direction: Direction
  total: number
  cornerSize: number
  /** 悬停掀角提示；默认开是对 turn.js（hover:false）的有意偏离 */
  hover: boolean
  /** 翻完动画时长（ms） */
  duration: number
  currentPage(): number
  foldState(): FoldState | null
  foldPage(page: number, corner: Corner, at: Point, toward: Toward): boolean
  foldEnd(): void
  goTo(page: number): boolean
}

interface Dragging {
  pointerId: number
  intent: PressIntent
  downTime: number
  /** 指针最新位置（被折页的页内坐标） */
  last: Point
}

/**
 * 指针状态机：
 *   idle --按下命中角--> drag --松手判定--> 翻完动画 → goTo ／ 弹回动画 → foldEnd
 *   idle --悬停扫过角--> 掀角动画（悬停中保持，移出或离书即弹回）
 * 接管规则：弹回/掀角动画途中按下 = 冻结当前帧重新起折；翻完动画途中按下
 * 不响应（对齐 turn.js 的 isTurning）。setPointerCapture 拖出窗口仍跟手；
 * pointercancel / 捕获被抢当弹回。
 */
export class PointerController {
  private readonly env: InteractEnv
  private readonly tween = new FoldTween()
  private readonly detach: Array<() => void> = []
  private drag: Dragging | null = null
  /** 悬停掀着的角（仅无拖拽时有意义） */
  private hoverIntent: PressIntent | null = null
  /** 当前补间是否为翻完动画（翻完途中不接受新折） */
  private tweenTurns = false

  constructor(env: InteractEnv) {
    this.env = env
    env.bookEl.style.touchAction = 'none' // D-07：手指下不交给浏览器手势

    const el = env.bookEl
    const onDown = (e: PointerEvent): void => this.onDown(e)
    const onMove = (e: PointerEvent): void => this.onMove(e)
    const onUp = (e: PointerEvent): void => this.onUp(e, false)
    const onCancel = (e: PointerEvent): void => this.onUp(e, true)
    const onLost = (e: PointerEvent): void => {
      // 正常松手会先发 pointerup（drag 已清）；走到这里说明捕获被外部抢走，当弹回
      const d = this.drag
      if (d && e.pointerId === d.pointerId) {
        this.drag = null
        this.hoverIntent = null
        this.retractTo(d.intent, this.foldPointOf(d.intent, d.last))
      }
    }
    const onLeave = (): void => {
      // turn.js 没有离书处理（掀角会留在书上）；这里补上：指针出书即收
      if (!this.drag) this.hoverCancel()
    }
    el.addEventListener('pointerdown', onDown)
    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerup', onUp)
    el.addEventListener('pointercancel', onCancel)
    el.addEventListener('lostpointercapture', onLost)
    el.addEventListener('pointerleave', onLeave)
    this.detach.push(
      () => el.removeEventListener('pointerdown', onDown),
      () => el.removeEventListener('pointermove', onMove),
      () => el.removeEventListener('pointerup', onUp),
      () => el.removeEventListener('pointercancel', onCancel),
      () => el.removeEventListener('lostpointercapture', onLost),
      () => el.removeEventListener('pointerleave', onLeave),
    )
  }

  destroy(): void {
    this.tween.destroy()
    this.detach.forEach((fn) => fn())
    this.detach.length = 0
    this.drag = null
    this.hoverIntent = null
  }

  /** 外部重排（如 goTo）时中止补间与悬停态；进行中的拖拽不受影响 */
  abort(): void {
    this.tween.cancel()
    this.hoverIntent = null
  }

  // ---- 指针事件 ----

  private onDown(e: PointerEvent): void {
    const env = this.env
    if (this.drag || !e.isPrimary) return
    if (this.tween.busy && this.tweenTurns) return // 翻完途中不接受新折（isTurning）

    const at = this.bookPointOf(e)
    if (!at) return
    const intent = this.intentAt(at)
    if (!intent) return

    e.preventDefault()
    this.tween.cancel() // 弹回/掀角途中接管：冻结在当前帧重新起折
    this.hoverIntent = null
    // 合成事件（取证页）没有真实指针，capture 必然抛 NotFoundError；不影响起折
    try {
      env.bookEl.setPointerCapture(e.pointerId)
    } catch { /* 见上 */ }

    const drag: Dragging = {
      pointerId: e.pointerId,
      intent,
      downTime: performance.now(),
      last: point(at.x - intent.offsetX, at.y),
    }
    this.drag = drag

    // 掀角态按下：从当前折点短滑到按下点（turn.js 瞬时落点，实测突兀）。
    // 指针一移动 onMove 就取消补间转跟手，故不牺牲拖拽响应。
    const state = env.foldState()
    if (state && state.corner === intent.corner) {
      this.tweenTurns = false
      this.tween.run({
        from: state.point,
        to: drag.last,
        duration: CATCHUP_MS,
        frame: (p) => env.foldPage(intent.page, intent.corner, p, intent.toward),
      })
      return
    }

    if (!env.foldPage(intent.page, intent.corner, drag.last, intent.toward)) {
      this.drag = null
    }
  }

  private onMove(e: PointerEvent): void {
    const d = this.drag
    if (!d) {
      this.onHover(e)
      return
    }
    if (e.pointerId !== d.pointerId) return
    this.tween.cancel() // 指针动了：跟进短滑（掀角→按下）立即让位给跟手
    const rect = this.env.bookEl.getBoundingClientRect()
    if (!(rect.width > 0) || !(rect.height > 0)) return
    const book = bookSizeOf(this.env.size, this.env.display)
    const at = point(
      ((e.clientX - rect.left) * book.width) / rect.width - d.intent.offsetX,
      ((e.clientY - rect.top) * book.height) / rect.height,
    )
    d.last = at
    this.env.foldPage(d.intent.page, d.intent.corner, at, d.intent.toward)
  }

  private onUp(e: PointerEvent, cancelled: boolean): void {
    const d = this.drag
    if (!d || e.pointerId !== d.pointerId) return
    this.drag = null
    this.hoverIntent = null

    const turn = !cancelled && releaseDecision(
      { x: d.last.x, y: d.last.y, corner: d.intent.corner },
      {
        display: this.env.display,
        size: this.env.size,
        pressedMs: performance.now() - d.downTime,
      },
    )

    // 补间起点从「当前渲染折点」出发（turn.js data.point 即最后渲染点），
    // 跟进短滑途中松手才不会跳变
    const from = this.foldPointOf(d.intent, d.last)

    if (turn) {
      // 翻完：直线推向完全翻过去的落点（turn.js turnPage 传 p1,p1,p4,p4），
      // 落地后 goTo 换页——它内部会收折层、重排、发 change。
      this.tweenTurns = true
      this.tween.run({
        from,
        to: cornerTarget(d.intent.corner, this.env.size),
        duration: this.env.duration,
        frame: (p) => this.foldOf(d.intent, p),
        done: () => {
          this.tweenTurns = false
          this.env.goTo(d.intent.target)
        },
      })
    } else {
      this.retractTo(d.intent, from)
    }
  }

  // ---- 悬停掀角 ----

  private onHover(e: PointerEvent): void {
    const env = this.env
    if (!env.hover || this.tween.busy) return // 补间进行中不做悬停判定

    const at = this.bookPointOf(e)
    if (!at) return
    const intent = this.intentAt(at)

    if (intent) {
      const state = env.foldState()
      if (this.hoverIntent?.corner === intent.corner && state) return // 已掀着，动画自己在走
      // turn.js _showFoldedPage 语义：同角从当前折点续动，异角/无折层
      // 从锚点内缩 1px 的近平态起步
      const from = state && state.corner === intent.corner
        ? state.point
        : cornerAnchor(intent.corner, env.size, 1)
      this.hoverIntent = intent
      if (!state || state.corner !== intent.corner) {
        env.foldPage(intent.page, intent.corner, from, intent.toward)
      }
      this.tweenTurns = false
      this.tween.run({
        from,
        to: cornerAnchor(intent.corner, env.size, env.cornerSize / 2),
        duration: PEEL_MS,
        frame: (p) => this.foldOf(intent, p),
      })
      return
    }

    if (this.hoverIntent) this.hoverCancel()
  }

  /** 收掉悬停折角：从当前折点弹回锚点后收层 */
  private hoverCancel(): void {
    const intent = this.hoverIntent
    if (!intent) return
    this.hoverIntent = null
    const s = this.env.foldState()
    if (!s || s.corner !== intent.corner) {
      this.tween.cancel()
      this.env.foldEnd()
      return
    }
    this.tween.cancel()
    this.retractTo(intent, s.point)
  }

  // ---- 复用件 ----

  private intentAt(at: Point): PressIntent | null {
    const env = this.env
    return pressIntentOf({
      at,
      current: env.currentPage(),
      display: env.display,
      direction: env.direction,
      total: env.total,
      size: env.size,
      cornerSize: env.cornerSize,
    })
  }

  private foldOf(intent: PressIntent, at: Point): void {
    this.env.foldPage(intent.page, intent.corner, at, intent.toward)
  }

  /** 当前渲染中的折点（同角时），否则回退 fallback——补间起点一律从可见状态出发 */
  private foldPointOf(intent: PressIntent, fallback: Point): Point {
    const s = this.env.foldState()
    return s && s.corner === intent.corner ? s.point : fallback
  }

  /** 弹回动画：沿 retractHandles 的轨迹收到被折角锚点，完成后收层 */
  private retractTo(intent: PressIntent, from: Point): void {
    const to = cornerAnchor(intent.corner, this.env.size)
    this.tweenTurns = false
    this.tween.run({
      from,
      to,
      handles: retractHandles(from, to, isTop(intent.corner)),
      duration: RETRACT_MS,
      frame: (p) => this.foldOf(intent, p),
      done: () => this.env.foldEnd(),
    })
  }

  /** 指针事件 → 书坐标（整本书坐标系）；书不可测量时返回 null */
  private bookPointOf(e: PointerEvent): Point | null {
    const rect = this.env.bookEl.getBoundingClientRect()
    if (!(rect.width > 0) || !(rect.height > 0)) return null
    const book = bookSizeOf(this.env.size, this.env.display)
    return point(
      ((e.clientX - rect.left) * book.width) / rect.width,
      ((e.clientY - rect.top) * book.height) / rect.height,
    )
  }
}
