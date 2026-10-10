import test from 'node:test'
import assert from 'node:assert/strict'
import {
  type PageSize,
  cornerAnchor, cornerTarget, diagOf, clampCornerX,
  allowedCorners, hitCorner, releaseDecision, singleTarget,
  type PageContext,
} from './corners.js'

const size: PageSize = { width: 400, height: 600 }
const ctx = (over: Partial<PageContext> = {}): PageContext => ({
  page: 1, pages: 6, display: 'double', direction: 'ltr', ...over,
})

test('对角线容器边长取整', () => {
  assert.equal(diagOf({ width: 3, height: 4 }), 5)
  assert.equal(diagOf(size), 721) // round(hypot(400,600))
})

test('角锚点与完全翻过去的落点', () => {
  assert.deepEqual(cornerAnchor('tl', size), { x: 0, y: 0 })
  assert.deepEqual(cornerAnchor('br', size), { x: 400, y: 600 })
  assert.deepEqual(cornerAnchor('tr', size, 50), { x: 350, y: 50 })
  assert.deepEqual(cornerTarget('br', size), { x: -400, y: 600 })
  assert.deepEqual(cornerTarget('tl', size), { x: 800, y: 0 })
})

test('折点 x 夹持同时是除零保护', () => {
  assert.equal(clampCornerX('tl', { x: -50, y: 10 }, size).x, 1)
  assert.equal(clampCornerX('br', { x: 9999, y: 10 }, size).x, 399)
})

test('double 模式：奇数页只能从右角翻，偶数页只能从左角翻', () => {
  assert.deepEqual([...allowedCorners(ctx({ page: 1 }))], ['br', 'tr'])
  assert.deepEqual([...allowedCorners(ctx({ page: 2 }))], ['bl', 'tl'])
  assert.deepEqual([...allowedCorners(ctx({ page: 3 }))], ['br', 'tr'])
})

test('double 模式 rtl：左右相反', () => {
  assert.deepEqual([...allowedCorners(ctx({ page: 1, direction: 'rtl' }))], ['bl', 'tl'])
  assert.deepEqual([...allowedCorners(ctx({ page: 2, direction: 'rtl' }))], ['br', 'tr'])
})

test('single 模式：首页只有前进角、末页只有后退角、中间四角皆可', () => {
  const single = { display: 'single' as const, pages: 6, direction: 'ltr' as const }
  assert.deepEqual([...allowedCorners({ ...single, page: 1 })], ['br', 'tr'])
  assert.deepEqual([...allowedCorners({ ...single, page: 6 })], ['bl', 'tl'])
  assert.equal(allowedCorners({ ...single, page: 3 }).length, 4)
})

test('命中测试：角部热区内返回角名，页中部与页外返回 null', () => {
  const h = { ...ctx({ page: 1 }), size, cornerSize: 100 }
  assert.deepEqual(hitCorner({ x: 399, y: 599 }, h), { x: 399, y: 599, corner: 'br' })
  assert.deepEqual(hitCorner({ x: 399, y: 1 }, h), { x: 399, y: 1, corner: 'tr' })
  assert.equal(hitCorner({ x: 1, y: 1 }, h), null, '第 1 页不能往回翻，左上角不响应')
  assert.equal(hitCorner({ x: 200, y: 300 }, h), null, '页中部不该命中')
  assert.equal(hitCorner({ x: 200, y: 599 }, h), null, '只在下带、不在左右带')
  assert.equal(hitCorner({ x: 0, y: 599 }, h), null, '边界外')
  assert.equal(hitCorner({ x: 400, y: 599 }, h), null, '右边界本身不算页内')
})

test('命中测试：此刻不允许的角不返回', () => {
  const h = { ...ctx({ page: 2 }), size, cornerSize: 100 } // 偶数页只能左角
  assert.equal(hitCorner({ x: 399, y: 599 }, h), null)
  assert.equal(hitCorner({ x: 1, y: 599 }, h)?.corner, 'bl')
})

test('释放判定 double：拖出页外或快速点击才算翻过去', () => {
  const base = { display: 'double' as const, size }
  assert.equal(releaseDecision({ x: -1, y: 599, corner: 'br' }, { ...base, pressedMs: 900 }), true)
  assert.equal(releaseDecision({ x: 401, y: 599, corner: 'bl' }, { ...base, pressedMs: 900 }), true)
  assert.equal(releaseDecision({ x: 200, y: 599, corner: 'br' }, { ...base, pressedMs: 120 }), true, '点一下就翻')
  assert.equal(releaseDecision({ x: 200, y: 599, corner: 'br' }, { ...base, pressedMs: 900 }), false, '慢慢拖到中间松手要弹回')
})

test('释放判定 single：看有没有拖过页中线', () => {
  const base = { display: 'single' as const, size, pressedMs: 900 }
  assert.equal(releaseDecision({ x: 150, y: 300, corner: 'br' }, base), true)
  assert.equal(releaseDecision({ x: 250, y: 300, corner: 'br' }, base), false)
  assert.equal(releaseDecision({ x: 250, y: 300, corner: 'bl' }, base), true)
  assert.equal(releaseDecision({ x: 150, y: 300, corner: 'tl' }, base), false)
})

test('single 抓左侧角是后退、抓右侧角是前进', () => {
  assert.equal(singleTarget(3, 'bl', 'ltr'), 2)
  assert.equal(singleTarget(3, 'br', 'ltr'), 4)
  assert.equal(singleTarget(3, 'bl', 'rtl'), 4)
  assert.equal(singleTarget(3, 'tr', 'rtl'), 2)
})
