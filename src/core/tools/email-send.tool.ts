/**
 * 邮件发送工具
 * 用于通过QQ邮箱发送邮件
 */

import { z } from 'zod';
import { Tool, ToolResponse } from '../types.js';
import { EmailService } from '../../utils/email-service.js';
import { EmailStorage } from '../../utils/storage.js';
import { Logger } from '../../utils/logger.js';

export class EmailSendTool implements Tool {
  name = 'email-send';
  title = 'Email Send';
  description = 'Send emails through QQ mailbox. Support email address or display name lookup.';
  
  inputSchema = {
    from: z.string().optional().describe('Sender email address or display name. If not provided, use default account.'),
    to: z.string().describe('Recipient email address'),
    subject: z.string().describe('Email subject'),
    text: z.string().optional().describe('Plain text email content'),
    html: z.string().optional().describe('HTML email content'),
    provider: z.string().optional().describe('Email provider (default: QQ)')
  };

  async handler(args: Record<string, unknown>): Promise<ToolResponse> {
    const { 
      from, 
      to, 
      subject, 
      text, 
      html
    } = args as { 
      from?: string; 
      to: string; 
      subject: string; 
      text?: string; 
      html?: string; 
      provider?: string; 
    };
    try {
      Logger.info(`Sending email from: ${from || 'default'} to: ${to}`);

      // 验证邮件内容
      if (!text && !html) {
        return {
          content: [
            {
              type: 'text',
              text: 'Error: Either text or html content is required.'
            }
          ]
        };
      }

      let emailService: EmailService;

      if (from) {
        // 首先验证账户是否存在
        const accountExists = await EmailStorage.validateAccount(from);
        if (!accountExists) {
          return {
            content: [
              {
                type: 'text',
                text: `Account "${from}" not found or not active. Please login first using the email login page.`
              }
            ]
          };
        }

        // Check token expiry for OAuth accounts
        const tokenStatus = await EmailStorage.checkTokenExpiry(from);
        if (tokenStatus.isExpired) {
          return {
            content: [
              {
                type: 'text',
                text: `OAuth token for account "${from}" has expired. Please re-authenticate using the email login tool.`
              }
            ]
          };
        } else if (tokenStatus.needsRefresh) {
          Logger.warn(`OAuth token for account "${from}" expires in ${Math.round(tokenStatus.expiresIn / 60000)} minutes`);
        }

        emailService = await EmailService.createFromAccount(from);
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
          return {
            content: [
              {
                type: 'text',
                text: 'No default account configured. Please provide a from parameter or login first.'
              }
            ]
          };
        }
      }

      // 发送邮件
      const emailOptions: any = {
        to,
        subject
      };
      
      if (text) {
        emailOptions.text = text;
      }
      
      if (html) {
        emailOptions.html = html;
      }
      
      const success = await emailService.sendEmail(emailOptions);

      if (success) {
        return {
          content: [
            {
              type: 'text',
              text: `Email sent successfully to ${to}!\nSubject: ${subject}`
            }
          ]
        };
      } else {
        return {
          content: [
            {
              type: 'text',
              text: `Failed to send email to ${to}. Please check your configuration and try again.`
            }
          ]
        };
      }

    } catch (error) {
      Logger.error('Error sending email', error);
      
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

      // 如果是SMTP错误，提供更详细的错误信息
      if (errorMessage.includes('SMTP') || errorMessage.includes('connection') || errorMessage.includes('timeout')) {
        return {
          content: [
            {
              type: 'text',
              text: `Connection error: ${errorMessage}\n\nPlease check your internet connection and email server configuration.`
            }
          ]
        };
      }

      return {
        content: [
          {
            type: 'text',
            text: `Error sending email: ${errorMessage}\n\nFor debugging, please check the logs and verify your account configuration.`
          }
        ]
      };
    }
  }
} 