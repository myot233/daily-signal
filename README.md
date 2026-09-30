# Daily Signal

本地优先的 RSS / Atom 阅读与 AI 日报应用，使用 pnpm workspace + Turborepo 管理。Web 前端与 Express/oRPC 后端共用一个本地 HTTP 服务，默认访问 `http://127.0.0.1:3000`；Tauri 桌面客户端保留独立运行环境和原有数据目录。

## 开始使用

需要 Node.js 24+ 和 pnpm 10.32.1。先链接依赖，再构建原生 SQLite 模块和安装 Git hooks：

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm rebuild
pnpm exec playwright install chromium
pnpm dev
```

生产模式使用 `pnpm build && pnpm start`。`start` 通过 Turbo 确认构建完成；代码未变化时复用缓存。前端产物在 `apps/web/dist`，Web 服务端由 tsx 运行，因此 Web 部署需要 workspace 源码与依赖。桌面安装包由原有桌面脚本生成，见 [桌面说明](docs/desktop.md)。

## RSS 阅读与订阅管理

在「订阅与文章」中可标记已读 / 未读、收藏文章、按分组与阅读状态筛选，并选择最新或最早优先。打开文章预览或原文时自动标记已读，阅读状态在刷新和重启后保留。订阅列表显示未读数，每页展示 50 篇文章。

「全部标为已读」作用于当前来源、分组、搜索、状态和收藏筛选的全部匹配文章，包含其他分页。订阅支持自定义名称和修改分组，刷新后保留。原有 RSS / Atom、搜索、OPML 导入导出和文章翻译继续可用。

阅读快捷键：`J` / `K` 切换下一篇 / 上一篇，`M` 切换已读状态，`S` 切换收藏；列表内按 `/` 聚焦搜索，`Esc` 关闭阅读抽屉。表单输入时不触发这些快捷键。行为及数据边界见 [RSS 阅读说明](docs/rss-reader.md)。

## 包结构

| 目录                         | 包名                              | 职责                                                      |
| ---------------------------- | --------------------------------- | --------------------------------------------------------- |
| `apps/web`                   | `@daily-signal/web`               | 页面、路由、样式、Storybook 和 HTTP 服务启动              |
| `packages/domain`            | `@daily-signal/domain`            | 领域 schema、供应商目录、精选日报类型、默认模板和业务错误 |
| `packages/contracts`         | `@daily-signal/contracts`         | 前后端共用的 oRPC 契约                                    |
| `packages/config`            | `@daily-signal/config`            | `.env` 加载、运行配置校验和稳定路径解析                   |
| `packages/database`          | `@daily-signal/database`          | SQLite / Drizzle 初始化、schema 和迁移                    |
| `packages/network`           | `@daily-signal/network`           | 安全公开网络请求、超时和响应大小控制                      |
| `packages/feeds`             | `@daily-signal/feeds`             | RSS / Atom、OPML 和后台抓取队列                           |
| `packages/providers`         | `@daily-signal/providers`         | 模型供应商、凭据、协议适配和模型发现                      |
| `packages/settings`          | `@daily-signal/settings`          | 设置和默认模型的持久化查询                                |
| `packages/ai`                | `@daily-signal/ai`                | 翻译、精选日报、流式生成、缓存和每日调度                  |
| `packages/api`               | `@daily-signal/api`               | HTTP 安全边界、RPC 和跨领域编排及集成测试                 |
| `packages/client`            | `@daily-signal/client`            | 类型化 RPC 客户端、React Query、Jotai 和浏览器辅助函数    |
| `packages/ui`                | `@daily-signal/ui`                | Radix UI 组件、共享样式辅助函数和 UI stories              |
| `packages/typescript-config` | `@daily-signal/typescript-config` | 共用 TypeScript 配置                                      |

应用负责组装，各包不依赖应用。API 依赖 AI、RSS、供应商和设置；这些包依赖数据库、网络、配置和领域模型。跨领域的保存设置与调度编排位于 API，默认模板位于无副作用的领域包，避免循环依赖。

内部包以 `workspace:*` 声明依赖并通过 `exports` 暴露 TypeScript 源码，由 Vite / tsx 转译，无需各自生成 `dist`：

```ts
import { settingsSchema } from '@daily-signal/domain';
import { Button } from '@daily-signal/ui/button';
import { rpc } from '@daily-signal/client';
```

每个代码包有独立的类型检查和 lint，测试随所属包或集成边界维护。Turbo 按依赖图调度任务，库代码修改会使下游检查与应用构建缓存失效。开发服务监听共享包的 TypeScript，前端由 Vite 热更新；Tailwind 显式扫描 UI 包。

## 检查与命令

```sh
pnpm check               # 格式、lint、类型检查、服务端和 Storybook 浏览器测试
pnpm build               # 类型检查及 Web 生产构建
pnpm build-storybook     # 静态组件工作台，输出 apps/web/storybook-static
pnpm test:server
pnpm test:storybook
pnpm ui:audit            # 多视口间距、溢出和对齐审查，输出 HTML/JSON 与失败截图
pnpm storybook           # 本地组件工作台，端口 6006
pnpm format
pnpm lint:fix
pnpm db:generate
pnpm db:migrate
```

最终 Web 门禁为 `pnpm check && pnpm build && pnpm build-storybook`。CI 保留完整测试与无障碍检查。`fmt` / `fmt:check` 是格式命令的别名，原有 `desktop:*` 命令继续可用。

`pnpm check` 包含 UI 间距审查；pre-commit 在 UI 相关文件变更时检查暂存版本。报告位于 `apps/web/test-results/ui-audit/index.html`，规则、覆盖范围与浏览器配置见 [UI 间距审查](docs/ui-audit.md)。

按包运行任务：

```sh
pnpm exec turbo run test:server --filter=@daily-signal/feeds
pnpm exec turbo run typecheck --filter=@daily-signal/api...
pnpm exec turbo run build --dry
```

开发服务、生产服务、Storybook 监听和数据库命令禁用缓存；数据库命令每次实际执行。迁移文件位于 `packages/database/drizzle`，启动时自动应用。

## 数据与环境变量

复制 `.env.example` 为仓库根目录的 `.env`。系统环境变量优先；默认数据库始终位于仓库根目录的 `data/daily-signal.sqlite`，已有数据无需搬迁。`DATABASE_PATH` 相对路径也按仓库根目录解析，不受 Turbo 的工作目录影响。`HOST` 仅允许回环地址，`PORT` 和退出超时沿用统一配置。

桌面客户端通过资源目录使用打包的前端与迁移，数据仍保存在应用数据目录。验证使用内存数据库或临时目录，不读取应用数据和真实凭据。

订阅源图标由本地服务按需下载网站的 `/favicon.ico`，保存在同一 SQLite 数据库的 `feed_icons` 表中；前端通过 RPC 读取图片数据，不直接访问图标网站。同一网站共用缓存，重启或断网后可继续显示已缓存图标。成功缓存 7 天，失败后 1 小时再试；更新失败保留旧图标，没有可用图片时显示 RSS 图标。下载最多并发 8 个，单张上限 512 KiB、超时 5 秒，并沿用公开网络访问检查。

新增包时提供独立名称、公开 `exports`、所需依赖与检查脚本；继承 `@daily-signal/typescript-config/base.json`（React 使用 `react.json`），消费者声明 `workspace:*`，然后运行 `pnpm install`。跨包使用公开入口，包内使用相对路径。
