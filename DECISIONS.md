# 决策台

本文件记录重写过程中的架构决策：依据 / 可逆性 / 退路。
标注 `[代拍]` 的是助手在用户外出或明确授权下自行裁决的，供事后撤回审阅。

## D-01 内容模型：页码面（page face）

`<FlipPage>` 的一个子元素 = 一个页码面（第 1 页、第 2 页…），奇偶配对成物理纸由 core 负责，封面（第 1 页）在 double 模式下独占右半。

- 依据：作者排内容时的心智模型是页码；sheet（一张纸两面）模型会把几何细节泄漏进用户内容，且 single 模式下还要拆。turn.js 亦此模型。
- 可逆性：低——这是对外契约，改的话用户侧 slot 写法整体重排。
- 退路：需要 sheet 语义时在封装层加 `<FlipSheet>` 适配器，core 不动。

## D-02 `[代拍]` 包名 `@flipbook/core|vue|react`

目录名 `filp-book` 是 `flip-book` 的笔误，保留目录不动，包名用正确拼写。

- 依据：未发布，现在改零成本，发布后改要走 deprecate。
- 可逆性：高（尚未发布）。
- 退路：发布前一次性改名。

## D-03 `[代拍]` 奇数页自动补白页

double 模式下末页为奇数时补一张空白页，可用 `blankPage: false` 关闭。

- 依据：不补则末页左侧空着，视觉上像渲染坏了。
- 可逆性：高（一个选项）。

## D-04 `[代拍]` core 只「借」页元素，不创建也不销毁

core 为每页维护一个宿主 div；框架封装用 Teleport / createPortal 把内容渲染进宿主。超出可见区间（range）的页，宿主被移入文档内的 staging 容器（隐藏但仍在文档树里），而不是 `remove()`。

- 依据：内容归框架所有，core 无权卸载它；同时保留节点在文档内，内容自身的高度测量与事件不被打断。这是"框架无关"能成立的前提。
- 可逆性：中——改成 core 自绘内容会直接废掉 slot 能力。
- 退路：range 虚拟化可关（`preload: Infinity` 让全部页常驻可见区外）。

## D-05 `[代拍]` v0.1 只做 sheet（卷角）效果

turn.js 的 `hard`（硬壳 rotateY）与 `zoom.js`（放大）进 roadmap，不进第一版。

- 依据：用户目标是"主要实现翻书效果"，卷曲是效果本体；hard 是另一套 transform 分支，可后补且互不干扰。
- 可逆性：高——`_fold` 按 effect 分支留了扩展位。

## D-06 `[代拍]` 尺寸模型：固定设计尺寸 + core 等比 fit

页尺寸是设计坐标系（如 800×1200），core 负责把整本书等比缩放适配容器（`fit: 'contain' | 'none'`），不做 CSS 流式重排。

- 依据：折页数学全部在设计坐标里算，流式尺寸会让每次 resize 都重算布局并抖动；拖拽命中也要按 scale 反算，集中在 core 里才不会两处不一致。
- 可逆性：中——改成流式需重做 fit 与命中测试。
- 退路：`fit: 'none'` 时行为等价于"你自己管尺寸"。

## D-07 `[代拍]` 交互统一用 Pointer Events

不分 touch/mouse 两套事件名（旧实现是 `'ontouchstart' in window` 二选一，触屏设备拿不到鼠标、混合设备只有一套）。书容器设 `touch-action: none`。

- 依据：单一代码路径；旧实现这里还有触屏下 preventDefault 缺失导致页面跟着滚的问题。
- 可逆性：高。

## D-08 `[代拍]` 视觉验证 = 无头 Edge 截图

`node tools/shoot.mjs <name> [query]` 驱动本机 msedge `--headless=new --screenshot`，产物落 `.shots/`，用视觉核对每一单元。中间态用确定性 query（如 `?fold=br:0.5`）渲染静态折角，不靠时序碰运气。

- 依据：本机无浏览器自动化依赖；折页是纯视觉正确性问题，typecheck 与断言都测不出"看起来对不对"。
- 可逆性：高。

## 从旧半成品里继承的结论（已核对，非重写风险）

旧 `packages/core/src/PageFlip.ts` 的 `_fold` 数学与 turn.js 4.1 `sheet` 分支逐式一致（`_c`/`_c2`/`compute`/`transform`/`mv`/`px`/`df`/gradient 参数全对得上），所以本仓库直接以 turn.js 为源重写这几式，不引入回归风险。旧实质的问题在外层：无 range 管理导致漏画、single 模式语义自创、封装无 slot、`utils.ts` 顶层访问 `window` 破坏 SSR。

## 助手撤回的错误结论（供审阅）

- 上一轮我提"封底漏画"时同时归因于 z-index 策略与缺 range 管理——z-index 那条是多余的，根因只是所有页 DOM 常驻且未被移出可见区。
- 上一轮我提"fitScale 未生效"暗示是 Vue 封装 holder 缺宽高所致（React 版有 `style={{width,height}}`）——未实测，不下结论，留到 D-06 落地时用截图验证。
