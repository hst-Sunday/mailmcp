/**
 * 邮件详情查询工具
 * 用于查询QQ邮箱中特定邮件的详细信息
 */

import { z } from 'zod';
import { Tool, ToolResponse } from '../types.js';
import { EmailService } from '../../utils/email-service.js';
import { EmailStorage } from '../../utils/storage.js';
import { Logger } from '../../utils/logger.js';

export class EmailDetailTool implements Tool {
  name = 'email-detail';
  title = 'Email Detail';
  description = 'Query detailed information for a specific email by UID (unique identifier). Returns full email content including headers, body, and attachments.';

  inputSchema = {
    account: z.string().optional().describe('Email address or display name. If not provided, use default account.'),
    provider: z.string().optional().describe('Email provider (default: QQ)'),
    uid: z.number().describe('Email UID (unique identifier) from email-query'),
    includeAttachments: z.boolean().optional().default(false).describe('Whether to include attachment data (default: false)'),
  };

  async handler(args: Record<string, unknown>): Promise<ToolResponse> {
    const { account, uid, includeAttachments = false } = args as {
      account?: string;
      provider?: string;
      uid: number;
      includeAttachments?: boolean;
    };
    try {
      Logger.info(`Querying email detail for account: ${account || 'default'}, uid: ${uid}`);

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
        } catch {
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
      const useSimpleParser = true;
      // 获取邮件详情
      if (useSimpleParser) {
        // 使用简化的文字内容获取方法
        Logger.info(`开始获取邮件文本内容, UID: ${uid}`);
        const textContent = await emailService.getEmailTextContent(uid);
        Logger.info(`成功获取邮件文本内容, UID: ${uid}, 长度: ${textContent?.length || 0}`);
        
        if (!textContent) {
          return {
            content: [
              {
                type: 'text',
                text: `Email not found with UID: ${uid}`
              }
            ]
          };
        }

        return {
          content: [
            {
              type: 'text',
              text: `Email Text Content (UID: ${uid}):
              --- Content ---
              ${textContent}`
            }
          ]
        };
      }

      // 使用传统的详细获取方法
      const emailDetail = await emailService.getEmailDetail(undefined, uid, includeAttachments);

      if (!emailDetail) {
        return {
          content: [
            {
              type: 'text',
              text: `Email not found with UID: ${uid}`
            }
          ]
        };
      }

      // 格式化邮件详情
      const formattedDate = emailDetail.date.toLocaleString();
      let detailText = `Email Details:
From: ${emailDetail.from}
To: ${emailDetail.to}
Subject: ${emailDetail.subject}
Date: ${formattedDate}
Size: ${emailDetail.size} bytes
Flags: ${emailDetail.flags.join(', ') || 'None'}
UID: ${emailDetail.uid}
Sequence Number: ${emailDetail.seqno}

--- Email Body ---
${emailDetail.body}`;

      // 如果有附件，添加附件信息
      if (emailDetail.attachments && emailDetail.attachments.length > 0) {
        detailText += '\n\n--- Attachments ---\n';
        emailDetail.attachments.forEach((attachment, index) => {
          detailText += `${index + 1}. ${attachment.filename} (${attachment.contentType}, ${attachment.size} bytes)\n`;
          if (includeAttachments && attachment.data) {
            detailText += `   Data: [Binary data of ${attachment.data.length} bytes]\n`;
          }
        });
      }

      return {
        content: [
          {
            type: 'text',
            text: detailText
          }
        ]
      };

    } catch (error) {
      Logger.error('Error querying email detail', error);

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
            text: `Error querying email detail: ${errorMessage}\n\nFor debugging, please check the logs and verify your account configuration.`
          }
        ]
      };
    }
  }
}