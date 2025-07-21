# QQ邮箱工具使用指南

## 概述

这个MCP服务器现在支持QQ邮箱的IMAP协议连接，提供了查询邮件和发送邮件的功能。包含以下三个工具：

1. **email-login** - 邮箱登录管理工具
2. **email-query** - 邮件查询工具  
3. **email-send** - 邮件发送工具

## 使用流程

### 1. 启动登录服务器

首先需要启动登录服务器，让用户可以通过Web界面登录：

```json
{
  "action": "start",
  "port": 3000
}
```

工具：`email-login`

### 2. 用户登录

访问 `http://localhost:3000/login` 页面，输入：
- QQ邮箱地址
- 邮箱密码（建议使用授权码）
- 显示名称（可选）

登录成功后，账户信息会保存到 `storage.json` 文件中。

### 3. 查询邮件

查询邮件使用 `email-query` 工具：

```json
{
  "account": "your-email@qq.com",
  "count": 5
}
```

参数说明：
- `account` (可选): 邮箱地址或显示名称，不提供则使用默认账户
- `provider` (可选): 邮件提供商，默认为 "QQ"
- `count` (可选): 邮件数量，默认为 5

### 4. 发送邮件

发送邮件使用 `email-send` 工具：

```json
{
  "from": "your-email@qq.com",
  "to": "recipient@example.com",
  "subject": "测试邮件",
  "text": "这是一封测试邮件",
  "html": "<h1>这是HTML邮件</h1>"
}
```

参数说明：
- `from` (可选): 发送者邮箱地址或显示名称，不提供则使用默认账户
- `to` (必需): 收件人邮箱地址
- `subject` (必需): 邮件主题
- `text` (可选): 纯文本邮件内容
- `html` (可选): HTML邮件内容
- `provider` (可选): 邮件提供商，默认为 "QQ"

注意：`text` 和 `html` 至少需要提供一个。

## 管理功能

### 检查登录状态

检查服务器状态和已保存的账户：

```json
{
  "action": "status"
}
```

工具：`email-login`

### 检查特定账户

检查特定账户的状态：

```json
{
  "action": "check",
  "account": "your-email@qq.com"
}
```

工具：`email-login`

### 停止登录服务器

```json
{
  "action": "stop"
}
```

工具：`email-login`

## 存储格式

账户信息保存在项目根目录的 `storage.json` 文件中，格式如下：

```json
{
  "accounts": [
    {
      "email": "your-email@qq.com",
      "displayName": "我的QQ邮箱",
      "provider": "QQ",
      "username": "your-email@qq.com",
      "password": "your-password-or-auth-code",
      "imapHost": "imap.qq.com",
      "imapPort": 993,
      "smtpHost": "smtp.qq.com",
      "smtpPort": 465,
      "secure": true,
      "lastLogin": "2024-01-01T00:00:00.000Z",
      "isActive": true
    }
  ],
  "defaultAccount": "your-email@qq.com",
  "lastUpdated": "2024-01-01T00:00:00.000Z"
}
```

## 安全说明

1. **使用授权码**: 建议使用QQ邮箱的授权码而不是登录密码
2. **本地存储**: 密码存储在本地 `storage.json` 文件中，请妥善保管
3. **HTTPS**: 生产环境建议使用HTTPS

## 错误处理

### 常见错误

1. **认证失败**: 检查邮箱地址和密码/授权码
2. **连接失败**: 检查网络连接和QQ邮箱IMAP/SMTP设置
3. **账户未找到**: 需要先通过登录页面添加账户

### 获取QQ邮箱授权码

1. 登录QQ邮箱网页版
2. 进入"设置" -> "账户"
3. 开启"POP3/IMAP/SMTP/Exchange/CardDAV/CalDAV服务"
4. 获取授权码用于第三方客户端登录

## 示例使用场景

### 完整工作流程

1. 启动登录服务器
2. 用户访问登录页面并输入凭据
3. 查询最新5封邮件
4. 回复或发送新邮件

### 批量操作

可以配置多个QQ邮箱账户，通过不同的 `account` 参数进行切换使用。

## 技术架构

- **存储层**: `EmailStorage` 类管理 `storage.json` 文件
- **服务层**: `EmailService` 类处理IMAP/SMTP连接
- **Web层**: `LoginServer` 类提供登录界面
- **工具层**: 三个MCP工具提供用户接口

## 扩展性

系统设计支持：
- 多邮件提供商（当前支持QQ邮箱）
- 多账户管理
- 自定义邮件模板
- 附件支持（预留接口）

## 故障排除

1. **编译错误**: 运行 `npm run build` 检查TypeScript错误
2. **依赖问题**: 运行 `npm install` 重新安装依赖
3. **端口冲突**: 修改登录服务器端口参数
4. **权限问题**: 检查 `storage.json` 文件读写权限 