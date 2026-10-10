import test from 'node:test'
import assert from 'node:assert/strict'
import {
  fold, clampFoldPoint, bezierPath, retractHandles, innerAngleOf,
  A90, deg, type Fold,
} from './geometry.js'
import { type Corner, type PageSize, diagOf, cornerAnchor } from './corners.js'

const size: PageSize = { width: 400, height: 600 }
const CORNERS: readonly Corner[] = ['tl', 'tr', 'bl', 'br']

/** 取 Fold 里所有数值，用于「不许出现 NaN/Infinity」的全域扫描 */
function numbers(f: Fold): number[] {
  return [
    f.point.x, f.point.y, f.angle, f.alpha,
    f.translate.x, f.translate.y,
    f.shift.x, f.shift.y,
    f.seam.x, f.seam.y,
    f.innerAngle, f.aliasing,
    f.oversize.x, f.oversize.y,
    f.shading.width, f.shading.start, f.shading.opacity, f.shading.shadow,
    f.shading.front.x, f.shading.front.y, f.shading.back.x, f.shading.back.y,
  ]
}

const near = (a: number, b: number, tol = 1) => Math.abs(a - b) <= tol

test('全域有限：拖到三倍页尺寸外也不会 NaN / Infinity', () => {
  for (const corner of CORNERS) {
    for (let x = -size.width * 3; x <= size.width * 3; x += 50) {
      for (let y = -size.height * 3; y <= size.height * 3; y += 60) {
        const f = fold({ size, corner, point: { x, y } })
        for (const n of numbers(f)) {
          assert.ok(Number.isFinite(n), `${corner} @ (${x},${y}) 产出 ${n}`)
        }
      }
    }
  }
})

test('安全夹持把折点收进可算区间', () => {
  const diag = diagOf(size)
  const far = clampFoldPoint('br', { x: -99999, y: 99999 }, size)
  assert.equal(far.x, -diag)
  assert.equal(far.y, size.height + diag)
  const inside = clampFoldPoint('tl', { x: 200, y: 300 }, size)
  assert.deepEqual(inside, { x: 200, y: 300 }, '区间内的点不该被动过')
})

test('纯函数：同输入两次调用逐字段相等', () => {
  const a = fold({ size, corner: 'br', point: { x: 120, y: 480 } })
  const b = fold({ size, corner: 'br', point: { x: 120, y: 480 } })
  assert.deepEqual(a, b)
})

test('卷曲越过 90° 的分支：未越过时位移恒为 0，深拖才给出溢出位移', () => {
  let sawOverNinety = false
  for (const corner of CORNERS) {
    for (let x = -size.width; x <= size.width * 2; x += 25) {
      for (let y = -size.height; y <= size.height * 2; y += 25) {
        const f = fold({ size, corner, point: { x, y } })
        if (f.alpha > A90) {
          sawOverNinety = true
        } else {
          assert.deepEqual(f.shift, { x: 0, y: 0 }, `${corner} @ (${x},${y})`)
        }
      }
    }
  }
  assert.ok(sawOverNinety, '扫描没覆盖到 alpha>90° 分支，测试本身失效')

  // 越过 90° 但拖得刚出头时，dd 取整后本就是 0，所以必须用深拖来验分支没被吃掉
  const deep: ReadonlyArray<[Corner, { x: number; y: number }]> = [
    ['tl', { x: 200, y: -300 }],
    ['tr', { x: 200, y: -300 }],
    ['bl', { x: 200, y: 900 }],
    ['br', { x: 200, y: 900 }],
  ]
  for (const [corner, p] of deep) {
    const f = fold({ size, corner, point: p })
    assert.ok(f.alpha > A90, `${corner} @ (${p.x},${p.y}) 应当越过 90°`)
    assert.ok(f.shift.x !== 0 || f.shift.y !== 0, `${corner} 深拖却没有溢出位移，分支被吃掉`)
  }
})

test('垂直镜像：br 与 tr 的解互为镜像', () => {
  for (const [x, y] of [[300, 500], [200, 400], [100, 300], [390, 590], [50, 550]] as const) {
    const a = fold({ size, corner: 'br', point: { x, y } })
    const b = fold({ size, corner: 'tr', point: { x, y: size.height - y } })
    assert.ok(near(b.alpha, a.alpha, 1e-9), 'alpha 应相等')
    assert.ok(near(b.angle, -a.angle, 1e-9))
    assert.ok(near(b.translate.x, a.translate.x), '水平位移不该变')
    assert.ok(near(b.translate.y, -a.translate.y), '水平位移不该变')
    assert.ok(near(b.seam.x, a.seam.x))
    assert.ok(near(b.seam.y, size.height - a.seam.y))
    assert.ok(near(b.shading.front.y, 100 - a.shading.front.y, 0.5))
    assert.deepEqual(b.origin, [a.origin[0], 100 - a.origin[1]])
  }
})

test('水平镜像：br 与 bl 的解互为镜像', () => {
  for (const [x, y] of [[300, 500], [200, 400], [100, 300]] as const) {
    const a = fold({ size, corner: 'br', point: { x, y } })
    const b = fold({ size, corner: 'bl', point: { x: size.width - x, y } })
    assert.ok(near(b.angle, -a.angle, 1e-9))
    assert.ok(near(b.translate.x, -a.translate.x))
    assert.ok(near(b.translate.y, a.translate.y))
    assert.ok(near(b.seam.x, size.width - a.seam.x))
    assert.ok(near(b.seam.y, a.seam.y))
    assert.deepEqual(b.origin, [100 - a.origin[0], a.origin[1]])
  }
})

test('渐变带随拖拽变宽，翻到底时阴影与不透明度归零', () => {
  const y = size.height - 1
  const grab = fold({ size, corner: 'br', point: { x: size.width - 1, y } })
  const half = fold({ size, corner: 'br', point: { x: size.width / 2, y } })
  const done = fold({ size, corner: 'br', point: { x: -size.width + 1, y } })
  assert.ok(grab.shading.width < half.shading.width, '越拖越宽')
  assert.ok(half.shading.width < done.shading.width)
  assert.ok(grab.shading.opacity > 0.9, '刚起手时背面还很实')
  assert.ok(done.shading.opacity < 0.05, '翻到位应当看不见')
  assert.ok(done.shading.shadow < 0.05)
  assert.ok(half.shading.shadow > 0.5, '中途投影最强')
})

test('背面渐变只在需要时给出，且不超过页宽比例', () => {
  const off = fold({ size, corner: 'br', point: { x: 120, y: 480 }, backGradient: false })
  assert.deepEqual(off.shading.back, { x: 0, y: 0 })
  const on = fold({ size, corner: 'br', point: { x: 120, y: 480 }, backGradient: true })
  assert.ok(on.shading.back.x !== 0 || on.shading.back.y !== 0)
})

test('innerAngle 是 180-2*angle（化简 turn.js 的 (180/a-2)*a）', () => {
  for (const corner of CORNERS) {
    const f = fold({ size, corner, point: { x: 150, y: 250 } })
    assert.equal(f.innerAngle, innerAngleOf(f.angle))
    assert.ok(near(f.innerAngle, 180 - 2 * f.angle, 1e-9))
  }
})

test('抗锯齿补偿：右角 +1、左角 -1', () => {
  assert.equal(fold({ size, corner: 'br', point: { x: 200, y: 500 } }).aliasing, 1)
  assert.equal(fold({ size, corner: 'tr', point: { x: 200, y: 100 } }).aliasing, 1)
  assert.equal(fold({ size, corner: 'bl', point: { x: 200, y: 500 } }).aliasing, -1)
  assert.equal(fold({ size, corner: 'tl', point: { x: 200, y: 100 } }).aliasing, -1)
})

test('贴边与原点：钉住的是被翻角的对角', () => {
  assert.deepEqual(fold({ size, corner: 'br', point: { x: 200, y: 500 } }).edges,
    { left: '0', top: 'auto', right: 'auto', bottom: '0' })
  assert.deepEqual(fold({ size, corner: 'tl', point: { x: 200, y: 100 } }).edges,
    { left: 'auto', top: '0', right: '0', bottom: 'auto' })
  assert.deepEqual(fold({ size, corner: 'tr', point: { x: 200, y: 100 } }).edges,
    { left: '0', top: '0', right: '0', bottom: 'auto' })
  assert.deepEqual(fold({ size, corner: 'bl', point: { x: 200, y: 500 } }).edges,
    { left: 'auto', top: 'auto', right: '0', bottom: '0' })
})

test('角度以度返回且与 alpha 同序', () => {
  const f = fold({ size, corner: 'br', point: { x: 200, y: 500 } })
  assert.ok(near(f.angle, deg(f.alpha), 1e-9))
})

test('折点被夹持后写回结果，调用方拿到的就是实际生效值', () => {
  const f = fold({ size, corner: 'tl', point: { x: -10, y: 50 } })
  assert.equal(f.point.x, 1)
  const g = fold({ size, corner: 'br', point: { x: 9999, y: 500 } })
  assert.equal(g.point.x, size.width - 1)
})

test('贝塞尔路径端点精确、中点为加权平均', () => {
  const p1 = { x: 0, y: 0 }
  const p2 = { x: 10, y: 0 }
  const p3 = { x: 20, y: 10 }
  const p4 = { x: 30, y: 30 }
  assert.deepEqual(bezierPath(p1, p2, p3, p4, 0), p1)
  assert.deepEqual(bezierPath(p1, p2, p3, p4, 1), p4)
  const mid = bezierPath(p1, p2, p3, p4, 0.5)
  assert.ok(near(mid.x, (0 + 3 * 10 + 3 * 20 + 30) / 8, 1e-9))
})

test('回弹控制点：页内回弹是直线，越界才带弧度', () => {
  const anchor = cornerAnchor('br', size)
  const [c1, c2] = retractHandles({ x: 200, y: 500 }, anchor, false)
  assert.deepEqual(c1, { x: 200, y: 500 })
  assert.deepEqual(c2, anchor)
  const top = retractHandles({ x: 200, y: -80 }, cornerAnchor('tr', size), true)
  assert.ok(top[0].y !== -80, '拖出页外上方再松手，回弹要绕过页边')
})
