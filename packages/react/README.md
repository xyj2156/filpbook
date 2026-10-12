# @x-ac/filpbook-react

翻书（page-curl）组件的 React 封装：children 的每个子节点 = 一个页码面，经 `createPortal` 渲染进引擎宿主。引擎见 [`@x-ac/filpbook-core`](../core)。

## 安装

```bash
pnpm add @x-ac/filpbook-react
# peer: react / react-dom >=18
```

## 用法

```tsx
import { useRef, useState } from 'react'
import { FlipBook, type FlipBookApi } from '@x-ac/filpbook-react'

function Demo() {
  const [page, setPage] = useState(1)
  const api = useRef<FlipBookApi | null>(null)

  return (
    <FlipBook
      apiRef={api}
      page={page}
      onPageChange={setPage}
      pageCount={10}
      width={400}
      height={600}
      style={{ width: 800, height: 600 }}
    >
      {Array.from({ length: 10 }, (_, i) => (
        <div key={i}>第 {i + 1} 页</div>
      ))}
    </FlipBook>
  )
}
```

## 契约

- children 按序对号页码面（`Children.toArray` 语义：`null` / 布尔值自动跳过）
- 除 `page` 外的 props 为**挂载时快照**（修改请换 `key` 重建）；`page` 唯一响应式，配 `onPageChange` 受控
- `apiRef` 拿到 `{ goTo(page), book }`，`book` 是引擎实例（不用 ref-as-prop，兼容 React 18）
- 组件根即引擎挂载容器：`className` / `style` / `data-*` 照常透传，容器需要宽高（`fit` 默认 contain 等比居中）

完整选项表与书脊外观定制见[根 README](../../README.md)。

## License

[MIT](../../LICENSE)
