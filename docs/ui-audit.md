# UI 间距审查

`pnpm ui:audit` 在真实 Chromium 中审查页面的实际布局。它复用 Storybook、应用样式和 fixtures，不启动后端。该命令已接入 `pnpm check` 和 pre-commit。

## 覆盖范围

`apps/web/src/App.stories.tsx` 渲染真实 App：今日简报、订阅源、文章、归档、日报设置、模型连接，以及空状态、添加订阅弹窗和文章预览。数据包含长标题和正文。`parameters.appShell: true` 去掉组件预览的外层 24px padding，保留生产环境的侧栏和内容容器。

标记 `ui-audit` 的整页 stories 会先执行交互与无障碍检查，再依次测量 375、640、641、950、951、1050、1051、1440px 的布局。Storybook 适配器会重设视口，因此审查在 `play` 完成后切换尺寸，等待字体、媒体查询更新与浏览器布局。交互本身仍使用默认视口；这不是全套移动端交互测试，也不覆盖所有局部断点。

当前规则位于 `apps/web/src/stories/ui-audit.ts`：

| 规则           | 判断                                                                                       |
| -------------- | ------------------------------------------------------------------------------------------ |
| 横向溢出       | 页面内容、卡片、工具栏、阅读面板等边界的 scrollWidth 超过 clientWidth                      |
| 水平 padding   | 页面 12–24px（窄屏）或 12–32px；紧凑面板 8–24px；普通弹窗 8–40px                           |
| 垂直 padding   | 列表行至少 6px，面板与卡片至少 8px；通常不超过 32px，普通弹窗不超过 40px；页面底部 12–32px |
| 有效内边距     | 卡片 header/content/footer 加上父容器后的水平留白为 12–32px，并保持各区域对齐              |
| 抽屉与内联阅读 | 外框可以零 padding；实际内容区域留白为 12–40px，并保持各区域对齐                           |
| 空状态         | 显式 `data-spacing="empty-state"` 的卡片水平留白为 24–48px；仍检查溢出和垂直 padding       |
| 间隔与重叠     | 主标题、筛选栏和工作区的 flex/grid gap 为 8–32px；标题栏和筛选栏直接子元素不得相互重叠     |

尺寸容差为 1px，以容纳浏览器的小数像素取整。隐藏元素不参加审查；代码块等内部滚动区域不会仅因自身可滚动而报错，其外层仍要满足边界要求。新增明确的布局类型应补充相应规则与正反例，不添加宽泛忽略来绕过失败。

这些是本项目紧凑界面的几何约束，不是通用审美评分。留白节奏、视觉层级等主观质量仍需要看图复核；当前不调用视觉模型，也不进行像素基线比较。

## 本地运行与提交

```sh
pnpm exec playwright install chromium
pnpm ui:audit
```

本机也可使用项目已有的浏览器选择方式：`PLAYWRIGHT_CHROMIUM_CHANNEL=chrome pnpm ui:audit`。浏览器缺失、交互失败、无障碍失败或间距规则失败都会返回非零状态，不自动跳过。

pre-commit 使用 `lint-staged --hide-all --diff-filter=ACMRD`，先格式化存在的暂存文件，再在 UI 输入发生变化时运行一次完整审查（大量文件被 lint-staged 分批时可能运行多次）。UI 输入包括 Web、UI/client/domain/contracts 包、共享 TypeScript 配置、资源、依赖锁文件和检查入口。删除 UI 文件也触发检查；纯后端或说明文档提交只执行格式化。未暂存修改与未跟踪文件在执行期间被隐藏，结束后由 lint-staged 恢复，避免检查到与提交不一致的源码。依赖仍使用当前安装的 node_modules；修改依赖后须先完成安装。

`scripts/ui-audit.test.mjs` 用 Chromium 验证故意损坏和正常的几何布局，并在独立临时 Git 仓库验证暂存检查、失败恢复和删除场景；不修改开发仓库的 index。

## 报告与 CI

每次场景审查清理并重新生成 `apps/web/test-results/ui-audit/`：

- `index.html`：场景与视口结果、问题说明、截图。
- 单场景 JSON：源文件、视口、选择器、测量值与元素矩形。
- PNG：间距失败时的场景截图，问题元素标红。
- `vitest.json`：交互、无障碍和运行时错误；`failures/` 保存浏览器测试失败截图。

CI 通过 `pnpm check` 执行同一规则，并用 `ui-spacing-audit` artifact 保存报告（7 天）。报告位于已有的 test-results 忽略目录，不提交到 Git。若审查器自身回归测试失败，场景审查不会启动，错误直接显示在命令日志。

新增整页状态时，使用确定性的 fixtures 与 `ui-audit` 标签；保持全局 `a11y.test: 'error'`。独立组件预览不能替代真实页面宽度下的检查。
