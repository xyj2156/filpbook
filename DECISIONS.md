# 决策台

本文件记录重写过程中的架构决策：依据 / 可逆性 / 退路。
标注 `[代拍]` 的是助手在用户外出或明确授权下自行裁决的，供事后撤回审阅。

## D-01 内容模型：页码面（page face）

`<FlipPage>` 的一个子元素 = 一个页码面（第 1 页、第 2 页…），奇偶配对成物理纸由 core 负责，封面（第 1 页）在 double 模式下独占右半。

- 依据：作者排内容时的心智模型是页码；sheet（一张纸两面）模型会把几何细节泄漏进用户内容，且 single 模式下还要拆。turn.js 亦此模型。
- 可逆性：低——这是对外契约，改的话用户侧 slot 写法整体重排。
- 退路：需要 sheet 语义时在封装层加 `<FlipSheet>` 适配器，core 不动。

## D-02 包名 `@x-ac/filpbook-core|vue|react`

用户拍板：作用域 `@x-ac`（已注册组织），包名保留 `filp` 拼写，与仓库目录名 `filp-book`、
既有 `vue-filpbook` 一致；根私有包同步改名 `filp-book`。

- 依据：组织作用域与既有命名归用户持有，不是助手可以"顺手改正拼写"的对象。
- 可逆性：发布前改一次即可，发布后要走 deprecate，成本陡增。
- 退路：无（已定）。

`keywords` 里仍留正确拼写 `flipbook` 供 npm 搜索命中——那是检索标签，不是标识。

## D-03 `[代拍]` 补白页选项，默认关

double 模式下 **页数为偶数** 时，最后一翻是 `[N, N+1]`、右半没有页；`blankPage: true` 才补一张
白页凑成完整一对。默认关（与 turn.js 一致：真书也常有末页单独占左半）。

- 依据：这是观感取舍不是对错，交给使用方按书的类型选。
- 可逆性：高（一个布尔选项）。
- 退路：改成默认开只动一处默认值。

## D-04 `[代拍]` core 只「借」页元素，不创建也不销毁

core 为每页维护一个宿主 div；框架封装用 Teleport / createPortal 把内容渲染进宿主。超出可见区间（range）的页，宿主被移入文档内的 staging 容器（隐藏但仍在文档树里），而不是 `remove()`。

- 依据：内容归框架所有，core 无权卸载它；同时保留节点在文档内，内容自身的高度测量与事件不被打断。这是"框架无关"能成立的前提。
- 可逆性：中——改成 core 自绘内容会直接废掉 slot 能力。
- 退路：range 虚拟化可关（`preload: Infinity` 让全部页常驻可见区外）。

## D-05 `[代拍]` v0.1 只做 sheet（卷角）效果

turn.js 的 `hard`（硬壳 rotateY）与 `zoom.js`（放大）进 roadmap，不进第一版。

- 依据：用户目标是"主要实现翻书效果"，卷曲是效果本体；hard 是另一套 transform 分支，可后补且互不干扰。
- 可逆性：高——hard 效果将来另写成并列的 `foldHard()`，不动 `fold()` 的签名。

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

## D-09 `[代拍]` 源码内相对导入一律写 `.js` 说明符，测试跑编译产物

`import { x } from './corners.js'`（指向 `corners.ts`），测试脚本先 `tsc` 到 `.tmp-test/` 再 `node --test`。

- 依据：本想用 TS 5.7 的 `rewriteRelativeImportExtensions` 让 node 直接跑 `.ts`，实测它只改写 JS 产出，
  `dist/index.d.ts` 里仍留 `'./corners.js'`→`'./corners.ts'`，发布出去消费方类型解析直接断。
  写 `.js` 说明符则 JS/d.ts 两边都正确，且测试跑的是真正要发布的产物。
- 可逆性：高（一次 sed 能改回）。
- 退路：若哪天 node 原生解析够好用，可换回 `.ts` 说明符 + 删掉构建前缀步骤。

## D-10 `[代拍]` 折点安全夹持：不继承 turn.js 的 NaN

`clampFoldPoint()` 把折点收进「锚点同侧对角线长度」的框内再算。

- 依据：turn.js 把指针坐标原样喂进数学，拖得离页足够远时 `sqrt(h²+2·mid.x·rel.x)` 判别式转负，
  返回值整体变 NaN，页面僵在最后一帧。实测 `tr @ (-5000,-5000)`、`bl @ (5000,5000)` 复现。
  展开判别式得 `diag² - p.x²`（右角）/ `diag² + w² - (p.x-w)²`（左角），故夹进 diag 即恒非负。
- 可逆性：高（纯函数前置一步）。
- 退路：夹持范围放大到 2×diag 也只是让"已经翻到底"的视觉饱和态更晚出现，不影响正常交互。

## D-11 `[代拍]` 拖拽意图：翻过去落在的页 = 纸的背面

按压命中角后解析出 `{page, toward, target}`：page = double 下指针所在那半屏的页
（用 halfOf 反查，不依赖 view 元组 [left,right] 的命名顺序，rtl 才不会错）/
single 下就是当前页；toward = double 用页的天然方向（naturalToward）、single 用
角侧 × 方向（foldTowardOf）；target = `backOf(page, toward)`。书到头时 backOf
返回页自己 → 拒绝起折。

- 依据：「翻过去落在背面」在 double/single × ltr/rtl 四种组合下统一成立，
  免去 page±1/±2 的奇偶分叉；且与 turn.js 实测同构——它的 opts.next 就是背面页
  （`next: (odd||single) ? page+1 : page-1`），_turnPage(next) 落地即此页。
  命中后必须有背面才起折，对应 turn.js `_eventStart` 要求 `_foldingPage` 存在。
- 可逆性：高（纯函数 pressIntentOf，只有 PointerController 消费）。
- 退路：要支持连折多张或中途改目标，从 pressIntentOf 扩展，FoldOverlay 不动。

## D-12 `[代拍]` 指针管线：交互默认开，松手暂为硬切

`interactive` 默认 true（false 关闭并移除监听）；`cornerSize` 默认 100（=
turn.js flipOptions）；`touch-action: none` 打在 bookEl（D-07）；pointerdown
preventDefault + setPointerCapture（拖出窗口仍跟手；取证页的合成事件无真实
指针会抛 NotFoundError，吞掉不影响起折）；pointercancel / lostpointercapture
一律当弹回。拖拽中角与坐标系锁定在按下那刻，跨书缝不重新判定（turn.js 亦然）。

- 依据：单一代码路径；硬切是 U4 的范围边界而非遗漏——松手过渡动画（回弹
  bezierPath 已备好）归 U5，届时只替换 foldEnd/goTo 的调用方式，接口不动。
- 可逆性：高。
- 退路：动画层接入后本单元的可验面（跟手、判定、对拍）不受影响。

## D-13 `[代拍]` 动画与掀角：参数照抄 turn.js，hover 默认开

三段动画的时长/缓动/轨迹与 turn.js 逐项对齐：翻完 = 直线推向 cornerTarget，
duration 选项默认 600；弹回 = retractHandles 贝塞尔，800；掀角 = 从锚点内缩 1px
的近平态起步推向 cornerSize/2 处，500。缓动统一 easeOutCircular
（`sqrt(1-(t-1)²)`，turn.js animatef 原式）。悬停起点规则照抄 `_showFoldedPage`：
同角从当前折点续动，异角/无折层从近平态起步。接管规则：弹回/掀角途中按下=
冻结当前帧重新起折；**翻完途中按下不响应**（对齐 isTurning）。补尾：turn.js
没有离书处理（掀角会留在书上），我们补 pointerleave 即收。

- 依据：三段时长是 turn.js 调过的值；easeOut 收尾缓符合"纸张落定"的手感；
  翻完途中拒收新折避免半空页面被瞬间拽平的突兀。hover 在 turn.js 默认
  **false**，这里默认 true 是应用户要求的有意偏离。
- 可逆性：高（都在 InteractEnv/选项里）。
- 退路：要改手感只动三个常量与 easeOutCircular；接管规则若嫌激进可整体换成
  isTurning 式拒绝。

取证附带发现：无头 Edge 的 `--virtual-time-budget` 只推进定时器、**不泵 rAF**，
补间走不完。取证页 smoke.ts 把 rAF 换成 16ms setTimeout 驱动——只换调度器，
补间/缓动/回调逻辑不变；真实浏览器不受影响。

D-13 补记（同日，用户实测反馈）：掀角态按下改为 150ms 短滑跟进（CATCHUP_MS）——
原先折点从掀角位瞬跳到按下点很突兀；跟进途中指针一移动即取消补间转跟手，
不牺牲拖拽响应。同时松手/失捕获补间的起点从「最后指针位置」改为「当前渲染
折点」（对齐 turn.js data.point = 最后渲染点），短滑途中松手不再跳变。

## D-14 `[代拍]` fit 落地：缩放只动一个 transform，命中按比值反算

`fit: 'contain' | 'none'`，默认 contain——等比缩到两向比值最小者并居中；
none 恒 scale 1、放左上角，尺寸与溢出归使用方。容器某向为 0 时 scale=0
（整本不可见，ResizeObserver 恢复后重算）。core 需要挂载元素做定位上下文：
其 position 为 static 时补 `relative`。bookEl 由文档流改为绝对定位 +
`transform: scale(s)`，`fitOf` 纯函数算 scale/left/top；ResizeObserver 驱动
重算（无 RO 的环境跳过，不影响 SSR）。

- 依据：D-06 已拍设计坐标模型，resize 只重算系数不触发折页重算；指针命中
  的设计坐标反算（rect/设计尺寸比值）U4 已预埋在 bookPointOf，缩放下零改动——
  `box=600x700`（scale 0.75）下合成拖拽 dump 与同折点静态折逐元素一致。
- 可逆性：中——「挂载元素是被定位上下文」成了契约的一部分；fit=none 时
  控制权完全交还使用方。
- 退路：要非居中的 contain 或独立 autoCenter 选项，只动 applyFit 一处。
- 附注：RO 回调未在无头下验证（无从触发容器 resize），但回调体与构造期
  首算同一函数，风险仅剩事件接线。旧 vue-filpbook 的 fitScale 问题不再
  追——本仓库按本契约重做，U7 封装时按此挂载。

## D-15 `[代拍]` 封装契约：插槽/children = 页码面，page 唯一受控

两个封装（`@x-ac/filpbook-vue` / `@x-ac/filpbook-react`）共用一套契约：
内容 = 默认插槽（Vue，跳过注释与空白、Fragment 展平）/ children（React，
Children.toArray）按序对号页码面；除 `page` 外的 props 是**挂载时快照**
（改尺寸/模式请换 key 重建），`page` 唯一响应式——外部变更走 goTo，
core 的 change 回来走 `update:page`（v-model:page）/ `onPageChange`。
命令式入口：Vue 模板 ref 拿 `{ goTo, book }`；React 用 `apiRef` prop
（不用 React 19 的 ref-as-prop，peer 依赖放宽到 18）。宿主在实例创建后
预建（1..total），Teleport/createPortal 渲染进去；Vue 的 destroy 挂
onUnmounted（先撤内容再拆 core，D-04 顺序），React 由卸载序自然保证。

- 依据：D-01/D-04 已定内容模型与宿主所有权，插槽序号即页码是自然映射；
  选项快照是命令式内核组件的常规取舍，page 单独响应式覆盖最常见的受控需求。
- 可逆性：低-中（公开契约，但可增量扩展：非受控模式、更多命令式方法都不破坏现状）。
- 退路：真需要选项响应式时，文档化 key 重建或做选项 diff 重建。
- 双包构建注记：typecheck 的 paths 直连 core 源码；build 的 paths 指向
  core 的 dist 声明（pnpm -r 拓扑序保证 core 先建）。`@types/react(-dom)`
  缺失与根 tsconfig paths 的扩展名错（.ts↔.tsx）都会让 tsc 直接内部崩溃
  而非报诊断；vite 配 optimizeDeps.include 防首次请求预构建撞 headless
  虚拟时间；shoot.mjs 加看门狗（--watchdog，默认 120s）防 Edge 僵死拖死取证。

## D-16 `[代拍]` 书缝阴影：超出 turn.js 基准的观感增强

double 模式在 bookEl 里加一层 `pointer-events:none` 的渐变层（z-index =
total+1，页之上、折层浮层之下），书脊中线 x=一页宽处向两侧渐暗
（spread=0.16 页宽、峰值 0.28，随 sync 重画）。封面/封底单页视图退化为
书脊侧单边渐暗——空半边必须用**同位双色标做跳变**（线性渐变的插值会把
空边整体渐染，首版截图翻车即此）。`gradients:false`（取证）与 single
（无书缝）整层透明；destroy 移除。

- 依据：用户点名要接缝阴影更像真书；turn.js 基准里 `.shadow` 的视觉全靠
  demo CSS（本仓库 ref.html 未配、无对拍对象），故参数自定、不宣称对齐。
- 可逆性：高（一层 div 的 background，参数集中在 applyShadow）。
- 退路：要真书感的更多层次（装订线高光、页缘堆叠厚度）在此层扩；要关掉
  即 gradients:false 或将来拆独立选项。

## 从旧半成品里继承的结论（已核对，非重写风险）

旧 `packages/core/src/PageFlip.ts` 的 `_fold` 数学与 turn.js 4.1 `sheet` 分支逐式一致（`_c`/`_c2`/`compute`/`transform`/`mv`/`px`/`df`/gradient 参数全对得上），所以本仓库直接以 turn.js 为源重写这几式，不引入回归风险。旧实现的问题在外层：无 range 管理导致漏画、single 模式语义自创、封装无 slot、`utils.ts` 顶层访问 `window` 破坏 SSR。

## 助手撤回的错误结论（供审阅）

- **D-03 初版把补白页的奇偶算反了**：我写的是"末页为奇数时补"。实际 double 下奇数页末尾本就是
  完整一对（`[N-1, N]`），出现半空的是**偶数**页数（`[N, N+1]`）。已在 D-03 更正，代码注释同步。
- **loc=2 的含义我一开始理解错了**：以为是"纸的背面那页"要预先存在，实测 turn.js 要的是
  "下一翻垫在下面的那页"（`view[1]+2`），背面那页届时被搬进折层、平时反而是 loc=0。
  是测试期望写错逼出来的核对，结论以 turn.js `_setPageLoc` 为准。
- **把 `filp` 当笔误，自作主张"改正"成 `flip` 还写进代拍记录**——用户两轮纠正（先给作用域 `@x-ac`，
  再明确保留 `filp` 拼写）。仓库与包的标识拼写不属于"可逆即可代拍"的范围。
- 上一轮我提"封底漏画"时同时归因于 z-index 策略与缺 range 管理——z-index 那条是多余的，根因只是所有页 DOM 常驻且未被移出可见区。
- 上一轮我提"fitScale 未生效"暗示是 Vue 封装 holder 缺宽高所致（React 版有 `style={{width,height}}`）——未实测，不下结论，留到 D-06 落地时用截图验证。
- 上一轮总结的释放判定"double 看拖出页外或点按<200ms，single 才看中线"漏了一半：
  turn.js 的 `_eventReleased` 是统一式 `time<200 || outArea`，**single 下 <200ms 点按同样翻页**。
  U4 取证截图暴露（single 点按 bl 停在原页），已修 `releaseDecision` 并补测试。
