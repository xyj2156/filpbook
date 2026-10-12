import test from 'node:test'
import assert from 'node:assert/strict'
import { easeOutCircular } from './anim.js'

test('easeOutCircular：0→0、1→1、单调不减、前快后缓（ease-out 特征）', () => {
  assert.equal(easeOutCircular(0), 0)
  assert.equal(easeOutCircular(1), 1)
  assert.ok(Math.abs(easeOutCircular(0.5) - Math.sqrt(3) / 2) < 1e-12)

  let prev = 0
  for (let i = 1; i <= 20; i++) {
    const v = easeOutCircular(i / 20)
    assert.ok(v >= prev, `t=${i / 20} 应单调不减`)
    prev = v
  }
  assert.ok(easeOutCircular(0.5) > 0.5, '前半程应走过半程以上')
})
