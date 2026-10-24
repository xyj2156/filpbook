# 安全策略 / Security Policy

## 支持的版本 / Supported versions

| 版本 | 是否支持安全修复 |
| --- | --- |
| 0.1.x | ✅ |
| < 0.1 | ❌（0.x 阶段不并行维护多条线，请升到最新） |

本项目是纯前端渲染引擎，没有服务端、不联网、不读写任何浏览器持久化存储（`localStorage` / `sessionStorage` / Cookie 都不用）。

## 报告一个漏洞 / Reporting a vulnerability

**请勿开公开 issue 直接描述漏洞细节。**

- 首选：仓库首页 Security 区的 **Report a vulnerability**（GitHub 私有漏洞报告），只在维护者与报告者之间可见。若该入口尚未开启，请先在 [Issues](https://github.com/xyj2156/filpbook/issues/new?labels=bug) 开一个只写「疑似安全问题，需私下沟通」的标题，我们再用私有渠道跟进。
- 请附上：受影响版本、触发它需要的**页面内容**（哪一页、什么 DOM 结构）、以及最小复现。引擎的折页几何是纯函数，多数问题可以用 `tools/smoke.html` 的一串 query 参数还原，把这串参数贴过来即可。

我们承诺收到后尽快回复，但这是个人维护的开源项目，**没有固定的响应时限（无 SLA）**。请在披露窗口上与我们协商，别默认按 90 天公开。

## 攻击面在哪里 / What to look at

这个引擎会把**你传入的页码面 DOM** 搬进自己的层叠上下文（Vue 用 Teleport、React 用 createPortal，core 只做「借」不销毁）。因此真正需要注意的是：

1. **页内容是第三方提供的**（用户投稿、CMS 富文本、抓来的 HTML）。引擎不会对它做任何转义或净化 —— XSS 责任在内容侧，请用可信来源或先过一遍净化器（DOMPurify 之类）。
2. **`rtl` / 双面模式下的可视区域**：引擎刻意不裁剪书容器，纸面会越出书矩形（这是设计决策，见 `DECISIONS.md`）。如果你的容器上有 `position: fixed` 的敏感浮层，翻页动画期间可能被覆盖。
3. **依赖面**：`@x-ac/filpbook-core` 零运行时依赖；两个封装包只把框架列为 peer。`npm audit` 对本仓库产物基本无输出属正常。

## 不在范围内 / Out of scope

- [turn.js](https://github.com/blasten/turn.js) 自身的漏洞。本引擎只参考其折页数学并重写，未复制其代码，也不依赖它。
- 你所用框架（Vue / React）版本本身的问题，请向对应上游报告。
- DoS / 刷量、依赖扫描器给出的「低危」提示、无实际影响的理论攻击。

## 发布链完整性 / Supply chain

npm 包由 GitHub Actions 通过 **Trusted Publishing（OIDC）** 发布，仓库里没有长期 npm token；每次发布前跑 `typecheck` + `test` + `build` 全量门禁，并上传前预览 tarball 清单（只含 `dist/` 与 `README.md`）。安装后可以用下面命令校验来源证明：

```bash
npm audit signatures
```
