/**
 * dump 取证助手：把 root 子树的矩形与 inline style 打进隐藏 <pre id=dump>，
 * 配合 msedge --dump-dom 与 tools/shoot.mjs --dump=1 做逐元素对拍（D-08）。
 * smoke 与 playground 共用。
 */

/** 遍历元素子树，产出「标签+类+data + 矩形 + style」一行 */
export function dumpdom(root: Element): void {
  const pre = document.createElement('pre')
  pre.id = 'dump'
  pre.style.cssText = 'position:fixed;left:-9999px;top:0;font:11px monospace;white-space:pre'
  document.body.appendChild(pre)
  const lines: string[] = []
  const walk = (node: Element, depth: number): void => {
    const r = node.getBoundingClientRect()
    const cls = node.className && typeof node.className === 'string' && node.className.trim()
      ? `.${node.className.trim().split(/\s+/).join('.')}` : ''
    const ds = Object.entries((node as HTMLElement).dataset).map(([k, v]) => `[${k}=${v}]`).join('')
    lines.push(
      `${'  '.repeat(depth)}<${node.tagName.toLowerCase()}${cls}${ds}> ` +
      `${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}x${Math.round(r.height)} || ` +
      `${node.getAttribute('style') || ''}`,
    )
    for (const child of Array.from(node.children)) walk(child, depth + 1)
  }
  walk(root, 0)
  pre.textContent = lines.join('\n')
}
