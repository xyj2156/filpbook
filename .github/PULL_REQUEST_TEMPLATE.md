## 结论先行 / What & why

<!-- 一句话说明这个 PR 让什么变成什么样，以及为什么这样做而不是别的路子。 -->

关联 issue：`#`

## 生效范围 / Scope

- [ ] `@x-ac/filpbook-core`（几何 / 布局 / 交互 / 动画）
- [ ] `@x-ac/filpbook-vue`
- [ ] `@x-ac/filpbook-react`
- [ ] 文档 / 示例站 / CI

<!-- 请顺带说明「不生效于哪里」，尤其是只改一端封装时。 -->

## 门禁 / Gates

PR 上没有跑测试的 workflow（Actions 只在打 `v*` tag 发布和部署示例站时跑门禁），**请在本地跑完再提**，把结论贴在这里：

```bash
pnpm typecheck   # 根 + 三包
pnpm test        # node:test：几何 / 布局 / 交互意图不变量
pnpm build       # 三包产物（core 先行）
```

- `pnpm typecheck`：
- `pnpm test`：
- `pnpm build`：

## 视觉取证 / Visual evidence

改动碰到**折角形状、翻页动画、书脊渐变**中的任何一项，请附无头 Edge 截图或 DOM 清单（`.shots/` 不入库，直接拖进 PR）：

```bash
node tools/shoot.mjs <名字> "page=3&fold=br:0.5"          # 出图
node tools/shoot.mjs <名字> "page=3&fold=br:0.5&dump=1" --dump=1   # 出逐元素几何清单，便于数值对拍
```

改动前后各来一张/一份，说明差异是否就是你要的。

## 风险与回退 / Risk & fallback

- 破坏性变更（会改现有 API 或默认行为）：无 / 有 → 哪一项、为什么值得
- 是否需要换 `key` 重建才能生效（除 `page` 外的 props 都是挂载时快照）
- 回退方式：revert 这一个 commit 即可 / 需要额外动作（说明）

## 登记 / Records

- [ ] 触及架构决策 → 已在 `DECISIONS.md` 追加或修订一条（含**依据 / 可逆性 / 退路**）
- [ ] 改了对外选项或默认值 → 已同步 `README.md` 选项表与各包 README
- [ ] 给 core 新增了任何运行时依赖（原则上应为零，需在上方说明为什么必须）

<!-- 提交前自查：PR 越小越好；把「顺手改的」拆出去。 -->
