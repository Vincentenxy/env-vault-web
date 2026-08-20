# MCP 配置与使用说明

本项目使用两个远程 MCP 服务：

- Figma：读取设计稿、页面节点、截图和设计变量。
- Apipost：读取当前项目的接口文档和接口调试信息。

## 当前配置位置

Codex MCP 配置位于本机用户配置文件，不在前端项目源码中：

```text
~/.codex/config.toml
```

当前已配置：

```toml
[mcp_servers.figma]
url = "https://mcp.figma.com/mcp"

[mcp_servers.apipost-mcp]
url = "https://efficient.qiuer.net/apipost/mcp"
```

Apipost 的 token 和 project id 已写入本机 Codex 配置，没有写入本仓库。

注意：当前 Codex 版本的 MCP 配置是用户级配置。虽然本次是在
`env-vault-web` 项目中配置的，但写入 `~/.codex/config.toml` 后，其他新 Codex
会话也可能看到这两个 MCP。当前 Codex 客户端没有提供会话内热更新能力；这样配置是
为了让重新打开的 Codex 会话能够使用 MCP。

## 重新加载 MCP

Codex 不会把新配置热加载到已经打开的对话中。配置完成后需要：

1. 关闭当前 Codex 对话或 VS Code 中的 Codex 会话。
2. 完全退出并重新打开 Codex 或 VS Code。
3. 在项目目录 `/Users/vincent/Desktop/codes.nosync/env-vault-web` 重新开启一个对话。

检查配置是否加载：

```sh
codex mcp list
codex mcp get figma
codex mcp get apipost-mcp
```

如果 Figma 首次使用时要求 OAuth 登录，在终端执行：

```sh
codex mcp login figma
```

完成登录后重新打开 Codex 会话。

## 后续修改 Apipost URL

编辑：

```text
~/.codex/config.toml
```

找到：

```toml
[mcp_servers.apipost-mcp]
url = "https://efficient.qiuer.net/apipost/mcp"
```

只修改 `url` 的值，保留下面的 `http_headers` 配置。例如：

```toml
[mcp_servers.apipost-mcp]
url = "https://新的-apipost-mcp地址/mcp"
http_headers = {
  APIPOST_API_TOKEN = "当前可用的 token",
  APIPOST_PROJECT_ID = "78"
}
```

修改后完全重启 Codex，再执行 `codex mcp get apipost-mcp` 检查 URL。

如果以后需要严格限制到本项目，可以把同样的两个 `[mcp_servers.*]` 配置移到
`~/.codex/env-vault-web.config.toml`，并从终端启动：

```sh
codex -p env-vault-web -C /Users/vincent/Desktop/codes.nosync/env-vault-web
```

这会使用项目专用 profile；不过 VS Code 中已经打开的 Codex 面板不能通过仓库文件自动选择该 profile。

## 安全注意事项

- 不要把 `~/.codex/config.toml` 提交到 git。
- 不要把 token 写入 `.env`、`vite.config.ts` 或前端代码；MCP 请求由 Codex 发起，不需要前端读取 token。
- 如果 token 被发送到公开聊天、日志或代码仓库，应在 Apipost 后台撤销并重新生成。
- 如果未来需要更换 token，只修改本机 `~/.codex/config.toml`，不要修改仓库文档中的示例。
