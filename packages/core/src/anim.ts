/**
 * 折点补间：turn.js animatef 的等价实现。
 *
 * 缓动 = easeOutCircular（turn.js 3327 行原式 sqrt(1-(t-1)²)），起步快、收尾缓；
 * 轨迹 = bezierPath，控制点缺省取端点自身——即直线（turn.js turnPage 传
 * bezier(p1, p1, p4, p4, v)，弹回才给 retractHandles 的弧线）。
 * rAF 驱动；cancel 冻结在当前帧，被接管时下一拍从冻结点继续。
 */

import type { Point } from './corners.js'
import { bezierPath } from './geometry.js'

export interface TweenSpec {
  from: Point
  to: Point
  /** 贝塞尔控制点；缺省 = [from, to]（直线） */
  handles?: readonly [Point, Point]
  duration: number
  frame(point: Point): void
  done?: () => void
}

export const easeOutCircular = (t: number): number => Math.sqrt(1 - (t - 1) * (t - 1))

export class FoldTween {
  private rafId = 0

  get busy(): boolean {
    return this.rafId !== 0
  }

  cancel(): void {
    if (this.rafId) {
      cancelAnimationFrame(this.rafId)
      this.rafId = 0
    }
  }

  destroy(): void {
    this.cancel()
  }

  run(spec: TweenSpec): void {
    this.cancel()
    const [h2, h3] = spec.handles ?? [spec.from, spec.to]
    const start = performance.now()
    const step = (now: number): void => {
      const t = Math.min(1, (now - start) / spec.duration)
      spec.frame(bezierPath(spec.from, h2, h3, spec.to, easeOutCircular(t)))
      if (t < 1) {
        this.rafId = requestAnimationFrame(step)
        return
      }
      this.rafId = 0
      spec.done?.()
    }
    step(start) // 首帧同步：与 turn.js animatef 一致，起折前不留空档
  }
}
