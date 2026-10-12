# @x-ac/filpbook-core

框架无关的翻书（page-curl）引擎。卷角数学以 turn.js 4.1 的 sheet 分支为源重写为纯函数，DOM 层只照抄几何返回值。一般不直接使用，见封装 [`@x-ac/filpbook-vue`](../vue) / [`@x-ac/filpbook-react`](../react)。

## 引擎直用

```ts
import { FlipBook } from '@x-ac/filpbook-core'

const book = new FlipBook(mountEl, {
  pageCount: 10,
  width: 400,   // 单页设计尺寸；折页数学全在设计坐标里算
  height: 600,
})

// 每页有一个宿主 div，内容自行渲染进去（只借不销毁，宿主会在布局间搬移）
for (let p = 1; p <= book.total; p++) {
  book.hostOf(p)!.textContent = `第 ${p} 页`
}

book.goTo(3)
book.on('change', (page, view) => console.log(page, view))
```

## 主要导出

| 导出 | 说明 |
| --- | --- |
| `FlipBook` | 主类：布局 / range 借还 / 折页 / 指针交互 / fit |
| `FoldOverlay` | 折页渲染层（四层合成，一般经 FlipBook 使用） |
| `PointerController` | 指针状态机：拖拽跟手、松手判定、悬停掀角、松手动画 |
| `pressIntentOf` / `foldTowardOf` | 纯函数：按压 → 翻页意图（可单测） |
| `fold` / `bezierPath` / `retractHandles` | 纯函数：折页几何与补间轨迹 |
| `FlipTween` / `easeOutCircular` | 折点补间（rAF） |

## 常用 API（FlipBook 实例）

| 成员 | 说明 |
| --- | --- |
| `hostOf(page)` | 第 page 页的宿主 div（内容渲染目标） |
| `goTo(page)` | 无动画跳页；动画翻页由交互层内部完成 |
| `on('change', fn)` | 换页落地（page, view） |
| `page` / `total` / `view()` / `range()` | 状态只读 |
| `scale` | 当前 fit 缩放系数 |
| `foldPage(page, corner, at, toward?)` | 静态折一帧（取证/自定义动画用） |
| `destroy()` | 先撤框架内容，再调这个 |

## 选项与书脊类名

选项表、书脊类名（`filpbook-spine-left/right/hinge`）的定制方式见[根 README](../../README.md)。

## License

[MIT](../../LICENSE)
