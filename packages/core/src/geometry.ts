/**
 * 折页几何：把 turn.js 4.1 的 sheet（卷角）效果数学改写成纯函数。
 *
 * 坐标系：单页设计坐标，原点在页左上，x∈[0,width]、y∈[0,height]；
 * 折点允许越界（拖出页外），此时卷曲会贴住页边。
 *
 * 渲染模型（与 turn.js 一致，四层）：
 *   pageWrap  裁切框（overflow:hidden）
 *     wrapper 对角线尺寸容器，反向旋转 -angle
 *       page  页内容，旋转 +angle
 *   fparent   全书共享浮层
 *     fwrapper 对角线尺寸容器，反向旋转 -angle
 *       fpage  被翻起那张纸的背面，旋转 +angle 再转 innerAngle
 * 静止与拖动都只由 `fold()` 的一个返回值决定，DOM 层只负责照抄。
 */

import {
  type Corner, type PageSize, type Point,
  cornerAnchor, cornerTarget, diagOf, isLeft, isTop, point, clampCornerX,
} from './corners.js'

export const PI = Math.PI
export const A90 = PI / 2
export const deg = (rad: number): number => (rad * 180) / PI

export type CssEdge = '0' | 'auto'

/** 页与浮层钉在哪几条边上（卷曲时页被"推"到某个角上） */
export interface CssEdges {
  left: CssEdge
  top: CssEdge
  right: CssEdge
  bottom: CssEdge
}

export interface Shading {
  /** 渐变带宽度（px） */
  width: number
  /** 渐变起点位置（0-1） */
  start: number
  /** 不透明度系数（0-1） */
  opacity: number
  /** 投影强度（0-1） */
  shadow: number
  /** 正面渐变终点（百分比，已按角翻转） */
  front: Point
  /** 背面渐变终点（百分比，已按角翻转） */
  back: Point
}

export interface Fold {
  corner: Corner
  /** 夹持后的折点 */
  point: Point
  /** 被翻的角在上边（否则下边） */
  top: boolean
  /** 被翻的角在左边（否则右边） */
  left: boolean
  /** 主旋转角（度，含符号） */
  angle: number
  /** alpha 原始弧度，渐变方向要用 */
  alpha: number
  /** 页与浮层的位移 */
  translate: Point
  /** 对角容器的溢出位移（卷曲未越过 90° 时为 0） */
  shift: Point
  /** 折缝位移 */
  seam: Point
  /** 背面那层要再转的角度（度） */
  innerAngle: number
  /** 页与浮层各自的贴边（'0' 表示钉住该边，'auto' 表示放开） */
  edges: CssEdges
  /** transform-origin（百分比） */
  origin: [number, number]
  /** 亚像素补偿（±1px），角速度正对 90° 时为 0 */
  aliasing: number
  /** 容器比页大出来那部分的回补位移 */
  oversize: Point
  shading: Shading
}

export interface FoldInput {
  size: PageSize
  corner: Corner
  /** 折点（页内坐标） */
  point: Point
  gradients?: boolean
  /** 是否需要背面投影：靠近封面与封底的那几张纸不需要 */
  backGradient?: boolean
}

interface CornerSpec {
  /** translate 分量符号 */
  sx: 1 | -1
  sy: 1 | -1
  /** 角度符号 */
  sign: 1 | -1
  edges: CssEdges
  origin: [number, number]
}

const SPEC: Record<Corner, CornerSpec> = {
  tl: { sx: 1, sy: 1, sign: 1, edges: { left: 'auto', top: '0', right: '0', bottom: 'auto' }, origin: [100, 0] },
  tr: { sx: -1, sy: 1, sign: -1, edges: { left: '0', top: '0', right: '0', bottom: 'auto' }, origin: [0, 0] },
  bl: { sx: 1, sy: -1, sign: -1, edges: { left: 'auto', top: 'auto', right: '0', bottom: '0' }, origin: [100, 100] },
  br: { sx: -1, sy: -1, sign: 1, edges: { left: '0', top: 'auto', right: 'auto', bottom: '0' }, origin: [0, 100] },
}

/**
 * 背面那层要再转的角度。
 * turn.js 写作 `(180/a - 2)*a`，恒等于 `180 - 2a`，化简后免掉 a 为 0 的除法。
 */
export const innerAngleOf = (angle: number): number => 180 - 2 * angle

const emptyShading = (): Shading => ({
  width: 0, start: 0, opacity: 0, shadow: 0, front: point(), back: point(),
})

/**
 * 折点安全夹持。
 *
 * turn.js 把指针坐标原样喂进数学，拖得离页足够远时
 * `sqrt(h² + 2*mid.x*rel.x)` 的判别式转负，整个返回值变 NaN，
 * 页面僵死在最后一帧。展开该式：右角为 diag² - p.x²，左角为
 * diag² + w² - (p.x-w)²，故把 x 限制在锚点同侧 diag 内即恒非负。
 * 超出这个范围卷曲视觉早已饱和，夹持只挡 NaN，不改观感。
 */
export function clampFoldPoint(corner: Corner, p: Point, size: PageSize): Point {
  const { width: w, height: h } = size
  const diag = diagOf(size)
  const lo = isLeft(corner) ? w - diag : -diag
  const hi = isLeft(corner) ? w + diag : diag
  return point(
    Math.min(Math.max(p.x, lo), hi),
    Math.min(Math.max(p.y, -diag), h + diag),
  )
}

/**
 * 给定角与折点，算出四层各自的 transform 参数与阴影参数。
 *
 * turn.js 在卷曲越过页高时会就地改写折点 y 并递归重算；这里用有限次循环
 * 等价替代（循环体每轮都让卷曲更贴页边，实测两轮内收敛，guard 只是保险）。
 */
export function fold(input: FoldInput): Fold {
  const { size, corner, gradients = true, backGradient = false } = input
  const { width: w, height: h } = size
  const spec = SPEC[corner]
  const top = isTop(corner)
  const left = isLeft(corner)
  const diag = diagOf(size)
  const anchor = cornerAnchor(corner, size)

  const safe = clampFoldPoint(corner, input.point, size)
  const p0 = clampCornerX(corner, safe, size)
  let p = point(p0.x, p0.y)

  let alpha = A90
  let tr = point()
  for (let guard = 0; guard < 8; guard++) {
    // turn.js 里 rel.y 受 hasRot 能力探测控制；现代浏览器恒可旋转，取其真值分支
    const rel = point(
      anchor.x ? anchor.x - p.x : p.x,
      anchor.y ? anchor.y - p.y : p.y,
    )
    const mid = point(left ? w - rel.x / 2 : p.x + rel.x / 2, rel.y / 2)

    alpha = A90 - Math.atan2(rel.y, rel.x)
    const gamma = alpha - Math.atan2(mid.y, mid.x)
    const dist = Math.max(0, Math.sin(gamma) * Math.hypot(mid.x, mid.y))
    tr = point(dist * Math.sin(alpha), dist * Math.cos(alpha))

    if (alpha <= A90) break

    tr.x += Math.abs((tr.y * rel.y) / rel.x)
    tr.y = 0
    if (Math.round(tr.x * Math.tan(PI - alpha)) >= h) break

    // 卷曲高度超出页高：把折点 y 修正到合法位置后重算
    const y = Math.sqrt(h * h + 2 * mid.x * rel.x)
    p = point(p.x, top ? h - y : y)
  }

  // px / 渐变要用未取整的 tr，与 turn.js 的取整时机一致
  const px = Math.round(tr.y / Math.tan(alpha) + tr.x)
  const side = w - px
  const sideX = side * Math.cos(alpha * 2)
  const sideY = side * Math.sin(alpha * 2)
  const seam = point(
    Math.round(left ? side - sideX : px + sideX),
    Math.round(top ? sideY : h - sideY),
  )

  let shift = point()
  if (alpha > A90) {
    const beta = PI - alpha
    const dd = diag - h / Math.sin(beta)
    shift = point(Math.round(dd * Math.cos(beta)), Math.round(dd * Math.sin(beta)))
    if (left) shift.x = -shift.x
    if (top) shift.y = -shift.y
  }

  const angle = spec.sign * deg(alpha)
  const translate = point(spec.sx * Math.round(tr.x), spec.sy * Math.round(tr.y))

  const shading = emptyShading()
  if (gradients) {
    const gw = side * Math.sin(alpha)
    const target = cornerTarget(corner, size)
    const far = Math.hypot(target.x - p.x, target.y - p.y) / w
    shading.width = gw
    shading.shadow = Math.sin(A90 * (far > 1 ? 2 - far : far))
    shading.opacity = Math.min(far, 1)
    shading.start = gw > 100 ? (gw - 100) / gw : 0
    shading.front = point((gw * Math.sin(alpha) / w) * 100, (gw * Math.cos(alpha) / h) * 100)
    if (backGradient) {
      shading.back = point(
        (gw * 1.2 * Math.sin(alpha) / w) * 100,
        (gw * 1.2 * Math.cos(alpha) / h) * 100,
      )
      if (!left) shading.back.x = 100 - shading.back.x
      if (!top) shading.back.y = 100 - shading.back.y
    }
    if (spec.origin[0]) shading.front.x = 100 - shading.front.x
    if (spec.origin[1]) shading.front.y = 100 - shading.front.y
  }

  return {
    corner,
    point: p,
    top,
    left,
    angle,
    alpha,
    translate,
    shift,
    seam,
    innerAngle: innerAngleOf(angle),
    edges: spec.edges,
    origin: spec.origin,
    aliasing: (angle !== 90 && angle !== -90) ? (left ? -1 : 1) : 0,
    oversize: point(
      ((w - diag) * spec.origin[0]) / 100,
      ((h - diag) * spec.origin[1]) / 100,
    ),
    shading,
  }
}

/**
 * 三次贝塞尔路径上的点：拖拽回弹与自动翻页的折点轨迹用它（turn.js 亦然）。
 * 端点插值在 t=0/1 处精确落在 p1/p4。
 */
export function bezierPath(p1: Point, p2: Point, p3: Point, p4: Point, t: number): Point {
  const u = 1 - t
  const uu = u * u
  const tt = t * t
  return point(
    uu * u * p1.x + 3 * uu * t * p2.x + 3 * u * tt * p3.x + tt * t * p4.x,
    uu * u * p1.y + 3 * uu * t * p2.y + 3 * u * tt * p3.y + tt * t * p4.y,
  )
}

/**
 * 回弹路径的两个控制点。
 * 只有折点越出页外（拖过头）时才给出弧度，正常回弹是直线——与 turn.js 一致，
 * 故 `top` 必须由角名推出（isTop(corner)），不能拿 y 大小猜。
 */
export function retractHandles(from: Point, to: Point, top: boolean): [Point, Point] {
  const delta = top
    ? Math.min(0, from.y - to.y) / 2
    : Math.max(0, from.y - to.y) / 2
  return [point(from.x, from.y + delta), point(to.x, to.y - delta)]
}
