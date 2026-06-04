# 视图层占位说明

本期已实现 / 进行中的页面:

| 路径 | 文件 | 状态 |
| --- | --- | --- |
| `/login` | `auth/LoginView.vue` | 已实现(开发自测登录) |
| `/app/organizations` | `organization/OrganizationListView.vue` | 已实现(列表 + 新建) |
| `/app/projects` | `project/ProjectListView.vue` | 已实现(列表 + 新建,支持内联环境) |
| `/forbidden` | `error/ForbiddenView.vue` | 占位 |
| `/:pathMatch(.*)*` | `error/NotFoundView.vue` | 占位 |

后续业务模块按 README §5 路由设计在以下目录增量补齐:

| 目录 | 内容 |
| --- | --- |
| `environment/` | 环境列表 / 详情 / 模板 |
| `folder/` | folder 列表 / 详情 |
| `secret/` | secret 列表 / 详情 / reveal 弹窗 / 路径访问 |
| `audit/` | 审计查询 |
| `rbac/` | 角色 / 用户 / 授权 |

新增页面时请同时:

1. 在 `src/router/routes.ts` 内注册路由,并正确打 `meta.requiresAuth` / `meta.permissions`。
2. 列表页的列定义集中在 `views/<module>/columns.ts`。
3. 所有写操作必须经 `stores/<module>.ts` 的 action,view 内不直接发请求。
