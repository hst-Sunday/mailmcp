/**
 * 登录页面服务
 * 提供Web界面让用户输入邮箱账号和密码
 */

import express, { Request, Response } from 'express';
import cors from 'cors';
import { EmailStorage } from './storage.js';
import { EmailService } from './email-service.js';
import { Logger } from './logger.js';
import { GMAIL_OAUTH_URL } from './constants.js';
import { Server } from 'http';

export class LoginServer {
  private app: express.Application;
  private server: Server | undefined;
  private port: number;

  constructor(port: number = 3000) {
    this.app = express();
    this.port = port;
    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware(): void {
    // 配置 CORS
    this.app.use(cors({
      origin: '*', // 允许所有来源，生产环境中应该设置具体的域名
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
      credentials: true
    }));
    
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));
    this.app.use(express.static('public'));
  }

  private setupRoutes(): void {
    // 登录页面
    this.app.get('/login', (_req: Request, res: Response) => {
      res.send(this.getLoginPageHTML());
    });

    // Gmail OAuth callback endpoint
    this.app.get('/api/auth/gmail-oauth', async (req: Request, res: Response) => {
      try {
        // This endpoint should receive OAuth data from the external OAuth provider
        const { email, access_token, refresh_token, expires_in } = req.query;

        if (!email || !access_token) {
          res.status(400).json({
            success: false,
            message: 'Missing required OAuth parameters'
          });
          return;
        }

        // Calculate token expiry
        const tokenExpiry = new Date();
        tokenExpiry.setSeconds(tokenExpiry.getSeconds() + Number(expires_in || 3600));

        // Save Gmail account with OAuth tokens
        const config = EmailStorage.getGmailConfig();
        await EmailStorage.addOAuthAccount({
          email: String(email),
          displayName: String(email),
          provider: 'Gmail',
          username: String(email),
          accessToken: String(access_token),
          refreshToken: String(refresh_token),
          tokenExpiry: tokenExpiry.toISOString(),
          ...config
        });

        Logger.info(`Gmail OAuth account saved successfully: ${email}`);

        // Return success response or redirect to success page
        res.send(`
          <!DOCTYPE html>
          <html>
          <head>
            <title>Gmail Login Success</title>
            <style>
              body {
                font-family: Arial, sans-serif;
                display: flex;
                justify-content: center;
                align-items: center;
                height: 100vh;
                margin: 0;
                background: #f5f5f5;
              }
              .success-container {
                background: white;
                padding: 40px;
                border-radius: 10px;
                box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                text-align: center;
              }
              .success-icon {
                color: #4CAF50;
                font-size: 48px;
                margin-bottom: 20px;
              }
              h1 {
                color: #333;
                margin-bottom: 10px;
              }
              p {
                color: #666;
                margin-bottom: 20px;
              }
              .close-btn {
                background: #4CAF50;
                color: white;
                border: none;
                padding: 10px 20px;
                border-radius: 5px;
                cursor: pointer;
                font-size: 16px;
              }
              .close-btn:hover {
                background: #45a049;
              }
            </style>
          </head>
          <body>
            <div class="success-container">
              <div class="success-icon">✓</div>
              <h1>Gmail Login Successful!</h1>
              <p>Your Gmail account has been successfully connected.</p>
              <p>Email: ${email}</p>
              <button class="close-btn" onclick="window.close()">Close Window</button>
            </div>
          </body>
          </html>
        `);

      } catch (error) {
        Logger.error('Gmail OAuth error', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        
        res.status(500).json({
          success: false,
          message: `Gmail OAuth failed: ${errorMessage}`
        });
      }
    });

    // 处理登录表单提交
    this.app.post('/login', async (req: Request, res: Response) => {
      try {
        const { email, password, displayName } = req.body;

        if (!email || !password) {
          return res.status(400).json({
            success: false,
            message: 'Email and password are required'
          });
        }

        // 验证邮箱格式
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
          return res.status(400).json({
            success: false,
            message: 'Invalid email format'
          });
        }

        // 测试QQ邮箱连接
        Logger.info(`Testing connection for email: ${email}`);
        const isValid = await EmailService.testQQConnection(email, password);

        if (!isValid) {
          return res.status(401).json({
            success: false,
            message: 'Invalid credentials or connection failed. Please check your email and password.'
          });
        }

        // 保存账户信息
        const config = EmailStorage.getQQEmailConfig();
        await EmailStorage.addAccount({
          email,
          displayName: displayName || email,
          provider: 'QQ',
          username: email,
          password,
          ...config
        });

        Logger.info(`Account saved successfully: ${email}`);

        return res.json({
          success: true,
          message: 'Login successful! Account saved.',
          account: {
            email,
            displayName: displayName || email,
            provider: 'QQ'
          }
        });

      } catch (error) {
        Logger.error('Login error', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        
        return res.status(500).json({
          success: false,
          message: `Login failed: ${errorMessage}`
        });
      }
    });

    // 获取已保存的账户列表
    this.app.get('/accounts', async (_req: Request, res: Response) => {
      try {
        const accounts = await EmailStorage.getAllAccounts();
        res.json({
          success: true,
          accounts: accounts.map(acc => ({
            email: acc.email,
            displayName: acc.displayName,
            provider: acc.provider,
            lastLogin: acc.lastLogin,
            isActive: acc.isActive
          }))
        });
      } catch (error) {
        Logger.error('Error fetching accounts', error);
        res.status(500).json({
          success: false,
          message: 'Failed to fetch accounts'
        });
      }
    });

    // 删除账户
    this.app.delete('/accounts/:email', async (req: Request, res: Response) => {
      try {
        const { email } = req.params;
        await EmailStorage.removeAccount(email);
        res.json({
          success: true,
          message: 'Account removed successfully'
        });
      } catch (error) {
        Logger.error('Error removing account', error);
        res.status(500).json({
          success: false,
          message: 'Failed to remove account'
        });
      }
    });

    // Gmail OAuth数据保存接口
    this.app.post('/api/gmail-authed', async (req: Request, res: Response) => {
      try {
        const { user, gmail, tokens, loginTime } = req.body;

        // 验证必需字段
        if (!user || !gmail || !tokens) {
          return res.status(400).json({
            success: false,
            message: 'Missing required fields: user, gmail, or tokens'
          });
        }

        if (!tokens.access_token || !tokens.token_type) {
          return res.status(400).json({
            success: false,
            message: 'Missing required token fields: access_token or token_type'
          });
        }

        // 提取邮箱地址和显示名称
        const email = user?.email || gmail?.email || gmail?.emailAddress;
        const displayName = user?.name || user?.displayName || email;

        if (!email) {
          return res.status(400).json({
            success: false,
            message: 'Email address not found in user or gmail data'
          });
        }

        // 获取Gmail配置
        const gmailConfig = EmailStorage.getGmailConfig();

        // 构建OAuth账户数据，直接保存到accounts数组
        const oauthAccount = {
          email,
          displayName,
          provider: 'Gmail',
          username: email,
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token || undefined,
          tokenExpiry: tokens.expiry_date 
            ? new Date(tokens.expiry_date).toISOString() 
            : new Date(Date.now() + 3600 * 1000).toISOString(),
          ...gmailConfig
        };

        // 直接保存到accounts数组
        await EmailStorage.addOAuthAccount(oauthAccount);

        Logger.info(`Gmail OAuth account saved to accounts: ${email}`);

        return res.json({
          success: true,
          message: 'Gmail authentication data saved successfully to accounts',
          data: {
            email,
            displayName,
            provider: 'Gmail',
            loginTime: loginTime || new Date().toISOString()
          }
        });

      } catch (error) {
        Logger.error('Error saving Gmail auth data', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        
        return res.status(500).json({
          success: false,
          message: `Failed to save Gmail auth data: ${errorMessage}`
        });
      }
    });

    // OAuth token refresh endpoint
    this.app.post('/api/auth/refresh-token', async (req: Request, res: Response) => {
      try {
        const { email, refresh_token } = req.body;

        if (!email || !refresh_token) {
          return res.status(400).json({
            success: false,
            message: 'Missing required fields: email or refresh_token'
          });
        }

        // Get account from storage
        const account = await EmailStorage.getAccount(email);
        if (!account || account.provider !== 'Gmail') {
          return res.status(404).json({
            success: false,
            message: 'Gmail account not found'
          });
        }

        // Verify refresh token matches
        if (account.refreshToken !== refresh_token) {
          return res.status(401).json({
            success: false,
            message: 'Invalid refresh token'
          });
        }

        // Check if token needs refresh
        const tokenCheck = await EmailStorage.checkTokenExpiry(email);
        if (!tokenCheck.needsRefresh && !tokenCheck.isExpired) {
          // Token is still valid, return current token
          return res.json({
            success: true,
            access_token: account.accessToken,
            refresh_token: account.refreshToken,
            expires_at: account.tokenExpiry,
            message: 'Token is still valid'
          });
        }

        // Try to refresh the token using Google OAuth
        const { Config } = await import('./config.js');
        const oauthConfig = Config.getGoogleOAuthConfig();
        
        if (!oauthConfig.clientId || !oauthConfig.clientSecret) {
          return res.status(500).json({
            success: false,
            message: 'Google OAuth configuration missing'
          });
        }

        const response = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          body: new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: refresh_token,
            client_id: oauthConfig.clientId,
            client_secret: oauthConfig.clientSecret
          })
        });

        if (!response.ok) {
          const errorText = await response.text();
          Logger.error(`OAuth token refresh failed: ${response.status} - ${errorText}`);
          return res.status(response.status).json({
            success: false,
            message: `OAuth token refresh failed: ${response.status}`
          });
        }

        const data = await response.json();

        if (data.error) {
          Logger.error(`OAuth token refresh error: ${data.error} - ${data.error_description || ''}`);
          return res.status(400).json({
            success: false,
            message: `OAuth token refresh error: ${data.error}`
          });
        }

        // Update the account with new tokens
        const expiryTime = new Date();
        expiryTime.setSeconds(expiryTime.getSeconds() + (data.expires_in || 3600));

        account.accessToken = data.access_token;
        account.tokenExpiry = expiryTime.toISOString();
        account.lastLogin = new Date().toISOString();

        // Update refresh token if provided (sometimes Google provides a new one)
        if (data.refresh_token) {
          account.refreshToken = data.refresh_token;
        }

        // Save updated account to storage
        await EmailStorage.updateAccount(account);

        Logger.info(`OAuth token refreshed successfully for ${email}`);

        return res.json({
          success: true,
          access_token: account.accessToken,
          refresh_token: account.refreshToken,
          expires_at: account.tokenExpiry,
          expires_in: data.expires_in || 3600,
          message: 'Token refreshed successfully'
        });

      } catch (error) {
        Logger.error('Token refresh error', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        
        return res.status(500).json({
          success: false,
          message: `Token refresh failed: ${errorMessage}`
        });
      }
    });

    // 健康检查
    this.app.get('/health', (_req: Request, res: Response) => {
      res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        service: 'email-login-server'
      });
    });
  }

  private getLoginPageHTML(): string {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>QQ邮箱登录</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
        }

        .container {
            background: white;
            border-radius: 10px;
            box-shadow: 0 15px 35px rgba(0,0,0,0.1);
            overflow: hidden;
            width: 100%;
            max-width: 500px;
        }

        .header {
            background: #1976d2;
            color: white;
            padding: 20px;
            text-align: center;
        }

        .header h1 {
            font-size: 24px;
            margin-bottom: 5px;
        }

        .header p {
            opacity: 0.9;
            font-size: 14px;
        }

        .form-container {
            padding: 30px;
        }

        .form-group {
            margin-bottom: 20px;
        }

        label {
            display: block;
            margin-bottom: 5px;
            font-weight: 600;
            color: #333;
        }

        input[type="email"],
        input[type="password"],
        input[type="text"] {
            width: 100%;
            padding: 12px;
            border: 2px solid #e0e0e0;
            border-radius: 6px;
            font-size: 16px;
            transition: border-color 0.3s;
        }

        input[type="email"]:focus,
        input[type="password"]:focus,
        input[type="text"]:focus {
            outline: none;
            border-color: #1976d2;
        }

        .submit-btn {
            width: 100%;
            background: #1976d2;
            color: white;
            padding: 12px;
            border: none;
            border-radius: 6px;
            font-size: 16px;
            font-weight: 600;
            cursor: pointer;
            transition: background-color 0.3s;
        }

        .submit-btn:hover {
            background: #1565c0;
        }

        .submit-btn:disabled {
            background: #ccc;
            cursor: not-allowed;
        }

        .gmail-btn {
            width: 100%;
            background: #ea4335;
            color: white;
            padding: 12px;
            border: none;
            border-radius: 6px;
            font-size: 16px;
            font-weight: 600;
            cursor: pointer;
            transition: background-color 0.3s;
            margin-top: 15px;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 10px;
        }

        .gmail-btn:hover {
            background: #d33b2c;
        }

        .gmail-btn svg {
            width: 20px;
            height: 20px;
        }

        .divider {
            text-align: center;
            margin: 20px 0;
            position: relative;
        }

        .divider::before {
            content: '';
            position: absolute;
            top: 50%;
            left: 0;
            right: 0;
            height: 1px;
            background: #e0e0e0;
        }

        .divider span {
            background: white;
            padding: 0 10px;
            position: relative;
            color: #666;
            font-size: 14px;
        }

        .message {
            padding: 10px;
            margin-bottom: 20px;
            border-radius: 4px;
            font-size: 14px;
        }

        .message.success {
            background: #d4edda;
            color: #155724;
            border: 1px solid #c3e6cb;
        }

        .message.error {
            background: #f8d7da;
            color: #721c24;
            border: 1px solid #f5c6cb;
        }

        .message code {
            background: rgba(0,0,0,0.1);
            padding: 2px 5px;
            border-radius: 3px;
            font-family: monospace;
            font-size: 13px;
        }

        .accounts-section {
            margin-top: 30px;
            padding-top: 30px;
            border-top: 1px solid #e0e0e0;
        }

        .account-item {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 10px;
            background: #f8f9fa;
            border-radius: 6px;
            margin-bottom: 10px;
        }

        .account-info {
            flex: 1;
        }

        .account-email {
            font-weight: 600;
            color: #333;
        }

        .account-display {
            font-size: 12px;
            color: #666;
        }

        .delete-btn {
            background: #dc3545;
            color: white;
            border: none;
            padding: 5px 10px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 12px;
        }

        .delete-btn:hover {
            background: #c82333;
        }

        .loading {
            display: inline-block;
            width: 20px;
            height: 20px;
            border: 2px solid #f3f3f3;
            border-top: 2px solid #1976d2;
            border-radius: 50%;
            animation: spin 1s linear infinite;
        }

        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>邮箱登录</h1>
            <p>支持QQ邮箱和Gmail登录</p>
        </div>
        
        <div class="form-container">
            <div id="message"></div>
            
            <button type="button" class="gmail-btn" id="gmailBtn">
                <svg viewBox="0 0 24 24" fill="currentColor">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                使用 Gmail 授权登录
            </button>

            <div class="divider">
                <span>或使用QQ邮箱登录</span>
            </div>

            <form id="loginForm">
                <div class="form-group">
                    <label for="email">QQ邮箱地址</label>
                    <input type="email" id="email" name="email" required 
                           placeholder="请输入QQ邮箱地址">
                </div>
                
                <div class="form-group">
                    <label for="password">密码</label>
                    <input type="password" id="password" name="password" required 
                           placeholder="请输入邮箱密码或授权码">
                </div>
                
                <div class="form-group">
                    <label for="displayName">显示名称（可选）</label>
                    <input type="text" id="displayName" name="displayName" 
                           placeholder="为此账户设置一个显示名称">
                </div>
                
                <button type="submit" class="submit-btn" id="submitBtn">
                    QQ邮箱登录
                </button>
            </form>
            
            <div class="accounts-section">
                <h3>已保存的账户</h3>
                <div id="accountsList"></div>
            </div>
        </div>
    </div>

    <script>
        document.addEventListener('DOMContentLoaded', function() {
            const loginForm = document.getElementById('loginForm');
            const messageDiv = document.getElementById('message');
            const submitBtn = document.getElementById('submitBtn');
            const accountsList = document.getElementById('accountsList');
            const gmailBtn = document.getElementById('gmailBtn');

            // 加载已保存的账户
            loadAccounts();

            // Gmail OAuth 登录处理
            gmailBtn.addEventListener('click', async function() {
                // showMessage('正在启动Gmail授权登录...', 'success');
                
                // 这里应该调用外部OAuth提供方的接口
                // 由于我们没有实际的OAuth提供方，这里只是展示流程
                const oauthCallbackUrl = '${GMAIL_OAUTH_URL}';
                // window.location.href = oauthCallbackUrl;
                // showMessage(
                //     '请通过您的应用启动Gmail OAuth流程。<br>' +
                //     '授权完成后会重定向到：<br>' +
                //     '<code>' + oauthCallbackUrl + '</code><br>' +
                //     '需要包含参数：email, access_token, refresh_token (可选), expires_in (可选)',
                //     'success'
                // );
                
                // 在实际应用中，这里应该重定向到OAuth提供方
                // window.location.replace(decodeURIComponent(oauthCallbackUrl));
                const response = await fetch(oauthCallbackUrl);
                const result = await response.json();
                console.log('result:', result);
                window.location.href = result.authUrl;
            });

            loginForm.addEventListener('submit', async function(e) {
                e.preventDefault();
                
                const formData = new FormData(loginForm);
                const data = Object.fromEntries(formData);
                
                // 显示加载状态
                submitBtn.disabled = true;
                submitBtn.innerHTML = '<span class="loading"></span> 验证中...';
                
                try {
                    const response = await fetch('/login', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify(data)
                    });
                    
                    const result = await response.json();
                    
                    if (result.success) {
                        showMessage('登录成功！账户已保存。', 'success');
                        loginForm.reset();
                        loadAccounts(); // 重新加载账户列表
                    } else {
                        showMessage(result.message, 'error');
                    }
                } catch (error) {
                    showMessage('网络错误，请重试。', 'error');
                } finally {
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = '登录并保存';
                }
            });

            function showMessage(text, type) {
                messageDiv.innerHTML = '<div class="message ' + type + '">' + text + '</div>';
                if (type !== 'success' || !text.includes('OAuth')) {
                    setTimeout(() => {
                        messageDiv.innerHTML = '';
                    }, 5000);
                }
            }

            async function loadAccounts() {
                try {
                    const response = await fetch('/accounts');
                    const result = await response.json();
                    
                    if (result.success) {
                        displayAccounts(result.accounts);
                    }
                } catch (error) {
                    console.error('Failed to load accounts:', error);
                }
            }

            function displayAccounts(accounts) {
                if (accounts.length === 0) {
                    accountsList.innerHTML = '<p style="color: #666; text-align: center;">暂无保存的账户</p>';
                    return;
                }

                accountsList.innerHTML = accounts.map(account => 
                    '<div class="account-item">' +
                        '<div class="account-info">' +
                            '<div class="account-email">' + account.email + '</div>' +
                            '<div class="account-display">' + (account.displayName || account.email) + '</div>' +
                        '</div>' +
                        '<button class="delete-btn" onclick="deleteAccount(\\'' + account.email + '\\')">删除</button>' +
                    '</div>'
                ).join('');
            }

            window.deleteAccount = async function(email) {
                if (!confirm('确定要删除此账户吗？')) {
                    return;
                }

                try {
                    const response = await fetch('/accounts/' + encodeURIComponent(email), {
                        method: 'DELETE'
                    });
                    
                    const result = await response.json();
                    
                    if (result.success) {
                        showMessage('账户删除成功！', 'success');
                        loadAccounts();
                    } else {
                        showMessage(result.message, 'error');
                    }
                } catch (error) {
                    showMessage('删除失败，请重试。', 'error');
                }
            };
        });
    </script>
</body>
</html>`;
  }

  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.server = this.app.listen(this.port, '0.0.0.0', () => {
          Logger.info(`Login server started on port ${this.port}`);
          Logger.info(`Visit http://localhost:${this.port}/login to login`);
          resolve();
        });
        
        this.server.on('error', (error: unknown) => {
          Logger.error(`Failed to start login server on port ${this.port}:`, error);
          reject(error);
        });
      } catch (error) {
        Logger.error(`Error creating login server:`, error);
        reject(error);
      }
    });
  }

  async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          Logger.info('Login server stopped');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  getLoginUrl(): string {
    return `http://localhost:${this.port}/login`;
  }
}