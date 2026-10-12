/**
 * FlipBook：框架无关的翻书主类。
 *
 * 本单元的边界 —— 静态布局 + 指针翻页：把页摆到该在的半本上、按 range 借还宿主、
 * 按 loc 决定显隐与叠放；拖角翻页交给 PointerController（interact）。
 * 松手过渡动画在后续单元接进来。
 *
 * 所有权约定（DECISIONS D-04）：
 *   core 拥有：书容器、每页的裁切框 pageWrap、每页的宿主 div、staging；
 *   框架拥有：宿主 div 里的内容（Vue Teleport / React createPortal 渲染进来）。
 * core 只搬动宿主，绝不卸载或清空它，框架的 patch 目标因此始终有效。
 *
 * 卸载顺序：框架要先撤销内容（Teleport / portal 卸载），再调 destroy()。
 */

import type { Direction, Display, PageSize } from './corners.js'
import {
  DOM_WINDOW, backOf, bookSizeOf, halfOf, locOf, naturalToward, needsBlankPage, rangeOf,
  viewOf, type Toward, type View,
} from './layout.js'
import { diagOf, type Corner, type Point } from './corners.js'
import { FoldOverlay } from './fold.js'
import { PointerController } from './interact.js'

export interface FlipBookOptions {
  /** 页码面数量，第 1..pageCount 页 */
  pageCount: number
  /** 单页设计尺寸（px）；整本书按它等比适配容器 */
  width: number
  height: number
  display?: Display
  direction?: Direction
  startPage?: number
  /** 偶数页时补一张白页，让最后一翻是完整的一对（见 DECISIONS D-03） */
  blankPage?: boolean
  /** 同时留在书里的页数 */
  domWindow?: number
  /** 卷曲渐变与投影 */
  gradients?: boolean
  /** 是否启用指针翻页（拖角），默认开 */
  interactive?: boolean
  /** 角部热区边长（设计 px）；默认 100 = turn.js flipOptions */
  cornerSize?: number
  /** 悬停掀角提示（peel），默认开；turn.js 默认关，此处为有意偏离 */
  hover?: boolean
  /** 翻完动画时长（ms）；默认 600 = turn.js duration */
  duration?: number
}

export type FlipBookEvent = 'change'

type Listener = (page: number, view: View) => void

const clamp = (v: number, lo: number, hi: number): number => Math.min(Math.max(v, lo), hi)

function box(css: Partial<CSSStyleDeclaration>): HTMLDivElement {
  const el = document.createElement('div')
  el.style.position = 'absolute'
  Object.assign(el.style, css)
  return el
}

export class FlipBook {
  readonly el: HTMLElement
  readonly pageCount: number
  readonly display: Display
  readonly direction: Direction
  readonly size: PageSize
  readonly domWindow: number

  /** 整本书（double 时两页宽） */
  private readonly bookEl: HTMLDivElement
  /** 区间外宿主的暂存处：仍在文档里、可被内容正常测量，但不绘制 */
  private readonly stageEl: HTMLDivElement
  private readonly wraps = new Map<number, HTMLDivElement>()
  private readonly wrappers = new Map<number, HTMLDivElement>()
  private readonly hosts = new Map<number, HTMLElement>()
  private readonly listeners = new Map<FlipBookEvent, Set<Listener>>()
  /** 补出来的那张白页的页号，没补则 null */
  private readonly blankAt: number | null
  readonly gradients: boolean
  private readonly fold: FoldOverlay
  /** 角部热区边长（设计 px） */
  readonly cornerSize: number
  /** 指针交互层；interactive 关闭时为 null */
  private readonly interact: PointerController | null

  private readonly _total: number
  private _page: number

  constructor(el: HTMLElement, options: FlipBookOptions) {
    if (!el) throw new Error('FlipBook: 缺少挂载元素')
    if (!(options.width > 0) || !(options.height > 0)) {
      throw new Error('FlipBook: width / height 必须是正数')
    }
    if (!(options.pageCount >= 0)) throw new Error('FlipBook: pageCount 不能为负')

    this.el = el
    this.size = { width: options.width, height: options.height }
    this.display = options.display ?? 'double'
    this.direction = options.direction ?? 'ltr'
    this.domWindow = options.domWindow ?? DOM_WINDOW

    const book = bookSizeOf(this.size, this.display)
    this.bookEl = box({
      position: 'relative',
      width: `${book.width}px`,
      height: `${book.height}px`,
      overflow: 'hidden',
    })
    this.stageEl = box({
      inset: '0',
      width: '100%',
      height: '100%',
      overflow: 'hidden',
      visibility: 'hidden',
      pointerEvents: 'none',
    })
    this.el.appendChild(this.bookEl)
    this.el.appendChild(this.stageEl)

    let total = Math.floor(options.pageCount)
    this.blankAt = options.blankPage && needsBlankPage(total, this.display) ? total + 1 : null
    if (this.blankAt) total += 1
    this.pageCount = Math.floor(options.pageCount)
    this._total = total
    this.gradients = options.gradients ?? true

    this.fold = new FoldOverlay({
      bookEl: this.bookEl,
      size: this.size,
      display: this.display,
      direction: this.direction,
      total: this._total,
      wrapOf: (page) => this.wrapOf(page),
      wrapperOf: (page) => this.wrapperOf(page),
      hostOf: (page) => this.hostOf(page),
    })

    this.cornerSize = options.cornerSize ?? 100
    this.interact = options.interactive === false
      ? null
      : new PointerController({
          bookEl: this.bookEl,
          size: this.size,
          display: this.display,
          direction: this.direction,
          total: this._total,
          cornerSize: this.cornerSize,
          hover: options.hover ?? true,
          duration: options.duration ?? 600,
          currentPage: () => this._page,
          foldState: () => this.fold.state,
          foldPage: (page, corner, at, toward) => this.foldPage(page, corner, at, toward),
          foldEnd: () => this.foldEnd(),
          goTo: (page) => this.goTo(page),
        })

    this._page = clamp(Math.floor(options.startPage ?? 1), 1, Math.max(1, total))
    this.sync()
  }

  /** 页码面总数（含补出来的白页） */
  get total(): number {
    return this._total
  }

  get page(): number {
    return this._page
  }

  view(page = this._page): View {
    return viewOf(page, this.display)
  }

  range(page = this._page): [number, number] {
    return rangeOf(page, this._total, this.display, this.domWindow)
  }

  /** 第 page 页的宿主 div —— 框架往这里渲染内容 */
  hostOf(page: number): HTMLElement | null {
    if (page < 1 || page > this._total) return null
    let host = this.hosts.get(page)
    if (!host) {
      host = box({
        left: '0',
        top: '0',
        right: 'auto',
        bottom: 'auto',
        width: `${this.size.width}px`,
        height: `${this.size.height}px`,
      })
      // 白页与真页走同一条创建路径，只差一个底色
      if (page === this.blankAt) host.style.background = '#fff'
      this.hosts.set(page, host)
      this.stageEl.appendChild(host)
    }
    return host
  }

  /** 第 page 页的裁切框（占半本，overflow 裁掉旋转溢出） */
  wrapOf(page: number): HTMLDivElement | null {
    if (page < 1 || page > this._total) return null
    let wrap = this.wraps.get(page)
    if (wrap) return wrap

    wrap = box({
      top: '0',
      width: `${this.size.width}px`,
      height: `${this.size.height}px`,
      overflow: 'hidden',
    })
    wrap.dataset.page = String(page)

    if (this.display === 'single' || halfOf(page, this.display, this.direction) === 0) {
      wrap.style.left = '0'
    } else {
      wrap.style.right = '0'
    }

    const wrapper = box({
      left: '0',
      top: '0',
      width: `${diagOf(this.size)}px`,
      height: `${diagOf(this.size)}px`,
      // 对角容器必须自裁：页在它里面旋转，靠它把折过去后多出的部分切掉
      overflow: 'hidden',
    })
    wrapper.dataset.page = String(page)
    wrap.appendChild(wrapper)
    this.wrappers.set(page, wrapper)

    this.hostOf(page)
    this.bookEl.appendChild(wrap)
    this.wraps.set(page, wrap)
    return wrap
  }

  /** 第 page 页的对角线容器：宿主平时住在这里，折页时由它做反向旋转 */
  wrapperOf(page: number): HTMLDivElement | null {
    return this.wrappers.get(page) ?? null
  }

  /**
   * 把 page 沿 corner 折到页内坐标 at（静态一帧，供取证与拖拽复用）。
   * 纸的背面默认取该页天然翻向的那一侧。
   */
  foldPage(page: number, corner: Corner, at: Point, toward: Toward = naturalToward(page)): boolean {
    const back = backOf(page, toward, this._total)
    return this.fold.apply(page, back, corner, at, this.gradients)
  }

  /** 收起当前折页 */
  foldEnd(): void {
    this.fold.end()
  }

  /** 无动画重排到某一页；动画版将来包这一层 */
  goTo(page: number): boolean {
    const next = clamp(Math.floor(page), 1, Math.max(1, this._total))
    if (next === this._page) return false
    // 折页途中跳页：先收起，免得借出去的背面页被布局抢走
    this.interact?.abort() // 补间与悬停态一并中止，免得下一帧把折层救活
    this.fold.end()
    this._page = next
    this.sync()
    this.listeners.get('change')?.forEach((fn) => fn(next, this.view()))
    return true
  }

  /** 按当前 page 重算 range 与显隐，把宿主借给对角容器或收回 staging */
  sync(): void {
    const view = this.view()
    const [start, end] = this.range()
    const held = this.fold.busy ? this.fold.backPage : 0

    for (let page = start; page <= end; page++) {
      const loc = locOf(page, view, this.display)
      const wrap = this.wrapOf(page)
      if (!wrap) continue
      wrap.style.display = loc === 0 ? 'none' : ''
      wrap.style.zIndex = String(loc === 1 ? this._total : this._total - 1)

      if (page === held) continue // 背面页正被折层持有，别抢
      const host = this.hostOf(page)
      const wrapper = this.wrappers.get(page)
      if (host && wrapper && host.parentElement !== wrapper) wrapper.appendChild(host)
    }

    // 出窗的页：裁切框整个撤掉，宿主收回 staging，框架可据此卸载内容。
    // 旧实现少了这一步（只调 z-index、所有页 DOM 常驻），才有封底串到
    // 第 1 页左边那类漏画。
    for (const [page, wrap] of this.wraps) {
      if (page >= start && page <= end) continue
      const host = this.hosts.get(page)
      if (host && host.parentElement !== this.stageEl && page !== held) {
        this.stageEl.appendChild(host)
      }
      wrap.remove()
      this.wraps.delete(page)
      this.wrappers.delete(page)
    }
  }

  on(event: FlipBookEvent, listener: Listener): this {
    let set = this.listeners.get(event)
    if (!set) this.listeners.set(event, (set = new Set()))
    set.add(listener)
    return this
  }

  off(event: FlipBookEvent, listener: Listener): this {
    this.listeners.get(event)?.delete(listener)
    return this
  }

  destroy(): void {
    this.interact?.destroy()
    this.fold.end()
    this.hosts.forEach((host) => host.remove())
    this.wraps.forEach((wrap) => wrap.remove())
    this.hosts.clear()
    this.wraps.clear()
    this.wrappers.clear()
    this.listeners.clear()
    this.bookEl.remove()
    this.stageEl.remove()
  }
}
