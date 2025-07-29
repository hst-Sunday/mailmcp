[English version available](./README.en.md)

# MailMCP (Model Context Protocol) Server

MailMCP 是一个基于 TypeScript 的多传输协议（Stdio、HTTP+SSE、Streamable HTTP、向后兼容）MCP 服务器，内置智能日志、邮件集成（QQ邮箱、Gmail OAuth）、模块化工具注册与参数校验，适合 AI Agent、自动化和邮件场景的高可扩展服务端项目。此项目最好与[mail-auth](https://github.com/hst-Sunday/mail-auth.git)配合使用。

---

## ✨ 核心特性

- **多协议传输支持**：Stdio、HTTP+SSE、Streamable HTTP、向后兼容模式一键切换
- **智能日志系统**：自动根据传输模式选择输出流，避免 JSON-RPC 干扰
- **模块化工具注册**：支持自定义工具，参数校验基于 Zod
- **邮件服务集成**：支持 QQ 邮箱、Gmail（OAuth 2.0），自动刷新 Gmail Token
- **丰富测试用例**：覆盖所有传输协议和邮件功能
- **高可扩展性**：易于新增传输方式、工具和第三方集成

---

## 🏗️ 架构概览

- **核心业务（src/core/）**
  - `server.ts`：MCP 服务器创建与配置
  - `tools/`：所有工具注册与实现（如邮箱登录、查询、发送等）
  - `types.ts`：核心类型定义
- **传输层（src/transports/）**
  - `base.transport.ts`：传输层抽象基类
  - `stdio/http-sse/streamable-http/backward-compatible.transport.ts`：各协议实现
- **工具类（src/utils/）**
  - `logger.ts`：智能日志系统
  - `config.ts`：配置与环境变量管理
  - `email-service.ts`：邮件收发与 OAuth 支持
  - `storage.ts`：本地账户与 Token 存储
  - `login-server.ts`：Web 登录服务
- **示例与测试（src/examples/）**
  - `client.ts`：多协议客户端示例
  - `logger-demo.ts`：日志系统演示

详细架构请见 [ARCHITECTURE.md](./ARCHITECTURE.md)

---

## 🚀 快速开始

### 用法
1.使用`npx`  
```json
{
  "mcpServers": {
    "Context7": {
      "command": "npx",
      "args": ["-y", "mailmcp"]
    }
  }
}
```

2.`clone`代码
```bash
git clone git@github.com:hst-Sunday/mailmcp.git
cd mailmcp
npm install
npm run build
```

`claude desktop 使用` 

参考[claude_desktop_config_sample.json](./claude_desktop_config_sample.json)  
⚠️注意: `Google oauth`使用[https://mailauth.mailmcp.de](https://mailauth.mailmcp.de) 授权服务，已经开源[https://github.com/hst-Sunday/mail-auth.git](https://github.com/hst-Sunday/mail-auth.git)

## 💻 本地开发

### 1. 安装依赖

```bash
npm install
```

### 2. 启动服务器

```bash
# Stdio 模式
npm run start:stdio

# HTTP+SSE 模式（端口 3000）
npm run start:http-sse

# Streamable HTTP 模式（端口 3001）
npm run start:streamable-http

# 向后兼容模式（端口 3002）
npm run start:backward-compatible
```

### 3. 邮箱功能测试

```bash
# 测试 Gmail OAuth IMAP 连接
npm run test:gmail-oauth

# 测试 ImapFlow 基本功能
npm run test:imapflow

# 测试通过 UID 获取邮件内容
npm run test:uid-fetch
```

更多测试用法见 [测试文档](./test/README.md)。

---

## 📧 邮件服务与 OAuth 配置

- 支持 QQ 邮箱（IMAP/SMTP，推荐使用授权码）
- 支持 Gmail（OAuth 2.0，自动 Token 刷新）

**Gmail OAuth 配置说明：**
当前 Gmail OAuth 功能需配合 [https://mailauth.mailmcp.de](https://mailauth.mailmcp.de) 授权服务使用（该服务暂未开源，后续将开放源代码）。
1. 通过 [https://mailauth.mailmcp.de](https://mailauth.mailmcp.de) 完成 Gmail 邮箱授权，获取访问权限。
2. 支持自动刷新 access_token，无需手动干预。
---

## 🛠️ 工具系统与扩展

- 所有工具位于 `src/core/tools/`，自动注册
- 新增工具需实现 Tool 接口并注册
- 参数校验统一采用 Zod
- 邮箱相关工具：
  - `email-login`：邮箱登录与 OAuth 管理
  - `email-query`：邮件查询
  - `email-send`：邮件发送
  - `email-detail`：邮件详情获取

---

## 📝 智能日志系统

- 日志级别：DEBUG、INFO、WARN、ERROR
- 自动流选择：Stdio 模式全部输出到 stderr，其它模式区分 info/debug（stdout）与 warn/error（stderr）
- 推荐用法：
  ```typescript
  import { Logger, LogLevel } from './src/index.js';
  Logger.setTransport('stdio');
  Logger.setLogLevel(LogLevel.INFO);
  Logger.info('服务启动');
  ```

---

## 🧩 扩展性与最佳实践

- **新增传输协议**：继承 `base.transport.ts` 并注册
- **自定义工具**：实现 Tool 接口，注册到 ToolRegistry
- **配置优先级**：命令行参数 > 环境变量 > 默认值
- **类型安全**：全项目 TypeScript + Zod 校验
- **ESLint**：所有提交需无 lint 错误

---

## 🛡️ 常见问题

- **Stdio 模式 JSON 干扰**：务必用 Logger 替代 console.log
- **端口冲突**：通过 `PORT=xxxx` 环境变量指定端口
- **Gmail OAuth 失败**：检查环境变量与凭据，详见 [OAUTH_SETUP.md](./doc/OAUTH_SETUP.md)

---

## 🧑‍💻 技术栈

- TypeScript
- Node.js
- @modelcontextprotocol/sdk
- Express.js
- Zod
- ImapFlow / Nodemailer

---

## 📂 项目结构

```
src/
├── core/                    # 业务逻辑与工具
├── transports/              # 传输层实现
├── utils/                   # 工具与服务
├── examples/                # 示例与测试
├── index.ts                 # 应用入口
└── app.ts                   # CLI 主逻辑
```

---

## 📝 许可证

ISC

---

如需详细开发、扩展或集成说明，请查阅 [ARCHITECTURE.md](./ARCHITECTURE.md) 及各类文档。欢迎 Issue 与 PR！

---

如需进一步细化或定制内容，请告知具体需求。 