# EnvVault Web 开发规范

> 适用范围:`env-vault-web` 前端项目(以及前后端对齐时对后端实现的约束)。
>
> 本文档是**前端开发 + 前后端契约**层面的强制规范,所有 PR 必须遵守。
> 业务专题设计(如 RBAC 模型、Secret 模型)在 `design/<topic>-design.md` 中,本文不重复。

---

## 1. 接口方法选择(HTTP Verb)

### 1.1 规则总览

| 接口形式 | HTTP 方法 | 说明 |
| --- | --- | --- |
| **不带任何请求数据**的查询 | **GET**(无 body,无 query) | 一次性返回后端认为合适的全量/分页结果 |
| **带有请求数据**的查询或变更 | **POST**(body = JSON) | 包含分页、过滤条件、资源 ID、搜索关键字等 |
| 分享链接 / 跳转链接 | **GET + query params** | 唯一允许带 query 的 GET 场景 |
| 删除 | **POST**(如 `/xxx/delete`)| **禁止 DELETE / PUT** |
| 更新 | **POST**(如 `/xxx/update`)| **禁止 PUT / PATCH** |
| 创建 | **POST**(如 `/xxx/create`)| — |

> **简记**:默认 `GET = 无参`,`POST = 有参`。除「分享类接口」外不允许其他带 query 的 GET。

### 1.2 正确 / 错误示例

| 场景 | ❌ 错误 | ✅ 正确 | 原因 |
| --- | --- | --- | --- |
| 列出系统所有角色 | `GET /rbac/role/list?scopeType=global&pageNum=1&pageSize=100` | `GET /rbac/role/list`(无参) | 不带请求数据 → 应当无参 GET,后端一次性返回 |
| 列出某 org 下的 project | `GET /project/list?orgId=...&pageNum=...` | `POST /project/list` body `{ orgId, pageNum, pageSize }` | 带了过滤+分页 → 用 POST + body |
| 删除 secret | `DELETE /secret/delete?id=...` | `POST /secret/delete` body `{ id }` | 禁止 DELETE,统一走 POST + body |
| 分享链接 | `GET /share/abc?token=...` | `GET /share/abc?token=...` | 分享类天然适合 URL 表达,允许带 query |
| 给用户授权 | — | `POST /rbac/binding/grant` body `{ userId, roleCode, scopeType, scopeId }` | 变更类一律 POST + body |

### 1.3 禁止事项

- **禁止** 使用 `DELETE` / `PUT` / `PATCH` 方法。删除走 `POST /<resource>/delete`,更新走 `POST /<resource>/update`。
- **禁止** 在 GET 请求中携带业务 query 参数(分享类除外)。GET 默认无 body、无 query。
- **禁止** 出现路径中带 `?` 但 query 为空的"伪装 GET"。

### 1.4 前端落地约束

- [src/api/http.ts](src/api/http.ts) 的 axios 实例:GET 请求不传 `data`,POST 请求统一 `Content-Type: application/json`。
- 前端 `api/<topic>.ts` 的函数命名:
  - `listXxx()` / `getXxx()` / `fetchXxx()`:GET(无参)或 POST(有参),按后端实际选择
  - `createXxx()` / `updateXxx()` / `deleteXxx()`:一律 POST
- 形参 `config?: AxiosRequestConfig` 允许透传 `silent` 等标志位,**不**用于业务参数。

---

## 2. 命名规范

### 2.1 通用规则

- **统一使用驼峰命名法**(camelCase)。
- **禁止** 使用下划线命名(snake_case)或中划线命名(kebab-case)在变量 / 字段 / API 字段名里。
- 路径段(Path segment)使用复数名词,全小写:`/rbac/role/list`、`/project/info`、`/secret/reveal`。

### 2.2 字段命名示例

| 含义 | ✅ 驼峰 | ❌ 反例 |
| --- | --- | --- |
| 用户 ID | `userId` | `user_id` / `UserId` |
| 角色 code | `roleCode` | `role_code` / `RoleCode` |
| 范围类型 | `scopeType` | `scope_type` |
| 资源 ID | `resourceId` | `resource_id` |
| 是否系统 | `isSystem` | `is_system` |
| 过期时间 | `expiresAt` | `expires_at` |

### 2.3 特殊情况

- 数据库表名 / 列名使用 snake_case(`user_role_bindings`、`granted_by`)是后端存储约定,**不**影响 API 字段命名;wire 上仍用 camelCase。
- 权限码 `<resource>:<action>` 形式是约定的,不属于命名风格(见 [design/rbac-design.md](design/rbac-design.md) §"权限点设计")。
- TypeScript 类型 / interface 名称使用 PascalCase;枚举值用 camelCase。

---

## 3. 请求 / 响应规范

### 3.1 响应体(强制)

**响应体严格只含 `code` / `msg` / `data` 三个字段,不得包含 `trace_id` / `requestId` / `error` / 其他额外字段。**

```json
{
  "code": 0,
  "msg": "",
  "data": {}
}
```

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `code` | `number` | 响应状态码(规范见 §3.3) |
| `msg` | `string` | 提示消息;成功可为空字符串,失败时给可读中文文案 |
| `data` | `T \| null` | 业务数据;无数据时为 `null` |

### 3.2 禁止 / 必须

- ❌ 响应中**禁止**出现 `traceId` / `requestId` / `error` / `errors` / `errorMessage` / `timestamp` / 其他任何额外字段。
  - 调试用的 requestId **只能**通过 HTTP 响应头返回(`X-Request-Id`),不得写入 body。
- ❌ 响应中**禁止**使用 HTTP 状态码表达业务错误;业务错误仍用 200 + `code != 0`。
- ✅ 响应**必须**是上述三字段 envelope;`null` 数据也用 `null` 表达,不省略 `data` 字段。

### 3.3 响应状态码(code)规范

| 取值范围 | 含义 | 备注 |
| --- | --- | --- |
| `0` | 成功 | 唯一表示成功的值 |
| `-1` | 通用失败 | 业务层无法明确归类时使用 |
| `1` ~ `1000` | 与 HTTP 状态码对齐 | 例如 `401` = 未认证,`403` = 无权限,`404` = 不存在,`409` = 冲突 |
| `> 1000` | 业务自定义错误码 | 业务可按需扩展,推荐按域分段(`12xx` = 用户类,`14xx` = 权限类,`15xx` = 系统类) |

#### 3.3.1 1~1000 段的具体约定

| code | HTTP 状态码 | 场景 |
| --- | --- | --- |
| `400` | 400 | 请求体不合法 |
| `401` | 401 | 未认证(JWT 缺失或失效) |
| `403` | 403 | 已认证但无权限 |
| `404` | 404 | 资源不存在,或对无权限资源故意返回 404 避免泄露存在性 |
| `409` | 409 | 业务冲突(唯一约束、最后一个 owner 删除保护等) |
| `500` | 500 | 未预期错误 |
| `503` | 503 | 依赖服务不可用或服务未配置 |

> 实际项目里常见业务码如 `1401` / `1403` / `1404` / `1409`(把 4 位数业务段与 HTTP 对齐)也是允许的,只要保持 `code` 唯一、文档可查。

### 3.4 请求体规范

- 字段命名遵守 §2 驼峰规则。
- 时间字段统一 ISO 8601 字符串(`"2026-06-13T10:00:00Z"`),不传时间戳数字。
- UUID 字段统一 `string` 格式(标准 8-4-4-4-12)。
- 可选字段缺失时**省略**该字段(不要塞 `null` 占位),后端按"未提供"处理。

---

## 4. 错误处理(前端)

- HTTP 拦截器([src/api/http.ts](src/api/http.ts))统一把非 `0` 码归一为 `ApiError` 并弹 `ElMessage.error` toast。
- View / Store **不需要**重复 `ElMessage.error`,只在以下场景额外提示:
  - 批量操作(部分失败):`ElMessage.warning('成功 N 项,失败 M 项')`。
  - 业务语义补充(成功但有后续动作需要提示):`ElMessage.success(...)`。
- 请求配置 `{ silent: true }` 时跳过 toast,供静默失败场景使用(如后台轮询)。

---

## 5. 接口路径与版本

- 所有接口统一前缀 `/api/v1/...`。
- 路径段全小写、复数名词、动作式动词:`/rbac/role/list`、`/rbac/role/info`、`/rbac/role/create`、`/rbac/role/update`、`/rbac/role/delete`、`/rbac/binding/grant`、`/rbac/binding/revoke`。
- 不在路径里写资源 ID,资源 ID 放 body 里;分享类除外。

---

## 6. 校验与门禁(给后续接入用)

- 新增 / 修改 API 路径时,CI / PR 评审需检查:
  - 方法是否符合 §1(无参查询必须是 GET,有参必须是 POST,无 DELETE/PUT/PATCH)。
  - 响应体是否符合 §3.1(只能 3 字段)。
  - 字段名是否符合 §2(驼峰)。
  - 状态码是否符合 §3.3(0 成功、-1 通用失败、1-1000 对齐 HTTP、> 1000 业务码)。
- 前端 `npm run typecheck` + `npm run build` 必须通过。

---

## 7. 修订记录

| 日期 | 修订内容 | 作者 |
| --- | --- | --- |
| 2026-06-13 | 初版:HTTP verb 规则、命名规范、响应体三字段、状态码分段 | Claude |
