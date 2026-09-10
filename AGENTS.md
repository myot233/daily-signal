# Daily Signal 开发规范

本文件适用于整个仓库。修改前先阅读相关实现、测试和配置；更深目录的 `AGENTS.md` 可以补充局部规则。命令以 `package.json` 为准，CI 门禁以 `.github/workflows/check.yml` 为准；修改这些入口时同步更新本文件。

## 项目定位与目录边界

Daily Signal 是本地优先的 RSS / Atom 阅读与 AI 日报应用，包含订阅管理、原文阅读、日报生成与归档、模板编辑和模型供应商配置。界面以简体中文为主。

| 目录 / 文件                                                  | 职责                                                              |
| ------------------------------------------------------------ | ----------------------------------------------------------------- |
| `src/App.tsx`、`src/main.tsx`                                | 前端启动、路由和应用级编排                                        |
| `src/components/`                                            | 业务视图；`ui/` 为复用的 Radix UI 基础组件                        |
| `src/lib/`                                                   | 类型化 RPC 客户端、React Query 查询、Jotai 草稿状态及共享 UI 样式 |
| `src/styles.css`                                             | Tailwind 入口、主题变量、基础样式与减少动画偏好                   |
| `src/stories/fixtures.ts`                                    | 确定性的 Storybook 数据工厂                                       |
| `shared/types.ts`、`shared/contract.ts`、`shared/providers/` | 前后端共享的 Zod schema、oRPC 契约和供应商定义                    |
| `server/http/`、`server/rpc/`                                | HTTP 安全边界、RPC 输入输出与错误映射                             |
| `server/modules/`                                            | 按领域组织的业务服务与持久化操作                                  |
| `server/infrastructure/`                                     | SQLite / Drizzle 初始化、数据库 schema、安全网络访问              |
| `drizzle/`                                                   | 版本化数据库迁移及元数据                                          |
| `.storybook/`、`vitest.config.ts`                            | 组件预览与 Chromium 浏览器测试配置                                |

- 使用现有 React、React Query、Jotai、oRPC、Zod、Drizzle 体系，不为同一职责另建平行实现。
- 服务端状态沿用 React Query 查询与刷新机制；未保存的编辑草稿沿用 Jotai，不把已保存的凭据复制到全局前端状态。
- 前端不能导入 `server/` 实现；共享契约不能依赖数据库、服务端启动副作用或浏览器全局对象。
- API 变更从共享 schema / contract 开始，同步修改服务端实现、类型化客户端调用、fixtures 和相关测试，不留下旧调用路径。

## 环境与常用命令

- Node.js 最低 24；本地建议使用与 CI 相同的 Node.js 24。使用 `packageManager` 指定的 pnpm，不混用 npm / yarn，不新增其他锁文件。
- 首次安装使用下面的顺序：先链接依赖中的 `node-gyp`，再执行原生模块构建。`--ignore-scripts` 不是最终安装状态，不能省略 `pnpm rebuild`。

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
| `pnpm format:server`        | 格式化 `server/**/*.ts`，不要顺带重排无关文件                              |
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
| `pnpm format:server:check` | 服务端 TypeScript 的 Prettier 格式检查                                        |
| `pnpm lint`                | oxlint 静态检查，警告也视为失败                                               |
| `pnpm typecheck`           | `tsc --noEmit`；包含前后端、共享契约、stories 和测试配置                      |
| `pnpm test:server`         | `tsx --test` 执行 `server/**/*.test.ts`，使用 Node.js 原生测试框架            |
| `pnpm test:storybook`      | Vitest `storybook` project，在真实 Chromium 中执行 stories 的交互与无障碍检查 |
| `pnpm test`                | 依次执行服务端测试和 Storybook 测试                                           |
| `pnpm check`               | 依次执行服务端格式检查、lint、类型检查和 `pnpm test`                          |
| `pnpm build`               | 类型检查与 Vite 生产构建，输出 `dist/`                                        |
| `pnpm build-storybook`     | Storybook 静态构建，输出 `storybook-static/`                                  |

- 开发中可以只跑受影响的测试以缩短反馈；最终不能以局部通过替代完整门禁。并行修改先汇合，再运行最终检查，避免检查半成品。
- 纯文档改动且不影响代码、配置或命令实现时，可以只验证命令、路径、链接与事实；交付时明确说明没有重跑运行时测试。CI 仍按工作流执行完整检查。
- 任何检查失败都要排查原因；不得通过 `.skip`、删除有效断言、降低检查级别、添加宽泛忽略或修改无关行为来“变绿”。修复后重跑失败项及受影响的检查。
- 环境阻塞必须说明具体命令、错误和未验证范围，不能把未运行的检查描述为通过。
- CI 在 push / PR 时执行完整门禁，并上传 Storybook 静态产物与失败时可用的浏览器测试截图。

## 测试编写规范

### 通用要求

- 测试用户可观察的行为、业务边界和错误路径，不只验证内部函数被调用、字段转发、源码文字或快照没有变化。
- 修复缺陷时优先保留能重现原缺陷的回归测试；不为凑数量重复覆盖同一路径。
- 测试必须可重复、相互隔离且能全量执行。固定 fixtures 的日期和数据；不要依赖运行顺序、真实 API Key、外部 RSS、付费模型或公网可用性。
- 网络响应在服务边界使用确定性替身，模拟真实成功与失败；不要用空实现把待测逻辑一起替换掉。
- 不使用固定 sleep 等待异步状态。等待可观察结果，并在结束时关闭服务器、数据库、定时器和其他测试资源。

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
- `.storybook/preview.tsx` 已加载应用样式并提供隔离的 Jotai Provider。沿用它，不使用跨 story 的共享可变 store，不用 story 专属 CSS 掩盖组件问题。
- 涉及保存的 story 可以在父组件边界模拟内存持久化，但必须执行 action、更新保存状态并正确处理失败；不能简单返回成功而跳过动作。
- 保持全局 `a11y.test: 'error'`。修复组件的语义、标签、焦点、键盘操作或对比度问题，不关闭规则来绕过失败。无障碍自动化通过不代表完整人工审计。
- UI 改动除自动化测试外，还必须在应用或 Storybook 中检查实际渲染和受影响的交互；响应式改动检查桌面与窄屏，关注横向溢出、焦点恢复和弹窗可操作性。
- 有 `play` 的 stories 要验证 Storybook Interactions 面板中的回放。命令行浏览器测试不能替代静态构建，截图也不能替代行为断言。

## UI 与代码风格

- 优先复用 `src/components/ui/`、`src/lib/ui-styles.ts` 和现有主题变量；保持现有纸张色、编辑式排版与中文文案风格。
- 使用语义化 HTML，保持标题层级连续，表单控件有可访问标签，纯图标按钮有名称；保留键盘导航与减少动画偏好。
- 保持 TypeScript 严格类型；外部输入用 Zod schema 校验，不以 `any`、不安全断言或关闭 lint 绕过契约。
- 服务端沿用已有 Prettier 配置；前端遵循相邻文件风格。没有全仓前端格式化脚本，不借功能改动大面积重排文件。
- 优先小范围、完整的修改。复用已有抽象；只有重复职责明确时才抽取公共逻辑，不引入未使用的依赖、占位实现或兼容别名。

## 数据、安全与迁移

- 本地服务维持回环地址监听及现有 Host / Origin / 跨站请求检查。不得为调试方便放开公网绑定、CORS 或请求体限制。
- 供应商密钥仅在服务端保存；不要写入代码、日志、错误消息、公共 RPC 响应、stories、截图或提交记录。保持端点变更时的凭据隔离。
- 外部订阅、模型端点等网络请求沿用 `server/infrastructure/network/public-fetch.ts` 的安全边界；不得绕过 DNS / 私网地址、重定向、超时、响应大小与取消控制。
- 外部文章、Markdown 和来源链接均视为不可信输入。沿用安全 URL 检查和现有 Markdown 渲染策略，不启用未经净化的 HTML 注入。
- 修改数据库 schema 时生成并检查版本化迁移，保留 `drizzle/` 元数据；验证全新数据库与旧库升级，不改写已应用的迁移历史。
- 归档日报及其来源快照不能因订阅删除、模板编辑或供应商配置变化被悄悄改写；生成失败不能覆盖已有成功结果。
- 执行持久化迁移或可能丢数据的操作前确认目标并备份。未经明确授权，不清空数据库、不删除用户数据，也不调用会产生真实模型费用的接口。

## 改动边界与交付

- 保留用户已有改动；不擅自 reset、覆盖文件或清理与任务无关的代码。不主动 commit / push，除非用户要求。
- 不提交 `node_modules/`、`dist/`、`storybook-static/`、`coverage/`、`test-results/`、自动生成的失败截图、本地数据库、`.env` 或日志；数据库迁移文件不属于可忽略的构建产物。
- 删除任务中创建的临时验证脚本，停止临时服务，保留有回归价值的测试。检查脚本、CI 或开发流程变更时同步维护此文档。
- 最终说明修改范围、实际执行的命令及结果、仍存在的警告与未验证项。不得将本地通过称为远端 CI 已通过，也不得将 Storybook 交互测试称为已完成像素级视觉回归测试。
