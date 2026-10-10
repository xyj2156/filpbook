/**
 * 布局：页码面 ↔ 物理纸 ↔ 可见区间。纯函数，不碰 DOM。
 *
 * 模型（与 turn.js 一致）：
 *   - 一个「页码面」就是一个页（D-01），奇偶两两配成一张物理纸；
 *   - double 下奇数页在右半、偶数页在左半（rtl 相反），第 1 页独占右半；
 *   - 只有当前 view 的两页在顶上，「即将被翻进来」的那页要预先存在于 DOM，
 *     其余页既不显示也不该占内容开销 —— 这就是 range。
 */

import type { Direction, Display } from './corners.js'

/** 同时留在书里的页数（turn.js 的 pagesInDOM = 6） */
export const DOM_WINDOW = 6

/** 可见的一对页 [左, 右]，0 表示该半本此刻没有页 */
export type View = readonly [left: number, right: number]

/** 相对当前 view 的位置 */
export type PageLoc =
  /** 正在显示 */
  | 1
  /** 垫在下一翻的翻起页下面，必须预先可见 */
  | 2
  /** 其余：裁切框收起不显示（纸的背面也在这里，它届时被搬进折层） */
  | 0

export type Toward = 'forward' | 'backward'

/** 该页翻起时背面露出的页码面；越界就还是自己（书翻到头） */
export function backOf(page: number, toward: Toward, pages: number): number {
  const next = toward === 'forward' ? page + 1 : page - 1
  return next >= 1 && next <= pages ? next : page
}

/** double 下这一页天然往哪边翻：奇数页在右半=前进，偶数页在左半=后退 */
export const naturalToward = (page: number): Toward => (page % 2 === 1 ? 'forward' : 'backward')

/** 当前 view：奇数页在右半，所以第 1 页是 [0,1]（封面独占） */
export function viewOf(page: number, display: Display): View {
  if (display === 'single') return [page, 0]
  return page % 2 === 1 ? [page - 1, page] : [page, page + 1]
}

/** 该页落在书的哪一半：0 左半、1 右半；single 占满整宽记 0 */
export function halfOf(page: number, display: Display, direction: Direction): 0 | 1 {
  if (display === 'single') return 0
  return (direction === 'ltr') === (page % 2 === 1) ? 1 : 0
}

/**
 * 这一页相对当前 view 的位置。
 *
 * loc=1 当前显示的两页。
 * loc=2 是「下一翻垫在翻起那页下面」的那页（前进时 view[1]+2、后退时 view[0]-2）：
 *   纸被掀开的过程中，它要立刻可见，所以必须预先存在并显示。
 *   注意纸的背面（相邻页 view[1]+1）不在这里——它会被搬进折层当背面，
 *   留在自己那半本里反而是多余的，所以它是 loc=0。
 * loc=0 其余页：裁切框收起，不占绘制。
 *
 * single 的前进预备页是 view[0]+1；后退侧的语义 turn.js 绕了一层
 * （_eventStart 改写 next），留到 single 专项单元再核。
 */
export function locOf(page: number, view: View, display: Display): PageLoc {
  if (page === view[0] || page === view[1]) return 1
  if (display === 'single') return page === view[0] + 1 ? 2 : 0
  return page === view[0] - 2 || page === view[1] + 2 ? 2 : 0
}

/**
 * 可见区间：以当前 view 为中心，按剩余空间向两侧摊开 domWindow 个页位。
 * 书的两端会把额度让给对方，避免窗口越界后另一侧空转。
 */
export function rangeOf(
  page: number,
  pages: number,
  display: Display,
  domWindow: number = DOM_WINDOW,
): [number, number] {
  if (pages < 1) return [1, 0]

  const view = viewOf(page, display)
  const v0 = view[0]
  const v1 = view[1] || view[0]

  let left: number
  let right: number
  if (v0 >= 1 && v1 <= pages) {
    const remaining = Math.floor((domWindow - 2) / 2)
    if (pages - v1 > v0) {
      left = Math.min(v0 - 1, remaining)
      right = 2 * remaining - left
    } else {
      right = Math.min(pages - v1, remaining)
      left = 2 * remaining - right
    }
  } else {
    left = domWindow - 1
    right = domWindow - 1
  }

  return [Math.max(1, v0 - left), Math.min(pages, v1 + right)]
}

/** 整本书的设计尺寸（double 为两页宽） */
export function bookSizeOf(size: { width: number; height: number }, display: Display) {
  return {
    width: display === 'double' ? size.width * 2 : size.width,
    height: size.height,
  }
}

/**
 * 是否补一张白页凑成完整的一对。
 *
 * 注意奇偶：pages 为偶数时最后一翻是 [N, N+1]，右半没有页；
 * 补一张（变奇数）才收得住。pages 为奇数时末尾本来就是完整的一对。
 */
export function needsBlankPage(pages: number, display: Display): boolean {
  return display === 'double' && pages % 2 === 0
}
