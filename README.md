# filp-book

框架无关的翻书（page-curl）引擎，附 Vue 3 与 React 封装。卷角数学以 turn.js 4.1 的 sheet 分支为源重写：纯函数几何 + 薄 DOM 层，静态折角与真实 turn.js 逐元素对齐。

## 包一览

| 包 | 说明 |
| --- | --- |
| [`@x-ac/filpbook-core`](packages/core) | 框架无关引擎：布局、折页几何、指针交互、松手动画；零依赖，CDN 直引（ESM / UMD / IIFE 全局） |
| [`@x-ac/filpbook-vue`](packages/vue) | Vue 3 封装，Teleport 渲染进宿主 |
| [`@x-ac/filpbook-react`](packages/react) | React 封装（≥18），createPortal 渲染进宿主 |

## 特性

- **页码面内容模型**：一个子元素 = 一页，奇偶自动配纸；封面独占半边
- **拖角跟手翻页**：Pointer Events 单代码路径；角热区命中、点按/拖出判定、松手过渡动画、悬停掀角提示
- **等比适配**：固定设计坐标 + `transform: scale`，resize 只重算一个系数，命中测试按比值反算
- **range 窗口化**：页宿主只借不销毁，框架内容始终存活
- **书脊渐变长在页面表面**：宿主类名 + CSS，翻页全程贴合

## 快速开始

### Vue 3

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { FlipBook } from '@x-ac/filpbook-vue'

const page = ref(1)
</script>

<template>
  <!-- 容器需要宽高；fit 默认 contain，书等比缩放并居中
       容器别加 overflow:hidden：翻页时纸面会像真书一样越出书矩形，四周要预留空间 -->
  <FlipBook v-model:page="page" :page-count="10" :width="400" :height="600" style="width: 800px; height: 600px">
    <div v-for="p in 10" :key="p" class="page">第 {{ p }} 页</div>
  </FlipBook>
</template>
```

### React

```tsx
import { useRef, useState } from 'react'
import { FlipBook, type FlipBookApi } from '@x-ac/filpbook-react'

function Demo() {
  const [page, setPage] = useState(1)
  const api = useRef<FlipBookApi | null>(null)
  return (
    <FlipBook
      pageCount={10}
      width={400}
      height={600}
      page={page}
      onPageChange={setPage}
      apiRef={api}
      style={{ width: 800, height: 600 }}
    >
      {Array.from({ length: 10 }, (_, i) => (
        <div key={i}>第 {i + 1} 页</div>
      ))}
    </FlipBook>
  )
}
```

## 选项

除 `page` 外的 props 均为**挂载时快照**（修改请换 `key` 重建）；`page` 是唯一响应式 prop。

| prop | 默认 | 说明 |
| --- | --- | --- |
| `pageCount` | 必填 | 页码面数量 |
| `width` / `height` | 必填 | 单页设计尺寸（px） |
| `display` | `'double'` | `'single'` 单页模式 |
| `direction` | `'ltr'` | `'rtl'` 从右往左 |
| `page` | — | 受控当前页（Vue 为 `v-model:page`） |
| `startPage` | `1` | 非受控时的起始页 |
| `fit` | `'contain'` | 等比缩放并居中；`'none'` 原尺寸放左上角 |
| `blankPage` | `false` | 偶数页数时补白页凑成完整一翻 |
| `interactive` | `true` | 指针翻页开关 |
| `cornerSize` | `100` | 角热区边长（设计 px） |
| `hover` | `true` | 悬停掀角提示 |
| `duration` | `600` | 翻完动画时长（ms） |
| `gradients` | `true` | 卷曲渐变与书脊渐变 |
| `domWindow` | `6` | 同时常驻 DOM 的页数 |

**事件与命令式入口**：换页落地后 Vue 触发 `update:page` / `change`，React 调 `onPageChange`；模板 ref（Vue）或 `apiRef`（React）拿到 `{ goTo(page), book }`，`book` 即 core 实例，高级控制直通。

## 书脊外观定制

core 会给每个页宿主按书脊侧加类：`filpbook-spine-left` / `filpbook-spine-right`（书脊在哪一侧），封面与封底另加 `filpbook-spine-hinge`。渐变绘制在这些类的 `::after` 上——想改观感直接覆盖：

```css
.filpbook-spine-hinge.filpbook-spine-left::after {
  width: 6%;
  background: linear-gradient(to right, rgba(0, 0, 0, 0.7) 0%, transparent 30%);
}
```

## 开发

```bash
pnpm install
pnpm test        # node:test（几何/布局/交互意图不变量）
pnpm typecheck   # 根 + 三包
pnpm build       # 三包产物（core 先行，封装依赖其声明）
pnpm dev         # http://localhost:5199
```

- 引擎取证页：`/tools/smoke.html`，支持 `?page=3&fold=br:0.5&drag=hold:br:200,500` 等确定性 query
- 双框架演示：`/playground/index.html`（Vue）与 `/playground/react.html`
- 视觉取证链路：`node tools/shoot.mjs <name> "<query>" [--dump=1]`，无头 Edge 截图 / DOM 序列化落 `.shots/`；`/tools/umd.html`、`/tools/iife.html` 分别是 UMD 与 IIFE 产物的加载实测页
- 发布：`pnpm -r publish`（内部依赖用 `workspace:*`，必须走 pnpm 做版本替换；prepublishOnly 会先跑测试/构建）

架构决策（每条含依据 / 可逆性 / 退路）见 [DECISIONS.md](DECISIONS.md)。

## 致谢

本引擎的卷角（page-curl）几何与翻页交互手感，参考并重写自 [turn.js](https://github.com/blasten/turn.js) 4.1 的 `sheet`（卷角）分支，作者 [Emmanuel García](https://github.com/blasten)（@blasten）。turn.js 以 jQuery 插件形态树立了 HTML5 仿真翻书的标杆，其折页数学与分段时间动画的处理思路是本项目最直接的灵感来源。本仓库将其核心几何抽象为零依赖的纯函数重写，未复制 turn.js 代码；turn.js 本体遵循其非商业 BSD 许可。谨此致谢。

## License

[MIT](LICENSE)
