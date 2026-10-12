/**
 * 交互层：指针按下 → 起折 → 拖拽跟手 → 松手判定。
 *
 * 决策逻辑放纯函数（pressIntentOf / foldTowardOf，可单测）；PointerController
 * 只做三件事：在 bookEl 上监听 Pointer Events（DECISIONS D-07，不分 touch/mouse）、
 * 把指针换算成被折页的页内坐标交给 FoldOverlay、松手时二分
 * （翻过去 goTo / 弹回 foldEnd）。折点每帧就是指针在页内坐标里的原始位置——
 * 与 turn.js 相同，越界安全夹持在 geometry.clampFoldPoint（D-10）。
 *
 * 松手目前没有过渡动画（硬切），那是单元 U5 的事；本单元可验的是
 * 「拖拽跟手」与「释放判定正确」（取证页 ?drag= 合成指针序列）。
 */

import type { Corner, Direction, Display, PageSize, Point } from './corners.js'
import { hitCorner, isLeft, point, releaseDecision } from './corners.js'
import type { Toward } from './layout.js'
import { backOf, bookSizeOf, halfOf, naturalToward, viewOf } from './layout.js'

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
  currentPage(): number
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
 * 指针状态机：down 命中角 → 起折并进入拖拽；拖拽中折点跟随指针
 * （角与坐标系锁定在按下那一刻，不随指针跨过书缝重新判定——turn.js 亦然）；
 * 松手按 releaseDecision 二分：翻（goTo(target)）或弹回（foldEnd）。
 * setPointerCapture 拖出窗口仍跟手；pointercancel / 捕获被抢都当弹回。
 */
export class PointerController {
  private readonly env: InteractEnv
  private readonly detach: Array<() => void> = []
  private drag: Dragging | null = null

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
      if (this.drag?.pointerId === e.pointerId) {
        this.drag = null
        env.foldEnd()
      }
    }
    el.addEventListener('pointerdown', onDown)
    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerup', onUp)
    el.addEventListener('pointercancel', onCancel)
    el.addEventListener('lostpointercapture', onLost)
    this.detach.push(
      () => el.removeEventListener('pointerdown', onDown),
      () => el.removeEventListener('pointermove', onMove),
      () => el.removeEventListener('pointerup', onUp),
      () => el.removeEventListener('pointercancel', onCancel),
      () => el.removeEventListener('lostpointercapture', onLost),
    )
  }

  destroy(): void {
    this.detach.forEach((fn) => fn())
    this.detach.length = 0
    this.drag = null
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

  private onDown(e: PointerEvent): void {
    const env = this.env
    if (this.drag || !e.isPrimary) return

    const at = this.bookPointOf(e)
    if (!at) return
    const intent = pressIntentOf({
      at,
      current: env.currentPage(),
      display: env.display,
      direction: env.direction,
      total: env.total,
      size: env.size,
      cornerSize: env.cornerSize,
    })
    if (!intent) return

    e.preventDefault()
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
    if (!env.foldPage(intent.page, intent.corner, drag.last, intent.toward)) {
      this.drag = null
    }
  }

  private onMove(e: PointerEvent): void {
    const d = this.drag
    if (!d || e.pointerId !== d.pointerId) return
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

    const turn = !cancelled && releaseDecision(
      { x: d.last.x, y: d.last.y, corner: d.intent.corner },
      {
        display: this.env.display,
        size: this.env.size,
        pressedMs: performance.now() - d.downTime,
      },
    )
    // goTo 内部会收折层；它没动页码（理论到不了，防御）时这里兜底收掉
    if (turn && this.env.goTo(d.intent.target)) return
    this.env.foldEnd()
  }
}
