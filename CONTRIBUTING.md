# 参与贡献 / Contributing

先说三件最重要的事：

1. **core 零依赖**是它的主要卖点。任何新增运行时依赖都要在 PR 里单独论证（见 PR 模板最后一项）。
2. **折页几何是纯函数**。`geometry.ts` / `corners.ts` / `fold.ts` 里不允许碰 DOM、不允许读全局；有状态的东西都属于 `FlipBook.ts` 这层薄 DOM 宿主。
3. **改架构要登记**。`DECISIONS.md` 里每条决策都写清了「依据 / 可逆性 / 退路」，你的改动如果推翻或新增了一条，请补一条，别把理由丢在 commit message 里。

## 跑起来

Node 22 或更高（CI 用 24），pnpm 版本由根 `package.json` 的 `packageManager` 字段锁定，开了 corepack 就会自动对上。

```bash
corepack enable
pnpm install
pnpm dev          # http://localhost:5199 → 导航页
```

| 命令 | 作用 |
| --- | --- |
| `pnpm typecheck` | 根 tsconfig + 三包 |
| `pnpm test` | 各包 `node:test`（几何 / 布局 / 交互意图不变量） |
| `pnpm build` | 三包产物，core 先行（封装层依赖它的声明） |
| `pnpm dev` | 起本地导航：框架 demo、引擎取证页、UMD / IIFE 加载实测 |
| `node tools/pages.mjs` | 构建公开示例站产物（带零断链自检），CI 部署用的就是它 |

提 PR 前三项必须全绿。

## 目录地图

```
packages/core/src/
  geometry.ts  corners.ts  fold.ts   折角数学：纯函数，NaN 有夹持
  layout.ts                      页码面 → 纸张 / 书脊 布局与配页
  interact.ts                  Pointer Events 命中与翻页意图判定
  anim.ts                      分段时间与缓动（参数照抄 turn.js）
  FlipBook.ts                  薄 DOM 层：借页、窗口化、类名下发
  index.ts                     对外出口
packages/{vue,react}/src/      封装：只管挂载（Teleport / createPortal）与 props 透传
playground/                    Vue 与 React 双框架示例
tools/smoke.html               引擎直挂取证页，query 可还原任意确定帧
tools/shoot.mjs                无头 Edge 截图 / DOM 序列化，产物落 .shots/
```

## 代码约定

- **相对导入一律写 `.js` 说明符**（`import { fold } from './geometry.js'`），测试跑编译产物，别混用扩展名。
- 测试用 `node:test` + `node:assert/strict`，与被测文件同名并置（`geometry.ts` ↔ `geometry.test.ts`）。写**不变量**而不是快照：折点不越界、NaN 不出现、拖拽意图落到背面页这类。
- 注释与文档面向中文读者时写中文，代码标识符写英文；不要为了风格统一去改写别人的注释。
- 新增对外选项必须同时更新 `README.md` 的选项表和各包 README，否则视为未完成。

## 视觉改动怎么自证

形状类问题不要靠眼睛描述。用 `tools/shoot.mjs` 把同一组参数在改动前后各跑一遍：

```bash
node tools/shoot.mjs before "page=3&fold=br:0.5"
node tools/shoot.mjs after  "page=3&fold=br:0.5"
node tools/shoot.mjs after_geo "page=3&fold=br:0.5&dump=1" --dump=1   # DOM 序列化，逐元素数值对拍
```

`.shots/` 不入库，把图或清单直接拖进 PR 描述。

## 提交信息

沿用仓库既有的 Conventional Commits 风格，类型用 `feat` / `fix` / `docs` / `style` / `refactor` / `build` / `chore` / `ci`，带 scope：

```
fix(core): 折点在页面贴书脊时不再退化为 NaN
build(deps): devDependencies 全量升级到最新
docs(publish): 按「直发/全自动」取向重写发布手册
```

正文写清**为什么这样做、排除了哪些替代路子**——将来考古的人是你自己。

## 发布

版本号与发布由维护者处理，贡献者不需要在 PR 里改 `version`。流程与一次性准备见 [PUBLISH.md](PUBLISH.md)（npm Trusted Publishing / OIDC，不放长期 token）。

## 许可

提交即表示你同意这些提交以 [MIT](LICENSE) 许可发布，且你有权这样授权。
