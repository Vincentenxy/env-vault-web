# Project Instructions

## Shared Development Workspace

- Secret management module:
  - Java SDK and primary working directory (`env-vault-client`): `E:\Java\Projects\env-vault-client`
  - Backend (`env-vault`, Go): `E:\goland\env-vault`
  - Frontend (`env-vault-web`, Vue): `E:\Projects\vue\env-vault-web`
- Publishing module:
  - Backend (`publish-devops-api`): `/Users/vincent/IdeaProjects/efficient-platform/publish-devops-api`
  - Frontend (`devops-frontend`): `/Users/vincent/Desktop/codes.nosync/devops-frontend`
- A request to modify the publishing frontend targets `devops-frontend`; a request to modify the secret management frontend targets `env-vault-web`.
- For Env Vault work, use `env-vault-client` as the default coordinating repository unless the request clearly targets the backend or frontend.
- For every Env Vault requirement, first determine whether it affects the Java SDK, Go backend, Vue frontend, or multiple repositories. API contract or user-flow changes must be checked across all affected repositories.
- Follow each repository's local instructions and run the relevant validation in every repository changed.
- Do not assume the repositories share the same parent directory; use the paths above when moving between them.

## 前端开发硬性规范

> 本节是本项目前端开发工作的硬性规范。所有代码变更（包括 AI 生成）必须遵守；样式实现同时遵循 `README.md` 的“UI 与交互”章节。

### 接口 Loading

- 所有接口调用都必须提供用户可见的 loading 状态，禁止在没有任何反馈的情况下等待请求完成。
- 列表、详情等查询请求在对应内容区域使用 `v-loading`、骨架屏或等价的局部加载反馈。
- 创建、更新、删除等操作请求在触发按钮上使用 loading 图标或 Element Plus 的 `loading` 属性，并在请求期间禁止重复提交。
- loading 状态必须在请求开始前开启，并通过 `try/finally` 在成功、失败和异常路径中统一关闭。
- 同一页面存在并发请求时，应按业务区域或数据项分别维护 loading，禁止用一个无关的全局状态阻塞整个页面。

### 弹框样式

- 所有业务弹框统一使用现有公共弹框样式，不得在页面内定义与全局规范冲突的外壳样式。
- 弹框外层圆角统一使用 `--v-radius-dialog`，当前值为 `16px`；禁止直接使用其他圆角值覆盖。
- 弹框公共边框、阴影、header 和 footer 样式以 `src/assets/styles/components.scss` 为准。
- 二次确认统一使用 `ElMessageBox.confirm`，并传入 `customClass: 'vault-confirm-message-box'`。

### 取消与确认按钮

- 所有弹框底部的“取消 / 确认”按钮必须使用现有统一样式，不得因页面不同改变圆角、尺寸或基础配色。
- 按钮统一为 `32px` 高、最小宽度 `58px`、水平内边距 `16px`、间距 `10px`，圆角使用 `--v-radius-dialog-action`，当前值为 `16px`。
- 普通确认按钮统一使用深蓝色 `#176dfb`，悬停/键盘聚焦状态使用 `#125bd6`；优先继承公共弹框确认按钮样式，未继承时必须使用公共类 `vault-dialog-confirm-button`，禁止在页面内另写颜色。
- 取消按钮使用现有次要按钮样式。
- 删除等危险确认按钮使用 danger 红色；`ElMessageBox.confirm` 同时传入 `confirmButtonClass: 'vault-delete-confirm-button'`。
- 提交中的确认按钮必须展示 loading 并禁止重复点击；取消按钮在提交期间应禁用。

### 图标按钮与悬停提示

- 查看/隐藏（眼睛）、编辑（铅笔）、历史版本（时钟）和删除（垃圾桶）等含义明确、行业通用的图标按钮，不得再使用 `el-tooltip` 重复展示同义说明。
- 图标按钮即使不展示悬停说明，也必须保留准确的 `aria-label`；切换类按钮还必须维护 `aria-pressed`，提交或删除中的按钮必须保留 loading/disabled 状态。
- 仅当图标不常见、同一图标在当前上下文存在歧义，或提示内容包含图标本身无法表达的重要信息时，才使用 Tooltip。
- 文本截断后的完整内容提示（如 `show-overflow-tooltip`）不属于图标说明，可以继续使用。
