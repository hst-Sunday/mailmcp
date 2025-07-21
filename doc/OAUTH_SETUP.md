# Gmail OAuth 配置指南

## 问题解决

如果您遇到 Gmail 认证失败的错误："OAuth token may be expired. Please re-authenticate."，请按照以下步骤设置 Google OAuth 配置。

## 配置步骤

### 1. 获取 Google OAuth 2.0 凭据

1. 访问 [Google Cloud Console](https://console.cloud.google.com/)
2. 创建一个新项目或选择现有项目
3. 启用 Gmail API：
   - 转到 "API 和服务" > "库"
   - 搜索 "Gmail API" 并启用
4. 创建 OAuth 2.0 凭据：
   - 转到 "API 和服务" > "凭据"
   - 点击 "创建凭据" > "OAuth 2.0 客户端 ID"
   - 选择应用类型为 "桌面应用程序"
   - 下载 JSON 凭据文件

### 2. 设置环境变量

从下载的 JSON 文件中提取 `client_id` 和 `client_secret`，然后设置以下环境变量：

```bash
export GOOGLE_CLIENT_ID="your_client_id_here"
export GOOGLE_CLIENT_SECRET="your_client_secret_here"
export GOOGLE_REDIRECT_URI="urn:ietf:wg:oauth:2.0:oob"
```

### 3. 重新启动服务

设置环境变量后，重新启动 MCP 服务器：

```bash
npm start
```

## 自动 Token 刷新

配置完成后，系统将：

1. **自动检测即将过期的 token**（5分钟内过期）
2. **自动刷新 access token**
3. **更新存储中的 token 信息**
4. **记录刷新操作的日志**

## 故障排除

### 常见错误

1. **"Google OAuth client configuration missing"**
   - 确保已设置 `GOOGLE_CLIENT_ID` 和 `GOOGLE_CLIENT_SECRET` 环境变量

2. **"OAuth token refresh failed: 400"**
   - 检查 client_id 和 client_secret 是否正确
   - 确认 refresh_token 仍然有效

3. **"OAuth token refresh error: invalid_grant"**
   - refresh_token 可能已过期，需要重新授权
   - 使用 `email-login` 工具重新进行 Gmail OAuth 认证

### 检查配置

您可以通过以下方式验证配置：

```bash
# 检查环境变量
echo $GOOGLE_CLIENT_ID
echo $GOOGLE_CLIENT_SECRET

# 检查账户状态
# 使用 email-login 工具中的 "check" 功能
```

## 安全注意事项

1. **保护凭据**：不要在代码中硬编码 client_secret
2. **环境变量**：使用环境变量或安全的配置管理系统
3. **限制范围**：在 Google Cloud Console 中限制 OAuth 凭据的使用范围
4. **定期轮换**：定期更新 OAuth 凭据

## 支持的功能

配置完成后，系统支持：

- ✅ 自动 Gmail OAuth token 刷新
- ✅ IMAP 连接与邮件读取
- ✅ SMTP 邮件发送
- ✅ 账户状态检查
- ✅ 错误处理与重试机制 