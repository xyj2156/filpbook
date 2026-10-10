/**
 * 角与页的几何约定：命名、允许集合、命中测试、释放判定。
 *
 * 角名按「上下 + 左右」两字母拼：tl / tr / bl / br。
 * 页码从 1 起（1 即封面那一面）。
 * 数学取自 turn.js 4.1 的 sheet（卷角）分支，hard 效果的 l / r 角不在本版范围。
 */

export type Corner = 'tl' | 'tr' | 'bl' | 'br'
export type Display = 'single' | 'double'
export type Direction = 'ltr' | 'rtl'

export interface Point {
  x: number
  y: number
}

export interface PageSize {
  width: number
  height: number
}

export const point = (x = 0, y = 0): Point => ({ x, y })

export const isTop = (corner: Corner): boolean => corner[0] === 't'
export const isLeft = (corner: Corner): boolean => corner[1] === 'l'

/** 对角容器边长：绕角旋转后仍能盖住整页 */
export const diagOf = (size: PageSize): number =>
  Math.round(Math.hypot(size.width, size.height))

/** 角锚点：这张纸完全平摊时该角所在的位置；inset 向内缩（peel 提示用） */
export function cornerAnchor(corner: Corner, size: PageSize, inset = 0): Point {
  const { width: w, height: h } = size
  switch (corner) {
    case 'tl': return point(inset, inset)
    case 'tr': return point(w - inset, inset)
    case 'bl': return point(inset, h - inset)
    case 'br': return point(w - inset, h - inset)
  }
}

/** 该角完全翻过去时折点的理论落点：算阴影强度与动画终点用 */
export function cornerTarget(corner: Corner, size: PageSize): Point {
  const { width: w, height: h } = size
  switch (corner) {
    case 'tl': return point(w * 2, 0)
    case 'tr': return point(-w, 0)
    case 'bl': return point(w * 2, h)
    case 'br': return point(-w, h)
  }
}

/**
 * 折点 x 的合法夹持。
 * 既是视觉边界，也是除零保护：rel.x 恒 >= 1，`tr.y * rel.y / rel.x` 不会炸。
 */
export function clampCornerX(corner: Corner, p: Point, size: PageSize): Point {
  return isLeft(corner)
    ? point(Math.max(p.x, 1), p.y)
    : point(Math.min(p.x, size.width - 1), p.y)
}

const FORWARD: readonly Corner[] = ['br', 'tr']
const BACKWARD: readonly Corner[] = ['bl', 'tl']
const ALL: readonly Corner[] = ['tl', 'tr', 'bl', 'br']

export interface PageContext {
  page: number
  pages: number
  display: Display
  direction: Direction
}

/** 这一页当前允许从哪些角翻起 */
export function allowedCorners(ctx: PageContext): readonly Corner[] {
  const odd = ctx.page % 2 === 1
  if (ctx.display === 'single') {
    if (ctx.page === 1) return ctx.direction === 'ltr' ? FORWARD : BACKWARD
    if (ctx.page === ctx.pages) return ctx.direction === 'ltr' ? BACKWARD : FORWARD
    return ALL
  }
  if (ctx.direction === 'ltr') return odd ? FORWARD : BACKWARD
  return odd ? BACKWARD : FORWARD
}

export interface HitContext extends PageContext {
  size: PageSize
  /** 角部热区边长 */
  cornerSize: number
}

export type Hit = Point & { corner: Corner }

/** 页内坐标 -> 命中的角；不在热区、或该角此刻不允许翻，返回 null */
export function hitCorner(p: Point, ctx: HitContext): Hit | null {
  const { width: w, height: h } = ctx.size
  const cs = ctx.cornerSize
  if (p.x <= 0 || p.y <= 0 || p.x >= w || p.y >= h) return null

  const row = p.y < cs ? 't' : p.y >= h - cs ? 'b' : ''
  const col = p.x <= cs ? 'l' : p.x >= w - cs ? 'r' : ''
  if (!row || !col) return null

  const corner = (row + col) as Corner
  if (!allowedCorners(ctx).includes(corner)) return null
  return { x: p.x, y: p.y, corner }
}

/**
 * 松手后该不该把这一页翻过去（否则弹回）。
 *
 * double：拖出页外，或按下不足 200ms 的快速点击（点角即翻页）才算翻过去。
 * single ：右半的角拖过中线、左半的角拖过中线才算。
 *
 * 注意 turn.js 在 double 下不看「过半」——旧实现按过半判定，是行为偏差。
 */
export function releaseDecision(
  hit: Hit,
  ctx: { display: Display; size: PageSize; pressedMs: number },
): boolean {
  if (ctx.display === 'single') {
    return isLeft(hit.corner)
      ? hit.x > ctx.size.width / 2
      : hit.x < ctx.size.width / 2
  }
  return ctx.pressedMs < 200 || hit.x < 0 || hit.x > ctx.size.width
}

/**
 * single 模式下抓住哪一侧决定翻去哪一页。
 * turn.js 还叠加了「已在多页途中则保留原目标」的簿记，那是编排层的事。
 */
export function singleTarget(page: number, corner: Corner, direction: Direction): number {
  const leftward =
    (isLeft(corner) && direction === 'ltr') || (!isLeft(corner) && direction === 'rtl')
  return leftward ? page - 1 : page + 1
}
