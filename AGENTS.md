# Daily Signal 开发规范

本文件适用于整个仓库。修改前先阅读相关实现、测试和配置；更深目录的 `AGENTS.md` 可以补充局部规则。命令以 `package.json` 为准，CI 门禁以 `.github/workflows/check.yml` 为准；修改这些入口时同步更新本文件。

## 项目定位与目录边界

Daily Signal 是本地优先的 RSS / Atom 阅读与 AI 日报应用，包含订阅管理、原文阅读、日报生成与归档、模板编辑和模型供应商配置。界面以简体中文为主。

| 目录 / 文件                                                                                         | 职责                                                              |
| --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `apps/web/src/App.tsx`、`apps/web/src/main.tsx`                                                     | 前端启动、路由和应用级编排                                        |
| `apps/web/src/components/`、`packages/ui/src/components/`                                           | 业务视图与复用的 Radix UI 基础组件                                |
| `packages/client/src/`、`packages/ui/src/lib/`                                                      | 类型化 RPC 客户端、React Query 查询、Jotai 草稿状态及共享 UI 样式 |
| `apps/web/src/styles.css`                                                                           | Tailwind 入口、主题变量、基础样式与减少动画偏好                   |
| `packages/config/src/index.ts`、`.env.example`                                                      | 服务端运行配置、环境变量加载与校验                                |
| `apps/web/src/stories/fixtures.ts`                                                                  | 确定性的 Storybook 数据工厂                                       |
| `packages/domain/src/index.ts`、`packages/contracts/src/index.ts`、`packages/domain/src/providers/` | 前后端共享的 Zod schema、oRPC 契约和供应商定义                    |
| `packages/api/src/`、`apps/web/server/`、`packages/api/src/rpc/`                                    | HTTP 安全边界、RPC 输入输出与错误映射                             |
| `packages/` 下的领域包                                                                              | 按领域组织的业务服务与持久化操作                                  |
| `packages/database/`、`packages/network/`                                                           | SQLite / Drizzle 初始化、数据库 schema、安全网络访问              |
| `packages/database/drizzle/`                                                                        | 版本化数据库迁移及元数据                                          |
| `apps/web/.storybook/`、`apps/web/vitest.config.ts`                                                 | 组件预览与 Chromium 浏览器测试配置                                |

- 使用现有 React、React Query、Jotai、oRPC、Zod、Drizzle 体系，不为同一职责另建平行实现。
- 服务端状态沿用 React Query 查询与刷新机制；未保存的编辑草稿沿用 Jotai，不把已保存的凭据复制到全局前端状态。
- 前端不能导入 `packages/api`、`packages/ai`、`packages/database`、`packages/feeds`、`packages/providers`、`packages/settings` 或 `packages/config` 的服务端实现；共享契约不能依赖数据库、服务端启动副作用或浏览器全局对象。
- API 变更从共享 schema / contract 开始，同步修改服务端实现、类型化客户端调用、fixtures 和相关测试，不留下旧调用路径。

## 环境与常用命令

- Node.js 最低 24；本地建议使用与 CI 相同的 Node.js 24。使用 `packageManager` 指定的 pnpm，不混用 npm / yarn，不新增其他锁文件。
- 复制 `.env.example` 为 `.env` 配置运行模式、回环监听地址、端口、数据库路径和退出超时。系统环境变量优先于 `.env`；服务端与构建配置统一从 `@daily-signal/config` 读取，不在业务模块直接读取 `process.env`。
- 首次安装使用下面的顺序：先链接依赖中的 `node-gyp`，再执行原生模块构建并安装 Git hooks。`--ignore-scripts` 不是最终安装状态，不能省略 `pnpm rebuild`。

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm rebuild
pnpm exec playwright install chromium
```

Linux / CI 安装浏览器及系统依赖时使用 `pnpm exec playwright install --with-deps chromium`。新增或升级依赖时使用 pnpm，并提交对应的 `pnpm-lock.yaml` 变更。

| 命令                        | 用途                                                                       |
| --------------------------- | -------------------------------------------------------------------------- |
| `pnpm dev`                  | 启动本地应用，默认 `http://127.0.0.1:3000`；可通过 `PORT` 指定端口         |
| `pnpm start`                | 运行生产模式服务，先执行 `pnpm build`                                      |
| `pnpm storybook`            | 启动组件工作台，`http://127.0.0.1:6006`                                    |
| `pnpm test:storybook:watch` | 浏览器测试监听模式；不替代一次性检查                                       |
| `pnpm lint:fix`             | 应用 lint 自动修复，完成后检查改动范围                                     |
| `pnpm format`               | 使用 Oxfmt 格式化全仓支持的文件                                            |
| `pnpm format:server`        | 使用 Oxfmt 格式化后端包和应用服务入口，不要顺带重排无关文件                |
| `pnpm db:generate`          | 根据数据库 schema 生成迁移，必须人工检查生成的 SQL                         |
| `pnpm db:migrate`           | 对指定数据库执行迁移；先确认 `DATABASE_PATH`，不得把日常开发数据当测试数据 |

## 必须通过的检查与构建

涉及代码、依赖、配置、样式或测试的交付，完成修改后必须运行与 CI 一致的完整门禁：

```sh
pnpm check && pnpm build && pnpm build-storybook
```

`pnpm check` 不包含两个构建命令，不能只跑 `check` 就声称全部验证完成。

| 检查                       | 实际覆盖                                                                      |
| -------------------------- | ----------------------------------------------------------------------------- |
| `pnpm format:check`        | Oxfmt 全仓格式检查                                                            |
| `pnpm format:server:check` | 仅检查服务端 TypeScript 格式                                                  |
| `pnpm lint`                | oxlint 静态检查，警告也视为失败                                               |
| `pnpm typecheck`           | Turbo 调度各代码包的 `tsc --noEmit`；包含前后端、共享契约、stories 和测试配置 |
| `pnpm test:server`         | `tsx --test` 执行各包中的 `src/**/*.test.ts`，使用 Node.js 原生测试框架       |
| `pnpm test:storybook`      | Vitest `storybook` project，在真实 Chromium 中执行 stories 的交互与无障碍检查 |
| `pnpm ui:audit`            | Chromium 审查整页 stories 的 8 种视口；检查几何间距、溢出、对齐，输出报告     |
| `pnpm test`                | 依次执行服务端测试和 Storybook 测试                                           |
| `pnpm check`               | 依次执行全仓格式检查、lint、类型检查、`pnpm test` 和 `pnpm ui:audit`          |
| `pnpm build`               | 类型检查与 Vite 生产构建，输出 `apps/web/dist/`                               |
| `pnpm build-storybook`     | Storybook 静态构建，输出 `apps/web/storybook-static/`                         |

- 开发中可以只跑受影响的测试以缩短反馈；最终不能以局部通过替代完整门禁。并行修改先汇合，再运行最终检查，避免检查半成品。
- pre-commit hook 使用 `lint-staged --hide-all --diff-filter=ACMRD` 隐藏未暂存修改与未跟踪文件，执行 Oxfmt，并在 UI 输入变更（含删除）时运行 `pnpm ui:audit`；恢复工作区并将格式化结果加入暂存区。不要使用 `--no-verify` 绕过。匹配规则见 `scripts/check-staged.mjs`，审查约束与报告见 `docs/ui-audit.md`。
- 纯文档改动且不影响代码、配置或命令实现时，可以只验证命令、路径、链接与事实；交付时明确说明没有重跑运行时测试。CI 仍按工作流执行完整检查。
- 任何检查失败都要排查原因；不得通过 `.skip`、删除有效断言、降低检查级别、添加宽泛忽略或修改无关行为来“变绿”。修复后重跑失败项及受影响的检查。
- 环境阻塞必须说明具体命令、错误和未验证范围，不能把未运行的检查描述为通过。
- CI 在 push / PR 时执行完整门禁，并上传 Storybook 静态产物与失败时可用的浏览器测试截图。
- CI 另上传 `apps/web/test-results/ui-audit` 的 HTML、JSON 与间距失败截图。UI 审查直接运行，不复用 Turbo 测试缓存，避免遗漏当前报告。

## 测试编写规范

### 通用要求

- 测试用户可观察的行为、业务边界和错误路径，不只验证内部函数被调用、字段转发、源码文字或快照没有变化。
- 修复缺陷时优先保留能重现原缺陷的回归测试；不为凑数量重复覆盖同一路径。
- 测试必须可重复、相互隔离且能全量执行。固定 fixtures 的日期和数据；不要依赖运行顺序、真实 API Key、外部 RSS、付费模型或公网可用性。
- 网络响应在服务边界使用确定性替身，模拟真实成功与失败；不要用空实现把待测逻辑一起替换掉。
- 不使用固定 sleep 等待异步状态。等待可观察结果，并在结束时关闭服务器、数据库、定时器和其他测试资源。
- Git 钩子测试的临时仓库须隔离调用方的 Git 环境，并在临时仓库内关闭提交签名，避免依赖用户的签名代理；正式仓库的签名设置保持不变。

### 服务端测试

- 沿用 `node:test`、`node:assert/strict` 和相邻的 `*.test.ts` 文件，不把服务端测试迁到另一个框架。
- 导入会初始化数据库的模块前，先设置 `DATABASE_PATH=':memory:'` 或独立临时文件，再按现有模式动态导入。迁移和重启场景使用临时数据库，不读写 `data/daily-signal.sqlite`。
- HTTP 测试监听 `127.0.0.1` 和随机端口，避免固定端口冲突。
- API、凭据、供应商协议、安全网络访问或迁移变更，要覆盖相关真实拒绝路径、持久化结果与状态转换，而不仅是成功返回。

### 前端与 Storybook

- 在组件旁维护 `*.stories.tsx`，使用 `@storybook/react-vite` 的 `Meta` / `StoryObj`；断言与 spy 使用 `storybook/test` 的 `expect` / `fn`。
- `play` 从上下文取得 `userEvent`；查询优先使用 role 和可访问名称，交互及异步断言必须等待。使用 `findBy*` / `waitFor` 等待渲染或弹窗动画完成。
- 新增或修改交互组件时，维护相应 story 和行为测试。根据实际行为选择默认、空、忙碌、错误、禁用等状态，不机械生成无意义的状态矩阵。
- 渲染真实业务组件，复用 `createAppState` 等 fixtures；stories 不得访问真实后端或第三方服务。
- `apps/web/vitest.config.ts` 显式预构建 `@tanstack/react-query`，避免首次运行组件测试时依赖优化触发页面重载。
- `apps/web/.storybook/preview.tsx` 已加载应用样式并提供隔离的 Jotai Provider。沿用它，不使用跨 story 的共享可变 store，不用 story 专属 CSS 掩盖组件问题。
- 整页间距场景使用 `ui-audit` 标签与 `parameters.appShell: true` 渲染真实 App，避免组件预览容器的 padding 改变结果。新增间距规则须验证损坏布局可失败、正常布局可通过；不将几何审查称为审美判断或像素级视觉回归。
- 涉及保存的 story 可以在父组件边界模拟内存持久化，但必须执行 action、更新保存状态并正确处理失败；不能简单返回成功而跳过动作。
- 保持全局 `a11y.test: 'error'`。修复组件的语义、标签、焦点、键盘操作或对比度问题，不关闭规则来绕过失败。无障碍自动化通过不代表完整人工审计。
- UI 改动除自动化测试外，还必须在应用或 Storybook 中检查实际渲染和受影响的交互；响应式改动检查桌面与窄屏，关注横向溢出、焦点恢复和弹窗可操作性。
- 有 `play` 的 stories 要验证 Storybook Interactions 面板中的回放。命令行浏览器测试不能替代静态构建，截图也不能替代行为断言。

## UI 与代码风格

- 优先复用 `packages/ui/src/components/`、`packages/ui/src/lib/ui-styles.ts` 和现有主题变量；保持浅色中性背景、少量暖色强调和中文文案。应用界面采用紧凑工具栏、列表与分栏阅读布局；正文保留舒适的阅读字号，不添加宣传语或重复解释。
- 使用语义化 HTML，保持标题层级连续，表单控件有可访问标签，纯图标按钮有名称；保留键盘导航与减少动画偏好。
- 保持 TypeScript 严格类型；外部输入用 Zod schema 校验，不以 `any`、不安全断言或关闭 lint 绕过契约。
- 全仓使用根目录 `.oxfmtrc.json` 中的 Oxfmt 规则；前端遵循相邻文件风格，不借功能改动大面积重排文件。
- 优先小范围、完整的修改。复用已有抽象；只有重复职责明确时才抽取公共逻辑，不引入未使用的依赖、占位实现或兼容别名。
- 对标准可复用的数组、对象与集合工具，若 `es-toolkit` 能明显降低复杂度或重复扫描，优先使用窄子路径导入；不要仅为保持一致性替换更省分配、带早退或明确安全边界的原生单遍循环。

## 数据、安全与迁移

- 本地服务维持回环地址监听及现有 Host / Origin / 跨站请求检查。不得为调试方便放开公网绑定、CORS 或请求体限制。
- 供应商密钥仅在服务端保存；不要写入代码、日志、错误消息、公共 RPC 响应、stories、截图或提交记录。保持端点变更时的凭据隔离。
- 外部订阅、模型端点等网络请求沿用 `packages/network/src/index.ts` 的安全边界；不得绕过 DNS / 私网地址、重定向、超时、响应大小与取消控制。
- 外部文章、Markdown 和来源链接均视为不可信输入。沿用安全 URL 检查和现有 Markdown 渲染策略，不启用未经净化的 HTML 注入。
- 修改数据库 schema 时生成并检查版本化迁移，保留 `packages/database/drizzle/` 元数据；验证全新数据库与旧库升级，不改写已应用的迁移历史。
- 归档日报及其来源快照不能因订阅删除、模板编辑或供应商配置变化被悄悄改写；生成失败不能覆盖已有成功结果。
- 执行持久化迁移或可能丢数据的操作前确认目标并备份。未经明确授权，不清空数据库、不删除用户数据，也不调用会产生真实模型费用的接口。

## 改动边界与交付

- 保留用户已有改动；不擅自 reset、覆盖文件或清理与任务无关的代码。不主动 commit / push，除非用户要求。
- 不提交 `node_modules/`、`dist/`、`storybook-static/`、`coverage/`、`test-results/`、自动生成的失败截图、本地数据库、`.env` 或日志；数据库迁移文件不属于可忽略的构建产物。
- 删除任务中创建的临时验证脚本，停止临时服务，保留有回归价值的测试。检查脚本、CI 或开发流程变更时同步维护此文档。
- 最终说明修改范围、实际执行的命令及结果、仍存在的警告与未验证项。不得将本地通过称为远端 CI 已通过，也不得将 Storybook 交互测试称为已完成像素级视觉回归测试。

## 精选日报

- `packages/domain/src/curation.ts` 定义兴趣标签、筛选设置、卡片和归档统计；`packages/ai/src/curation.ts` 负责筛选、事件归组、配额与证据校验。行为和评测边界见 `docs/curation.md`。
- 分析缓存可保存已经验证的正向和负向结果，失败不能伪装为低分或不匹配。缓存键必须隔离模型、端点、参数、标签、提示版本和文章变化；禁止存放密钥。
- 引用只能来自当前阶段实际提供的资料，须校验来源 ID 与原文摘录。全文抓取必须沿用公开网络访问边界；只显示纯文本，抓取失败回退到 RSS 并明确标注。
- 精选模式和原模板模式都须保留回归覆盖；旧归档保持原样。确定性替身测试不等于真实模型质量 benchmark。
- `pnpm benchmark:recall` 默认用 16 条合成 RSS 样本演示离线评分；真实模型运行必须显式使用 `--generate`，连接配置从 stdin 读取，数据库固定为内存且关闭全文抓取。样本、事件标注与指标边界见 `docs/benchmarks/rss-recall/README.md`；计分器和生成入口测试归入 `pnpm test:server`，示例和替身结果不能作为真实模型成绩。
- `pnpm benchmark:recall <结果路径> --check` 按 `baseline.json` 验收：召回率至少 87.5%、精确率至少 80%、最多 10 张卡片，未达标退出 1。该文件是初始验收标准，不是实测成绩；调整口径时同步维护数据集版本、文档与边界测试。

## Tauri 桌面入口

- `src-tauri/` 管理 Tauri 2 窗口、菜单栏、单实例与内置 Node.js 后端生命周期。`scripts/prepare-desktop.mjs` 打包独立运行环境、前端、后端、SQLite 原生模块与迁移文件；当前只支持本机架构的 macOS 构建。
- `pnpm desktop:dev` 运行预构建的桌面版；`pnpm desktop:build` 生成 `.app` 与 `.dmg`；`pnpm desktop:prepare` 只准备桌面资源；`pnpm desktop:test` 对准备后的资源执行隔离烟雾测试。使用说明见 `docs/desktop.md`。
- 桌面改动在完整 Web 门禁外，还须运行 `pnpm desktop:prepare && pnpm desktop:test`、`cargo fmt --manifest-path src-tauri/Cargo.toml --check`、`cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings` 和 `pnpm desktop:build`，并实际验证应用启动、退出和受影响的原生交互。
- 本机浏览器测试可通过 `PLAYWRIGHT_CHROMIUM_CHANNEL=chrome pnpm check` 使用已安装的 Chrome；未设置时沿用 CI 的 Playwright Chromium，测试断言与无障碍规则不变。独立 Node.js 运行环境可用 `DAILY_SIGNAL_NODE_BINARY` 指定。
- 桌面数据固定放在应用数据目录，测试使用临时 `DAILY_SIGNAL_DATA_DIR`。不能把开发数据库或密钥放进安装包，也不自动迁移现有数据。保留 HTTP 同源安全边界；桌面前端不授予通用 shell / 文件系统权限。
- `.desktop/`、`src-tauri/target/`、`src-tauri/gen/`、`src-tauri/binaries/` 是生成产物，不提交；`Cargo.lock` 与图标属于可提交资源。

## OPML 与后台抓取

- OPML 导入先事务保存订阅元数据，再由 `packages/feeds/src/ingestion.ts` 启动后台抓取。`feeds.status` 提供轻量进度；完整应用状态最多每几秒刷新一次，避免大批文章反复传输。
- 全局抓取并发为 8，同一主机最多 4；保留超时、公共地址与响应大小限制。失败订阅仍须可见，重试不能重复创建订阅；运行中任务互斥。
- 测量结果与边界见 `docs/benchmarks/opml-import/README.md`。区分订阅列表保存时间与文章抓取完成时间，不能把立即返回的导入确认当作完整吞吐量。

## Turborepo workspace

- `apps/web` 负责前端页面、Storybook 和 HTTP 服务启动；`packages` 下包含领域模型、契约、配置、数据库、网络、RSS、AI、供应商、设置、API、客户端、UI 和 TypeScript 配置 13 个包。
- 内部依赖在 `package.json` 中声明为 `workspace:*`，跨包代码只能使用包的公开 `exports`；包内使用相对路径。保持依赖图无环，不让库依赖应用。
- 设置持久化在 `packages/settings`，保存设置与刷新定时任务的编排在 `packages/api/src/settings.ts`；数据库默认模板在无副作用的 `packages/domain`。跨领域的数据库升级、供应商和 AI 集成测试位于 API 包，避免测试依赖形成包循环。
- 内部包直接导出 TypeScript，由 Vite/tsx 消费。每个代码包独立检查，Turbo 按依赖关系调度并缓存任务。共享包代码变化必须使下游检查和构建缓存失效。
- 根目录 `pnpm dev`、`pnpm check`、`pnpm build`、`pnpm build-storybook`、数据库和桌面命令保持可用；`fmt` / `fmt:check` 是 `format` / `format:check` 的别名。
- Storybook 同时收集应用和 UI 包的 stories，Tailwind 显式扫描 UI 包。CI 上传 `apps/web/storybook-static` 及两处 stories 的失败截图。
- `.env` 和默认数据库始终锚定仓库根目录；Turbo 的开发、运行、构建、Storybook 和数据库任务须保留相关环境变量。桌面脚本打包 `apps/web/dist`、应用服务入口和数据库包中的迁移文件，原生 SQLite 从数据库包解析。
