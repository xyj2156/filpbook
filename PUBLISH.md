# 发布流程（npm）

三个包：`@x-ac/filpbook-core`、`@x-ac/filpbook-vue`、`@x-ac/filpbook-react`（pnpm workspace，内部依赖 `workspace:*` 由 pnpm 在发布时替换为真实版本）。自动发布走 **npm Trusted Publishing（GitHub Actions + OIDC）**，不存任何长期 token。

## 关键前提

- **OIDC 不能发第一个版本。** 可信发布者只能绑定到「已存在的包」，所以 `v0.1.0` 必须先手动种子发布一次；之后由 `.github/workflows/publish.yml` 全自动接管。这是 npm 的既有限制（npm/cli#8544 未解），不是配置问题。
- **作用域 `@x-ac` 必须是你名下的**（你的 npm 用户名，或你已创建且为 owner 的组织）。否则首发直接 403，与发布方式无关。
- **仓库需为 public 才会生成 Provenance 绿标**；private 仓库 OIDC 仍可发，但无 provenance。
- 本机 `npm login` 已完成、能过 2FA。CI 侧要求 Node ≥ 22.14、npm ≥ 11.5.1（仓库用 Node 24 / npm 12，满足）。

## 第一步 · 一次性手动种子（发 0.1.0）

在本地、有人值守（要过一次 2FA）时执行：

```bash
npm login                 # 浏览器完成 2FA；随后 npm whoami 确认身份
pnpm install --frozen-lockfile

# 先看打包内容对不对（应只有 dist/ 与 README.md，不含 src/测试/lockfile）
pnpm -r exec pnpm pack --dry-run

# 全量门禁后发布三个包（按依赖序 core → vue → react）
pnpm typecheck && pnpm test && pnpm build
pnpm -r publish --access public --no-git-checks
```

> 各包的 `publishConfig.access` 已是 `public`，`--access public` 只是双保险。首发若拿不准是否设 `latest`，可加 `--tag next` 先挂预览标签，确认无误再 `npm dist-tag add`。
>
> **本地手动发布不要加 `--provenance`**——它只在 GitHub Actions 的 OIDC 环境里能生成，本地会报 `ERR_PNPM_PROVENANCE_UNSUPPORTED_PROVIDER`。Provenance 由 `publish.yml` 从 v0.1.1 起自动附带（且需仓库为 public）。

## 第二步 · 绑定可信发布者（每个包各一次）

推荐用 CLI（需 npm ≥ 11.15；本仓库用 npm 12）。对**每个**包执行：

```bash
npm trust github @x-ac/filpbook-core  --repo xyj2156/filpbook --file publish.yml --env npm --allow-publish
npm trust github @x-ac/filpbook-vue   --repo xyj2156/filpbook --file publish.yml --env npm --allow-publish
npm trust github @x-ac/filpbook-react --repo xyj2156/filpbook --file publish.yml --env npm --allow-publish

npm trust list @x-ac/filpbook-core    # 核对：仓库/工作流文件/环境/权限
```

字段务必与 workflow 完全一致：仓库 `xyj2156/filpbook`、**工作流只写文件名 `publish.yml`**（不含路径）、环境名 `npm`、允许 `npm publish`。网页路径为 `Packages → 选包 → Settings → Trusted publishing → GitHub Actions`。

## 第三步 · 建 GitHub Environment

仓库 `Settings → Environments → New environment`，名称填 `npm`（可与 npm 侧一致；可先不设保护规则）。若日后要「发布前人工审批」，在该环境加 Required reviewers，并把可信发布者权限改为只允许 `npm stage publish`。

## 后续发布（全自动）

1. 递增版本号——三包同发布可：`pnpm -r exec npm version <patch|minor|major> --no-git-tag-version`（或手工改三个 `package.json` 的 `version`）。
2. 提交并打 tag（tag 与包版本对应，如 `v0.1.1`）：

```bash
git commit -am "chore(release): v0.1.1"
git tag v0.1.1
git push && git push origin v0.1.1
```

3. tag 推送触发 `publish.yml`：typecheck+test+build 门禁 → 三门 → `pnpm -r publish --provenance`。无需任何 token。

> **monorepo 版本策略提示**：本流程是「一个 tag 发全部三包」，要求每次把待发版本都 bump 到未发布值（pnpm 对已存在的版本会报错，起到误重发保护）。若将来出现「只发其中一两个包」的需求，改用 [changesets](https://github.com/changesets/changesets)（`pnpm changeset version` + `publish`）做独立版本管理，workflow 结构不变。

## 验证

```bash
npm view @x-ac/filpbook-core version dist-tags
npm view @x-ac/filpbook-core versions --json
```

Actions 页看该 run 绿；npm 包页应出现新版本与 Provenance（public 仓库时）。

## 收尾加固（首次 OIDC 发布成功后）

到 `Packages → 选包 → Settings → Publishing access`，改为 **Require two-factor authentication and disallow tokens**——禁止传统 token 发布，但**不影响** OIDC 可信发布者。这样即便从未存过 token，也彻底关死旁路。

## 常见故障

- **`ENEEDAUTH`**：`id-token: write` 缺失；仓库非 GitHub-hosted runner；用了 self-hosted；`package.json` 的 `repository.url` 与实际仓库不符（本项目应为 `git+https://github.com/xyj2156/filpbook.git`）；或环境名 `npm` 两侧不一致；工作流文件名写成了带路径。
- **`403` 首发**：`@x-ac` 作用域不存在或非你所有。
- **`You cannot publish over ... previously published versions`**：版本号没递增。
