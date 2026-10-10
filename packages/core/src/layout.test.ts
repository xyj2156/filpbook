import test from 'node:test'
import assert from 'node:assert/strict'
import {
  viewOf, halfOf, locOf, rangeOf, backOf, naturalToward, bookSizeOf, needsBlankPage,
} from './layout.js'

test('view：第 1 页独占右半，之后两页一对', () => {
  assert.deepEqual(viewOf(1, 'double'), [0, 1])
  assert.deepEqual(viewOf(2, 'double'), [2, 3])
  assert.deepEqual(viewOf(3, 'double'), [2, 3])
  assert.deepEqual(viewOf(4, 'double'), [4, 5])
  assert.deepEqual(viewOf(3, 'single'), [3, 0])
})

test('half：ltr 奇右偶左，rtl 相反', () => {
  assert.equal(halfOf(1, 'double', 'ltr'), 1)
  assert.equal(halfOf(2, 'double', 'ltr'), 0)
  assert.equal(halfOf(3, 'double', 'ltr'), 1)
  assert.equal(halfOf(1, 'double', 'rtl'), 0)
  assert.equal(halfOf(2, 'double', 'rtl'), 1)
  assert.equal(halfOf(7, 'single', 'ltr'), 0)
})

test('loc：当前两页在顶上，下一翻垫底的那页预先可见，其余不显示', () => {
  const view = viewOf(2, 'double') // [2,3]
  assert.equal(locOf(2, view, 'double'), 1)
  assert.equal(locOf(3, view, 'double'), 1)
  // 把 page 3 掀到左边时，右半立刻露出 page 5，所以 5 要预先可见
  assert.equal(locOf(5, view, 'double'), 2)
  // page 4 是 page 3 那张纸的背面，届时被搬进折层，不必在窗里显示
  assert.equal(locOf(4, view, 'double'), 0)
  assert.equal(locOf(1, view, 'double'), 0, '翻过去的封面不该还画着')

  const back = viewOf(4, 'double') // [4,5]，往回翻掀左页 4，左半露出 page 2
  assert.equal(locOf(2, back, 'double'), 2)
  assert.equal(locOf(3, back, 'double'), 0, '3 是 4 的背面')
})

test('loc：single 只预先存在下一页', () => {
  const view = viewOf(3, 'single')
  assert.equal(locOf(3, view, 'single'), 1)
  assert.equal(locOf(4, view, 'single'), 2)
  assert.equal(locOf(5, view, 'single'), 0)
})

test('range：窗口不超过 domWindow，且两端把额度让给另一侧', () => {
  const width = (r: [number, number]) => r[1] - r[0] + 1

  assert.deepEqual(rangeOf(10, 20, 'double'), [8, 13])
  assert.equal(width(rangeOf(10, 20, 'double')), 6)

  // 书开头：view 是 [0,1]，左侧无空间，额度全给右侧
  assert.deepEqual(rangeOf(1, 20, 'double'), [1, 6])
  // 书结尾：右侧无空间
  assert.deepEqual(rangeOf(20, 20, 'double'), [15, 20])
  // 小于一窗：全部物化
  assert.deepEqual(rangeOf(1, 6, 'double'), [1, 6])
  assert.deepEqual(rangeOf(3, 0, 'double'), [1, 0], '空书返回空区间')
})

test('range：始终包含当前 view 与两侧 loc=2 那页', () => {
  for (let page = 1; page <= 24; page++) {
    const [start, end] = rangeOf(page, 24, 'double')
    const view = viewOf(page, 'double')
    const v0 = view[0] || view[1] // 封面那一翻左半是空的
    const v1 = Math.min(view[1] || view[0], 24) // 末页是偶数时右半是空的
    assert.ok(start <= v0 && v1 <= end, `page ${page} 的 view 掉出窗口`)
    assert.ok(end >= view[1] + 2 || view[1] + 2 > 24, `page ${page} 缺前进侧预备页`)
    assert.ok(start <= v0 - 2 || v0 - 2 < 1, `page ${page} 缺后退侧预备页`)
  }
})

test('back：纸的背面是相邻页，翻到头就是自己', () => {
  assert.equal(backOf(1, 'forward', 6), 2)
  assert.equal(backOf(2, 'backward', 6), 1)
  assert.equal(backOf(3, 'forward', 6), 4)
  assert.equal(backOf(6, 'forward', 6), 6)
  assert.equal(backOf(1, 'backward', 6), 1)
})

test('naturalToward：奇数页前进、偶数页后退', () => {
  assert.equal(naturalToward(1), 'forward')
  assert.equal(naturalToward(2), 'backward')
  assert.equal(naturalToward(3), 'forward')
})

test('整本宽度：double 是两页', () => {
  assert.deepEqual(bookSizeOf({ width: 400, height: 600 }, 'double'), { width: 800, height: 600 })
  assert.deepEqual(bookSizeOf({ width: 400, height: 600 }, 'single'), { width: 400, height: 600 })
})

test('补白页：偶数页才需要（奇数页末尾本就成对）', () => {
  assert.equal(needsBlankPage(6, 'double'), true, '6 页时最后一翻右半空着')
  assert.equal(needsBlankPage(5, 'double'), false)
  assert.equal(needsBlankPage(6, 'single'), false)
})
