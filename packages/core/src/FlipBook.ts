/**
 * FlipBook：框架无关的翻书主类。
 *
 * 本单元的边界 —— 只做静态布局：把页摆到该在的半本上、按 range 借还宿主、
 * 按 loc 决定显隐与叠放。折页渲染、拖拽、动画在后续单元接进来。
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
  DOM_WINDOW, bookSizeOf, halfOf, locOf, needsBlankPage, rangeOf, viewOf, type View,
} from './layout.js'

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
  private readonly hosts = new Map<number, HTMLElement>()
  private readonly listeners = new Map<FlipBookEvent, Set<Listener>>()
  /** 补出来的那张白页的页号，没补则 null */
  private readonly blankAt: number | null

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

  /** 无动画重排到某一页；动画版将来包这一层 */
  goTo(page: number): boolean {
    const next = clamp(Math.floor(page), 1, Math.max(1, this._total))
    if (next === this._page) return false
    this._page = next
    this.sync()
    this.listeners.get('change')?.forEach((fn) => fn(next, this.view()))
    return true
  }

  /** 按当前 page 重算 range 与显隐，把宿主借给裁切框或收回 staging */
  sync(): void {
    const view = this.view()
    const [start, end] = this.range()

    for (let page = start; page <= end; page++) {
      const loc = locOf(page, view, this.display)
      const wrap = this.wrapOf(page)
      wrap.style.display = loc === 0 ? 'none' : ''
      wrap.style.zIndex = String(loc === 1 ? this._total : this._total - 1)

      const host = this.hostOf(page)
      if (host && host.parentElement !== wrap) wrap.appendChild(host)
    }

    // 出窗的页：裁切框整个撤掉，宿主收回 staging，框架可据此卸载内容。
    // 旧实现少了这一步（只调 z-index、所有页 DOM 常驻），才有封底串到
    // 第 1 页左边那类漏画。
    for (const [page, wrap] of this.wraps) {
      if (page >= start && page <= end) continue
      const host = this.hosts.get(page)
      if (host && host.parentElement === wrap) this.stageEl.appendChild(host)
      wrap.remove()
      this.wraps.delete(page)
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
    this.hosts.forEach((host) => host.remove())
    this.wraps.forEach((wrap) => wrap.remove())
    this.hosts.clear()
    this.wraps.clear()
    this.listeners.clear()
    this.bookEl.remove()
    this.stageEl.remove()
  }

  /** 第 page 页的裁切框：尺寸恒为一页，位置由所在半本决定 */
  private wrapOf(page: number): HTMLDivElement {
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

    this.hostOf(page)
    this.bookEl.appendChild(wrap)
    this.wraps.set(page, wrap)
    return wrap
  }
}
