// 引擎取证页：不带任何框架，直接驱动 core。
// 每个开发单元的视觉验证都在这里跑（见 tools/shoot.mjs）。
import { fold, diagOf } from '@x-ac/filpbook-core'

const size = { width: 400, height: 600 }
const stage = document.getElementById('stage')!
stage.style.cssText =
  `width:${size.width * 2}px;height:${size.height}px;background:#3f3f46;border-radius:8px;`

const f = fold({ size, corner: 'br', point: { x: 200, y: 500 } })
stage.innerHTML =
  `<div class="probe">diag ${diagOf(size)} · angle ${f.angle.toFixed(2)}° · ` +
  `tr (${f.translate.x},${f.translate.y}) · seam (${f.seam.x},${f.seam.y}) · ` +
  `band ${f.shading.width.toFixed(0)}px</div>`
;(window as unknown as { __ready: boolean }).__ready = true
