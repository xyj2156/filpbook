# @x-ac/filpbook-vue

翻书（page-curl）组件的 Vue 3 封装：默认插槽的每个根节点 = 一个页码面，经 `<Teleport>` 渲染进引擎宿主。引擎见 [`@x-ac/filpbook-core`](../core)。

## 安装

```bash
pnpm add @x-ac/filpbook-vue
# peer: vue ^3.4
```

## 用法

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { FlipBook } from '@x-ac/filpbook-vue'

const page = ref(1)
const bookRef = ref<{ goTo(p: number): boolean; book: unknown } | null>(null)
</script>

<template>
  <FlipBook
    ref="bookRef"
    v-model:page="page"
    :page-count="10"
    :width="400"
    :height="600"
    style="width: 800px; height: 600px"
  >
    <div v-for="p in 10" :key="p" class="page">第 {{ p }} 页</div>
  </FlipBook>
</template>
```

## 契约

- 默认插槽按序对号页码面；`v-if` 的注释占位与空白文本自动跳过，`v-for` 直接可用
- 除 `page` 外的 props 为**挂载时快照**（修改请换 `key` 重建）；`page` 唯一响应式（`v-model:page`）
- 模板 ref 拿到 `{ goTo(page), book }`，`book` 是引擎实例
- 组件根即引擎挂载容器：`class` / `style` / `data-*` 照常透传，容器需要宽高（`fit` 默认 contain 等比居中）

完整选项表与书脊外观定制见[根 README](../../README.md)。

## License

[MIT](../../LICENSE)
