/**
 * 邮箱登录管理工具
 * 用于管理邮箱账户的登录流程
 */

import { z } from 'zod';
import { Tool, ToolResponse } from '../types.js';
import { EmailStorage } from '../../utils/storage.js';
import { LoginServer } from '../../utils/login-server.js';
import { Logger } from '../../utils/logger.js';
import { GMAIL_OAUTH_URL } from '../../utils/constants.js';
export class EmailLoginTool implements Tool {
  name = 'email-login';
  title = 'Email Login Manager';
  description = 'Manage email account login process. Start login server for QQ email or initiate Gmail OAuth login.';

  private static loginServer: LoginServer | null = null;
  private static isServerRunning = false;

  inputSchema = {
    action: z.enum(['start', 'stop', 'status', 'check', 'gmail-oauth']).describe('Action to perform: start login server, stop server, check status, check account, or initiate Gmail OAuth'),
    account: z.string().optional().describe('Email address or display name to check (for check action)'),
    port: z.number().optional().default(3000).describe('Port to run login server on (default: 3000)')
  };

  async handler(args: Record<string, unknown>): Promise<ToolResponse> {
    const { action, account, port = 3000 } = args as { action: string; account?: string; port?: number };
    try {
      switch (action) {
        case 'start':
          return await this.startLoginServer(port);

        case 'stop':
          return await this.stopLoginServer();

        case 'status':
          return await this.getServerStatus();

        case 'check':
          return await this.checkAccountStatus(account);

        case 'gmail-oauth':
          return await this.initiateGmailOAuth();

        default:
          return {
            content: [
              {
                type: 'text',
                text: 'Invalid action. Use: start, stop, status, check, or gmail-oauth'
              }
            ]
          };
      }
    } catch (error) {
      Logger.error('Error in email login tool', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';

      return {
        content: [
          {
            type: 'text',
            text: `Error: ${errorMessage}`
          }
        ]
      };
    }
  }

  private async startLoginServer(port: number): Promise<ToolResponse> {
    try {
      if (EmailLoginTool.isServerRunning) {
        return {
          content: [
            {
              type: 'text',
              text: `Login server is already running on port ${port}.\nVisit: http://localhost:${port}/login`
            }
          ]
        };
      }

      EmailLoginTool.loginServer = new LoginServer(port);
      await EmailLoginTool.loginServer.start();
      EmailLoginTool.isServerRunning = true;

      return {
        content: [
          {
            type: 'text',
            text: `Login server started successfully on port ${port}!\n\n` +
              `🌐 QQ Email Login: Login with account and password\n` +
              `🌐 Gmail OAuth Listener: ${GMAIL_OAUTH_URL}\n\n` +
              `Please visit the QQ Email Login URL to login with your QQ email account.\n` +
              `For Gmail, use the 'gmail-oauth' action to get OAuth instructions.\n` +
              `After successful login, you can use the email-query and email-send tools.`
          }
        ]
      };
    } catch (error) {
      Logger.error('Failed to start login server', error);
      throw new Error(`Failed to start login server: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async stopLoginServer(): Promise<ToolResponse> {
    try {
      if (!EmailLoginTool.isServerRunning || !EmailLoginTool.loginServer) {
        return {
          content: [
            {
              type: 'text',
              text: 'Login server is not running.'
            }
          ]
        };
      }

      await EmailLoginTool.loginServer.stop();
      EmailLoginTool.loginServer = null;
      EmailLoginTool.isServerRunning = false;

      return {
        content: [
          {
            type: 'text',
            text: 'Login server stopped successfully.'
          }
        ]
      };
    } catch (error) {
      Logger.error('Failed to stop login server', error);
      throw new Error(`Failed to stop login server: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async getServerStatus(): Promise<ToolResponse> {
    try {
      if (EmailLoginTool.isServerRunning && EmailLoginTool.loginServer) {
        const loginUrl = EmailLoginTool.loginServer.getLoginUrl();
        const accounts = await EmailStorage.getAllAccounts();

        return {
          content: [
            {
              type: 'text',
              text: `Login server status: Running\n` +
                `Login URL: ${loginUrl}\n` +
                `Saved accounts: ${accounts.length}\n\n` +
                `Active accounts:\n` +
                accounts.map(acc => `  - ${acc.email} (${acc.displayName || acc.email})`).join('\n')
            }
          ]
        };
      } else {
        const accounts = await EmailStorage.getAllAccounts();

        return {
          content: [
            {
              type: 'text',
              text: `Login server status: Stopped\n` +
                `Saved accounts: ${accounts.length}\n\n` +
                `To start login server, use: {"action": "start"}\n\n` +
                `Saved accounts:\n` +
                accounts.map(acc => `  - ${acc.email} (${acc.displayName || acc.email})`).join('\n')
            }
          ]
        };
      }
    } catch (error) {
      Logger.error('Failed to get server status', error);
      throw new Error(`Failed to get server status: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async checkAccountStatus(account?: string): Promise<ToolResponse> {
    try {
      if (!account) {
        // 检查默认账户
        const defaultAccount = await EmailStorage.getDefaultAccount();
        if (defaultAccount) {
          return {
            content: [
              {
                type: 'text',
                text: `Default account: ${defaultAccount.email} (${defaultAccount.displayName || defaultAccount.email})\n` +
                  `Provider: ${defaultAccount.provider}\n` +
                  `Status: ${defaultAccount.isActive ? 'Active' : 'Inactive'}\n` +
                  `Last login: ${defaultAccount.lastLogin || 'Never'}`
              }
            ]
          };
        } else {
          return {
            content: [
              {
                type: 'text',
                text: 'No default account configured.\n\n' +
                  `To login, start the login server with: {"action": "start"}\n` +
                  `Then visit the login URL to add an account.`
              }
            ]
          };
        }
      } else {
        // 检查指定账户
        const accountInfo = await EmailStorage.getAccount(account);
        if (accountInfo) {
          return {
            content: [
              {
                type: 'text',
                text: `Account: ${accountInfo.email} (${accountInfo.displayName || accountInfo.email})\n` +
                  `Provider: ${accountInfo.provider}\n` +
                  `Status: ${accountInfo.isActive ? 'Active' : 'Inactive'}\n` +
                  `Last login: ${accountInfo.lastLogin || 'Never'}`
              }
            ]
          };
        } else {
          return {
            content: [
              {
                type: 'text',
                text: `Account "${account}" not found.\n\n` +
                  `To login, start the login server with: {"action": "start"}\n` +
                  `Then visit the login URL to add this account.`
              }
            ]
          };
        }
      }
    } catch (error) {
      Logger.error('Failed to check account status', error);
      throw new Error(`Failed to check account status: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // 静态方法：检查是否需要启动登录服务器
  static async checkLoginRequired(): Promise<boolean> {
    try {
      const accounts = await EmailStorage.getAllAccounts();
      return accounts.length === 0;
    } catch (error) {
      Logger.error('Failed to check login requirement', error);
      return true;
    }
  }

  private async initiateGmailOAuth(): Promise<ToolResponse> {
    try {
      // Ensure the login server is running to handle OAuth callback
      if (!EmailLoginTool.isServerRunning) {
        EmailLoginTool.loginServer = new LoginServer(3000);
        await EmailLoginTool.loginServer.start();
        EmailLoginTool.isServerRunning = true;
      }

      return {
        content: [
          {
            type: 'text',
            text: `Gmail OAuth Login Instructions:\n\n` +
              `1. The OAuth callback listener is ready at: ${GMAIL_OAUTH_URL}\n\n` +
              `2. To connect your Gmail account, you need to:\n` +
              `   - Initiate OAuth flow from your application\n` +
              `   - Authorize access to your Gmail account\n` +
              `   - The authorization will redirect to the callback URL with tokens\n\n` +
              `3. The callback expects these parameters:\n` +
              `   - email: Your Gmail address\n` +
              `   - access_token: OAuth access token\n` +
              `   - refresh_token: OAuth refresh token (optional)\n` +
              `   - expires_in: Token expiry in seconds (optional)\n\n` +
              `Once the OAuth flow completes, your Gmail account will be saved and ready to use.`
          }
        ]
      };
    } catch (error) {
      Logger.error('Failed to initiate Gmail OAuth', error);
      throw new Error(`Failed to initiate Gmail OAuth: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // 静态方法：获取登录引导消息
  static getLoginGuideMessage(): string {
    return `No email accounts found. Please login first.\n\n` +
      `Steps to login:\n` +
      `1. Start login server: {"action": "start"}\n` +
      `2. For QQ Email: Visit the login URL provided\n` +
      `3. For Gmail: Use {"action": "gmail-oauth"} and follow OAuth instructions\n` +
      `4. Enter your credentials\n` +
      `5. Use email-query and email-send tools`;
  }
} 