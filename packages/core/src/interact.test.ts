import test from 'node:test'
import assert from 'node:assert/strict'
import type { PressContext } from './interact.js'
import { foldTowardOf, pressIntentOf } from './interact.js'

const size = { width: 400, height: 600 }
const ctx = (over: Partial<PressContext> = {}): PressContext => ({
  at: { x: 0, y: 0 },
  current: 1,
  display: 'double',
  direction: 'ltr',
  total: 6,
  size,
  cornerSize: 100,
  ...over,
})

test('double ltr 封面：右下热区命中第 1 页，落在第 2 页（背面页）', () => {
  const hit = pressIntentOf(ctx({ at: { x: 799, y: 599 } }))
  assert.deepEqual(hit, { page: 1, toward: 'forward', target: 2, corner: 'br', offsetX: 400 })
})

test('double ltr 封面：左半没有页码面，左侧角不响应', () => {
  assert.equal(pressIntentOf(ctx({ at: { x: 1, y: 599 } })), null)
})

test('double：页中部与书缝不命中', () => {
  assert.equal(pressIntentOf(ctx({ current: 5, at: { x: 200, y: 300 } })), null)
  assert.equal(pressIntentOf(ctx({ current: 5, at: { x: 400, y: 599 } })), null, '书缝正上是右页帧的 x=0，不算页内')
})

test('view [4,5]：左下角折第 4 页后退，落在第 3 页', () => {
  const hit = pressIntentOf(ctx({ current: 5, at: { x: 1, y: 599 } }))
  assert.deepEqual(hit, { page: 4, toward: 'backward', target: 3, corner: 'bl', offsetX: 0 })
})

test('view [4,5]：右下角折第 5 页前进，落在第 6 页（总页数偶、翻完右半空）', () => {
  const hit = pressIntentOf(ctx({ current: 5, at: { x: 799, y: 599 } }))
  assert.deepEqual(hit, { page: 5, toward: 'forward', target: 6, corner: 'br', offsetX: 400 })
})

test('书到头：最末页没有背面页，拒绝起折', () => {
  assert.equal(pressIntentOf(ctx({ total: 7, current: 7, at: { x: 799, y: 599 } })), null)
  assert.equal(
    pressIntentOf(ctx({ total: 1, current: 1, display: 'single', at: { x: 399, y: 599 } })),
    null,
    '整本书只有一面时同样无可折',
  )
})

test('double rtl：左侧角折左半的奇数页前进、右侧角折右半的偶数页后退', () => {
  const left = pressIntentOf(ctx({ current: 5, direction: 'rtl', at: { x: 1, y: 1 } }))
  assert.deepEqual(left, { page: 5, toward: 'forward', target: 6, corner: 'tl', offsetX: 0 })
  const right = pressIntentOf(ctx({ current: 5, direction: 'rtl', at: { x: 799, y: 1 } }))
  assert.deepEqual(right, { page: 4, toward: 'backward', target: 3, corner: 'tr', offsetX: 400 })
})

test('single：抓左侧角后退、抓右侧角前进、页中部不命中', () => {
  const left = pressIntentOf(ctx({ display: 'single', current: 3, at: { x: 1, y: 599 } }))
  assert.deepEqual(left, { page: 3, toward: 'backward', target: 2, corner: 'bl', offsetX: 0 })
  const right = pressIntentOf(ctx({ display: 'single', current: 3, at: { x: 399, y: 599 } }))
  assert.deepEqual(right, { page: 3, toward: 'forward', target: 4, corner: 'br', offsetX: 0 })
  assert.equal(pressIntentOf(ctx({ display: 'single', current: 3, at: { x: 200, y: 300 } })), null)
})

test('single 封面：左侧角不响应（第 1 页只能前进）', () => {
  assert.equal(pressIntentOf(ctx({ display: 'single', current: 1, at: { x: 1, y: 599 } })), null)
})

test('single rtl：抓左侧角是前进', () => {
  const hit = pressIntentOf(ctx({ display: 'single', current: 3, direction: 'rtl', at: { x: 1, y: 1 } }))
  assert.deepEqual(hit, { page: 3, toward: 'forward', target: 4, corner: 'tl', offsetX: 0 })
})

test('foldTowardOf：与 turn.js _eventStart 的角侧 × 方向结论一致', () => {
  assert.equal(foldTowardOf('tr', 'ltr'), 'forward')
  assert.equal(foldTowardOf('br', 'ltr'), 'forward')
  assert.equal(foldTowardOf('tl', 'ltr'), 'backward')
  assert.equal(foldTowardOf('bl', 'ltr'), 'backward')
  assert.equal(foldTowardOf('tl', 'rtl'), 'forward')
  assert.equal(foldTowardOf('bl', 'rtl'), 'forward')
  assert.equal(foldTowardOf('tr', 'rtl'), 'backward')
  assert.equal(foldTowardOf('br', 'rtl'), 'backward')
})
