/**
 * 邮件查询工具
 * 用于查询QQ邮箱中的邮件
 */

import { z } from 'zod';
import { Tool } from '../types.js';
import { EmailService } from '../../utils/email-service.js';
import { EmailStorage } from '../../utils/storage.js';
import { Logger } from '../../utils/logger.js';

export class EmailQueryTool implements Tool {
  name = 'email-query';
  title = 'Email Query';
  description = 'Query emails from QQ mailbox. Support email address or display name lookup.';

  inputSchema = {
    account: z.string().optional().describe('Email address or display name. If not provided, use default account.'),
    provider: z.string().optional().describe('Email provider (default: QQ)'),
    count: z.number().optional().default(5).describe('Number of emails to retrieve (default: 5)')
  };

  async handler(
    { account, provider: _provider = 'QQ', count = 5 }: { account?: string; provider?: string; count?: number }
  ): Promise<{
    content: Array<{
      type: 'text';
      text: string;
    }>;
  } | {
    content: Array<{
      type: 'text';
      text: string;
    }>;
    emails?: Array<{
      subject: string;
      from: string;
      date: string;
      snippet: string;
    }>;
  }> {
    try {
      Logger.info(`provider: ${_provider}`);
      Logger.info(`Querying emails for account: ${account || 'default'}, count: ${count}`);

      let emailService: EmailService;

      if (account) {
        // 首先验证账户是否存在
        const accountExists = await EmailStorage.validateAccount(account);
        if (!accountExists) {
          return {
            content: [
              {
                type: 'text',
                text: `Account "${account}" not found or not active. Please login first using the email login page.`
              }
            ]
          };
        }

        // Check token expiry for OAuth accounts
        const tokenStatus = await EmailStorage.checkTokenExpiry(account);
        if (tokenStatus.isExpired) {
          return {
            content: [
              {
                type: 'text',
                text: `OAuth token for account "${account}" has expired. Please re-authenticate using the email login tool.`
              }
            ]
          };
        } else if (tokenStatus.needsRefresh) {
          Logger.warn(`OAuth token for account "${account}" expires in ${Math.round(tokenStatus.expiresIn / 60000)} minutes`);
        }

        emailService = await EmailService.createFromAccount(account);
      } else {
        // 使用默认账户
        try {
          emailService = await EmailService.createDefault();
          
          // Check default account token if it's OAuth
          const defaultAccount = await EmailStorage.getDefaultAccount();
          if (defaultAccount) {
            const tokenStatus = await EmailStorage.checkTokenExpiry(defaultAccount.email);
            if (tokenStatus.isExpired) {
              return {
                content: [
                  {
                    type: 'text',
                    text: `OAuth token for default account "${defaultAccount.email}" has expired. Please re-authenticate using the email login tool.`
                  }
                ]
              };
            }
          }
        } catch (error) {
          Logger.error('Error creating default email service', error);
          return {
            content: [
              {
                type: 'text',
                text: 'No default account configured. Please provide an account parameter or login first.'
              }
            ]
          };
        }
      }

      // 获取邮件列表
      const emails = await emailService.getEmails(count);

      if (emails.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: 'No emails found in the mailbox.'
            }
          ]
        };
      }

      // 格式化邮件信息
      const formattedEmails = emails.map((email, index) => {
        const formattedDate = email.date.toLocaleString();
        // const truncatedBody = email.body.length > 200
        //   ? email.body.substring(0, 200) + '...'
        //   : email.body;

        return `${index + 1}. UID: ${email.uid}
   From: ${email.from}
   To: ${email.to}
   Subject: ${email.subject}
   Date: ${formattedDate}
   Size: ${email.size} bytes
   ---`;
      });

      return {
        content: [
          {
            type: 'text',
            text: `Found ${emails.length} emails:\n\n${formattedEmails.join('\n')}`
          }
        ]
      };

    } catch (error) {
      Logger.error('Error querying emails', error);

      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';

      // 提供更详细的错误信息和解决方案
      if (errorMessage.includes('Invalid credentials') || errorMessage.includes('authentication')) {
        return {
          content: [
            {
              type: 'text',
              text: `Authentication failed: ${errorMessage}\n\nPossible solutions:\n1. For QQ Mail: Check your email and authorization code\n2. For Gmail: Re-authenticate using OAuth\n3. Use email-login tool to check account status`
            }
          ]
        };
      }

      if (errorMessage.includes('OAuth token')) {
        return {
          content: [
            {
              type: 'text',
              text: `OAuth authentication issue: ${errorMessage}\n\nPlease use the email-login tool with action 'gmail-oauth' to re-authenticate your Gmail account.`
            }
          ]
        };
      }

      if (errorMessage.includes('connection') || errorMessage.includes('timeout')) {
        return {
          content: [
            {
              type: 'text',
              text: `Connection error: ${errorMessage}\n\nPlease check your internet connection and email server settings.`
            }
          ]
        };
      }

      return {
        content: [
          {
            type: 'text',
            text: `Error querying emails: ${errorMessage}\n\nFor debugging, please check the logs and verify your account configuration.`
          }
        ]
      };
    }
  }
} 