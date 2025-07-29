[🇨🇳 查看中文版](./README.md)
# MailMCP (Model Context Protocol) Server

MailMCP is a TypeScript-based MCP server supporting multiple transport protocols (Stdio, HTTP+SSE, Streamable HTTP, Backward Compatible). It features intelligent logging, email integration (QQ Mail, Gmail OAuth), modular tool registration with parameter validation, and is ideal for AI Agent, automation, and email scenarios requiring a highly extensible backend. It is recommended to use this project together with [mail-auth](https://github.com/hst-Sunday/mail-auth.git).

---

## ✨ Core Features

- **Multi-protocol transport support**: Easily switch between Stdio, HTTP+SSE, Streamable HTTP, and Backward Compatible modes
- **Intelligent logging system**: Automatically selects output stream based on transport mode to avoid JSON-RPC interference
- **Modular tool registration**: Supports custom tools, parameter validation powered by Zod
- **Email service integration**: Supports QQ Mail, Gmail (OAuth 2.0), automatic Gmail token refresh
- **Comprehensive test cases**: Covers all transport protocols and email features
- **High extensibility**: Easy to add new transports, tools, and third-party integrations

---

## 🏗️ Architecture Overview

- **Core business logic (`src/core/`)**
  - `server.ts`: MCP server creation and configuration
  - `tools/`: All tool registrations and implementations (e.g., email login, query, send, etc.)
  - `types.ts`: Core type definitions
- **Transport layer (`src/transports/`)**
  - `base.transport.ts`: Abstract base class for transports
  - `stdio/http-sse/streamable-http/backward-compatible.transport.ts`: Implementations for each protocol
- **Utilities (`src/utils/`)**
  - `logger.ts`: Intelligent logging system
  - `config.ts`: Configuration and environment variable management
  - `email-service.ts`: Email sending/receiving and OAuth support
  - `storage.ts`: Local account and token storage
  - `login-server.ts`: Web login service
- **Examples & Tests (`src/examples/`)**
  - `client.ts`: Multi-protocol client example
  - `logger-demo.ts`: Logging system demo

See [ARCHITECTURE.md](./ARCHITECTURE.md) for detailed architecture.

---

## 🚀 Quick Start

### Usage
1. Using `npx`  
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

2. `clone` code
```bash
git clone git@github.com:hst-Sunday/mailmcp.git
cd mailmcp
npm install
npm run build
```

`claude desktop usage` 

Reference [claude_desktop_config_sample.json](./claude_desktop_config_sample.json)  

⚠️Note: `Google oauth` uses the [https://mailauth.mailmcp.de](https://mailauth.mailmcp.de) authorization service, which is open source at [https://github.com/hst-Sunday/mail-auth.git](https://github.com/hst-Sunday/mail-auth.git).

## 💻 Local Development

### 1. Install dependencies

```bash
npm install
```

### 2. Start the server

```bash
# Stdio mode
npm run start:stdio

# HTTP+SSE mode (port 3000)
npm run start:http-sse

# Streamable HTTP mode (port 3001)
npm run start:streamable-http

# Backward compatible mode (port 3002)
npm run start:backward-compatible
```

### 3. Test email features

```bash
# Test Gmail OAuth IMAP connection
npm run test:gmail-oauth

# Test basic ImapFlow functionality
npm run test:imapflow

# Test fetching email content by UID
npm run test:uid-fetch
```

See [test documentation](./test/README.md) for more usage.

## 📧 Email Service & OAuth Configuration

- Supports QQ Mail (IMAP/SMTP, recommended to use authorization code)
- Supports Gmail (OAuth 2.0, automatic token refresh)

**Gmail OAuth Notice:**
Currently, Gmail OAuth functionality requires the [https://mailauth.mailmcp.de](https://mailauth.mailmcp.de) authorization service (not yet open source, will be released in the future).
1. Use [https://mailauth.mailmcp.de](https://mailauth.mailmcp.de) to authorize Gmail access and obtain credentials.
2. Supports automatic access_token refresh, no manual intervention needed.

See [EMAIL_TOOLS_GUIDE.md](./doc/EMAIL_TOOLS_GUIDE.md) for detailed usage and parameters.

---

## 🛠️ Tool System & Extension

- All tools are located in `src/core/tools/` and are auto-registered
- To add a new tool, implement the Tool interface and register it
- Parameter validation is unified with Zod
- Email-related tools:
  - `email-login`: Email login and OAuth management
  - `email-query`: Email query
  - `email-send`: Email sending
  - `email-detail`: Fetch email details

---

## 📝 Intelligent Logging System

- Log levels: DEBUG, INFO, WARN, ERROR
- Automatic stream selection: All output to stderr in Stdio mode; in other modes, info/debug go to stdout, warn/error to stderr
- Recommended usage:
  ```typescript
  import { Logger, LogLevel } from './src/index.js';
  Logger.setTransport('stdio');
  Logger.setLogLevel(LogLevel.INFO);
  Logger.info('Server started');
  ```

---

## 🧩 Extensibility & Best Practices

- **Add new transport protocol**: Extend `base.transport.ts` and register
- **Custom tools**: Implement the Tool interface and register with ToolRegistry
- **Configuration priority**: CLI arguments > environment variables > default values
- **Type safety**: Full project TypeScript + Zod validation
- **ESLint**: All commits must be lint-error free

---

## 🛡️ FAQ

- **JSON interference in Stdio mode**: Always use Logger instead of console.log
- **Port conflicts**: Specify port via `PORT=xxxx` environment variable
- **Gmail OAuth failure**: Check environment variables and credentials, see [OAUTH_SETUP.md](./doc/OAUTH_SETUP.md)

---

## 🧑‍💻 Tech Stack

- TypeScript
- Node.js
- @modelcontextprotocol/sdk
- Express.js
- Zod
- ImapFlow / Nodemailer

---

## 📂 Project Structure

```
src/
├── core/                    # Business logic & tools
├── transports/              # Transport layer implementations
├── utils/                   # Utilities & services
├── examples/                # Examples & tests
├── index.ts                 # App entry point
└── app.ts                   # CLI main logic
```

---

## 📝 License

ISC

---

For detailed development, extension, or integration instructions, please refer to [ARCHITECTURE.md](./ARCHITECTURE.md) and related documents. Issues and PRs are welcome!

---

If you need further customization or details, please specify your requirements. 