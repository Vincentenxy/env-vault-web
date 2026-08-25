# EnvVault Web 开发硬性规范

> 本文件是本项目前端开发工作的硬性规范。所有代码变更（包括 AI 生成）必须遵守；样式实现同时遵循 `README.md` 的“UI 与交互”章节。

## 0. 前后端联合工作目录

- 密钥管理模块：
  - 后端 `env-vault`：`/Users/vincent/GolandProjects/env-vault`
  - 前端 `env-vault-web`：`/Users/vincent/Desktop/codes.nosync/env-vault-web`
- 发布模块：
  - 后端 `publish-devops-api`：`/Users/vincent/IdeaProjects/efficient-platform/publish-devops-api`
  - 前端 `devops-frontend`：`/Users/vincent/Desktop/codes.nosync/devops-frontend`
- “修改发布模块前端”指修改 `devops-frontend`；“修改密钥管理平台前端”指修改 `env-vault-web`。
- 后续处理每一项需求时，都必须先判断影响对应模块的后端、前端或两端；涉及接口契约或完整用户流程时，需要同时检查对应的前后端仓库。
- 修改哪个仓库，就遵循哪个仓库内的智能体规范并执行对应测试；跨端修改需要分别完成验证。
- 四个仓库不在同一父目录下，切换仓库时使用上述绝对路径。

## 1. 接口 Loading

- 所有接口调用都必须提供用户可见的 loading 状态，禁止在没有任何反馈的情况下等待请求完成。
- 列表、详情等查询请求在对应内容区域使用 `v-loading`、骨架屏或等价的局部加载反馈。
- 创建、更新、删除等操作请求在触发按钮上使用 loading 图标或 Element Plus 的 `loading` 属性，并在请求期间禁止重复提交。
- loading 状态必须在请求开始前开启，并通过 `try/finally` 在成功、失败和异常路径中统一关闭。
- 同一页面存在并发请求时，应按业务区域或数据项分别维护 loading，禁止用一个无关的全局状态阻塞整个页面。

## 2. 弹框样式

- 所有业务弹框统一使用现有公共弹框样式，不得在页面内定义与全局规范冲突的外壳样式。
- 弹框外层圆角统一使用 `--v-radius-dialog`，当前值为 `16px`；禁止直接使用其他圆角值覆盖。
- 弹框公共边框、阴影、header 和 footer 样式以 `src/assets/styles/components.scss` 为准。
- 二次确认统一使用 `ElMessageBox.confirm`，并传入 `customClass: 'vault-confirm-message-box'`。

## 3. 取消与确认按钮

- 所有弹框底部的“取消 / 确认”按钮必须使用现有统一样式，不得因页面不同改变圆角、尺寸或基础配色。
- 按钮统一为 `32px` 高、最小宽度 `58px`、水平内边距 `16px`、间距 `10px`，圆角使用 `--v-radius-dialog-action`，当前值为 `16px`。
- 普通确认按钮使用现有主色蓝，取消按钮使用现有次要按钮样式。
- 删除等危险确认按钮使用 danger 红色；`ElMessageBox.confirm` 同时传入 `confirmButtonClass: 'vault-delete-confirm-button'`。
- 提交中的确认按钮必须展示 loading 并禁止重复点击；取消按钮在提交期间应禁用。
