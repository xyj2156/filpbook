// 引擎取证页：不带任何框架，直接驱动 core。
// 每个开发单元的视觉验证都在这里跑（见 tools/shoot.mjs）。
const stage = document.getElementById('stage')!
stage.style.cssText = 'width:640px;height:400px;background:#3f3f46;border-radius:8px;'
stage.innerHTML = '<div class="probe">harness ok</div>'
;(window as any).__ready = true
