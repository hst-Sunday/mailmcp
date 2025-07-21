/**
 * 邮件服务模块
 * 实现IMAP连接和邮件操作功能
 */

import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { htmlToText } from 'html-to-text';
import nodemailer from 'nodemailer';
import { EmailAccount, EmailStorage } from './storage.js';
import { Logger } from './logger.js';
import { Config } from './config.js';
import * as cheerio from 'cheerio';
import { GMAIL_TOKEN_REFRESH_ENDPOINT } from './constants.js';

export interface EmailMessage {
  uid: number;
  seqno: number;
  from: string;
  to: string;
  subject: string;
  date: Date;
  body: string;
  flags: string[];
  size: number;
  attachments?: EmailAttachment[];
}

export interface EmailAttachment {
  filename: string;
  contentType: string;
  size: number;
  data: Buffer;
}

export interface SendEmailOptions {
  to: string;
  subject: string;
  text?: string;
  html?: string;
  attachments?: {
    filename: string;
    content: Buffer;
    contentType: string;
  }[];
}



export class EmailService {
  private imapFlow: ImapFlow | null = null;
  private transporter: nodemailer.Transporter | null = null;
  private account: EmailAccount | null = null;

  constructor(account: EmailAccount) {
    this.account = account;
  }

  /**
   * 连接到IMAP服务器
   */
  async connectImap(): Promise<void> {
    if (!this.account) {
      throw new Error('No account configured');
    }

    // Check if token is expired for OAuth accounts
    if (this.account.provider === 'Gmail' && this.account.accessToken) {
      const isTokenValid = await this.checkAndRefreshToken();
      if (!isTokenValid) {
        throw new Error('OAuth token expired and refresh failed. Please re-authenticate.');
      }
    }

    try {
      Logger.info('ImapFlow connection started');
      
      // 构建认证配置
      const auth = this.account.provider === 'Gmail' && this.account.accessToken
        ? { 
            user: this.account.username, 
            accessToken: this.account.accessToken
          }
        : { 
            user: this.account.username, 
            pass: this.account.password || ''
          };

      const config = {
        host: this.account.imapHost,
        port: this.account.imapPort,
        secure: this.account.secure,
        auth,
        logger: false as const,
        tls: {
          rejectUnauthorized: false,
          servername: this.account.imapHost
        }
      };

      this.imapFlow = new ImapFlow(config);
      
      await this.imapFlow.connect();
      Logger.info(`ImapFlow connected for ${this.account.email}`);
      
    } catch (error) {
      Logger.error('ImapFlow connection error', error);
      
      // Provide more detailed error information
      let detailedError = `ImapFlow connection failed for ${this.account.email}`;
      if (error instanceof Error) {
        detailedError += `: ${error.message}`;
        
        // Check for common authentication errors
        if (error.message.includes('Invalid credentials') || error.message.includes('authentication')) {
          if (this.account.provider === 'Gmail') {
            detailedError += '. Gmail OAuth token may be expired. Please re-authenticate.';
          } else {
            detailedError += '. Please check your email and password/authorization code.';
          }
        }
      }
      
      throw new Error(detailedError);
    }
  }


  /**
   * 断开IMAP连接
   */
  async disconnectImap(): Promise<void> {
    if (this.imapFlow) {
      await this.imapFlow.logout();
      this.imapFlow = null;
    }
  }

  /**
   * 打开邮箱
   */
  private async openBox(boxName: string = 'INBOX') {
    if (!this.imapFlow) {
      await this.connectImap();
    }
    
    const lock = await this.imapFlow!.getMailboxLock(boxName);
    return lock;
  }

  /**
   * 获取邮件列表
   */
  async getEmails(count: number = 5): Promise<EmailMessage[]> {
    const lock = await this.openBox();
    
    try {
      const status = await this.imapFlow!.status('INBOX', { messages: true });
      const totalMessages = status.messages || 0;
      
      if (totalMessages === 0) {
        return [];
      }

      const start = Math.max(1, totalMessages - count + 1);
      const end = totalMessages;

      const messages: EmailMessage[] = [];
      
      // 使用ImapFlow获取邮件
      const fetchResults = this.imapFlow!.fetch(`${start}:${end}`, {
        envelope: true,
        flags: true,
        size: true,
        uid: true,
        bodyStructure: true,
        bodyParts: ['TEXT', 'HEADER']
      });

      for await (const message of fetchResults) {
        const emailMessage: EmailMessage = {
          uid: message.uid,
          seqno: message.seq,
          from: message.envelope?.from?.[0]?.address || '',
          to: message.envelope?.to?.[0]?.address || '',
          subject: message.envelope?.subject || '',
          date: message.envelope?.date || new Date(),
          body: this.extractBodyFromParts(message.bodyParts),
          flags: Array.from(message.flags || []),
          size: message.size || 0
        };
        
        messages.push(emailMessage);
      }

      // 按日期排序，最新的在前
      messages.sort((a, b) => b.date.getTime() - a.date.getTime());
      return messages;
      
    } catch (error) {
      Logger.error('Error fetching emails with ImapFlow', error);
      throw error;
    } finally {
      lock.release();
    }
  }

  /**
   * 从 ImapFlow 的 bodyParts 中提取文本内容
   */
  private extractBodyFromParts(bodyParts: Map<string, Buffer> | undefined): string {
    if (!bodyParts) return '';
    
    // 优先查找 TEXT 部分
    const textPart = bodyParts.get('TEXT');
    if (textPart) {
      return textPart.toString('utf8');
    }
    
    // 如果没有 TEXT，查找 HEADER 以外的第一个部分
    for (const [key, content] of bodyParts.entries()) {
      if (key !== 'HEADER' && content) {
        const contentStr = content.toString('utf8');
        if (this.isHtmlContent(contentStr)) {
          return this.stripHtmlTags(contentStr);
        }
        return this.cleanPlainText(contentStr);
      }
    }
    
    return '';
  }

  /**
   * 处理 ImapFlow 的 bodyParts 为邮件正文
   */
  private async processEmailBodyFromParts(bodyParts: Map<string, Buffer> | undefined): Promise<string> {
    if (!bodyParts) return '';
    
    // 优先查找 TEXT 部分
    const textPart = bodyParts.get('TEXT');
    if (textPart) {
      const content = textPart.toString('utf8');
      return this.isHtmlContent(content) ? this.stripHtmlTags(content) : this.cleanPlainText(content);
    }
    
    // 查找第一个body部分
    const firstBodyPart = bodyParts.get('1');
    if (firstBodyPart) {
      const content = firstBodyPart.toString('utf8');
      return this.isHtmlContent(content) ? this.stripHtmlTags(content) : this.cleanPlainText(content);
    }
    
    // 遍历所有非-HEADER部分
    for (const [key, content] of bodyParts.entries()) {
      if (key !== 'HEADER' && content) {
        const contentStr = content.toString('utf8');
        return this.isHtmlContent(contentStr) ? this.stripHtmlTags(contentStr) : this.cleanPlainText(contentStr);
      }
    }
    
    return '';
  }

  /**
   * 从 ImapFlow 的 bodyStructure 中解析附件
   */
  private parseAttachmentsFromStructure(bodyStructure: unknown): EmailAttachment[] {
    if (!bodyStructure) return [];
    
    const attachments: EmailAttachment[] = [];
    
    const parseStructure = (struct: unknown) => {
      if (Array.isArray(struct)) {
        struct.forEach(part => parseStructure(part));
      } else if (struct && typeof struct === 'object' && struct !== null && 'disposition' in struct && (struct as Record<string, unknown>).disposition === 'attachment') {
        const structObj = struct as Record<string, unknown>;
        const dispositionParams = structObj.dispositionParameters as Record<string, unknown> | undefined;
        const params = structObj.parameters as Record<string, unknown> | undefined;
        const attachment: EmailAttachment = {
          filename: dispositionParams?.filename as string || params?.name as string || 'unknown',
          contentType: structObj.type && structObj.subtype ? `${structObj.type}/${structObj.subtype}` : 'application/octet-stream',
          size: (structObj.size as number) || 0,
          data: Buffer.alloc(0) // 这里暂时不下载实际数据
        };
        attachments.push(attachment);
      }
    };
    
    parseStructure(bodyStructure);
    return attachments;
  }

  /**
   * 获取邮件详情
   */
  async getEmailDetail(seqno?: number, uid?: number, includeAttachments: boolean = false): Promise<EmailMessage | null> {
    if (!seqno && !uid) {
      throw new Error('Must provide either seqno or uid');
    }

    const lock = await this.openBox();
    
    try {
      const fetchQuery = uid ? uid : seqno!;
      const fetchOptions = {
        envelope: true,
        flags: true,
        size: true,
        uid: true,
        bodyStructure: includeAttachments,
        bodyParts: ['HEADER', 'TEXT', '1']
      };
      
      const fetchResults = this.imapFlow!.fetch(String(fetchQuery), fetchOptions, { uid: !!uid });
      
      let emailMessage: EmailMessage | null = null;
      
      for await (const message of fetchResults) {
        emailMessage = {
          uid: message.uid,
          seqno: message.seq,
          from: message.envelope?.from?.[0]?.address || '',
          to: message.envelope?.to?.[0]?.address || '',
          subject: message.envelope?.subject || '',
          date: message.envelope?.date || new Date(),
          body: await this.processEmailBodyFromParts(message.bodyParts),
          flags: Array.from(message.flags || []),
          size: message.size || 0,
          attachments: includeAttachments ? this.parseAttachmentsFromStructure(message.bodyStructure) : []
        };
        
        break; // 只取第一个结果
      }
      
      return emailMessage;
      
    } catch (error) {
      Logger.error('Error fetching email detail with ImapFlow', error);
      throw error;
    } finally {
      lock.release();
    }
  }

  /**
   * 使用 ImapFlow + simpleParser 简化获取邮件文字内容
   * 类似测试文件中的实现方式
   */
  async getEmailTextContent(uid: number): Promise<string | null> {
    if (!this.account) {
      throw new Error('No account configured');
    }

    // Check if token is expired for OAuth accounts
    if (this.account.provider === 'Gmail' && this.account.accessToken) {
      const isTokenValid = await this.checkAndRefreshToken();
      if (!isTokenValid) {
        throw new Error('OAuth token expired and refresh failed. Please re-authenticate.');
      }
    }

    // 构建认证配置
    const auth = this.account.provider === 'Gmail' && this.account.accessToken
      ? { 
          user: this.account.email, 
          accessToken: this.account.accessToken
        }
      : { 
          user: this.account.email, 
          pass: this.account.password || ''
        };

    const config = {
      host: this.account.provider === 'Gmail' ? 'imap.gmail.com' : 'imap.qq.com',
      port: 993,
      secure: true,
      auth,
      logger: false as const
    };

    const client = new ImapFlow(config);
    
    // 设置30秒超时
    const timeout = 30000;
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(`Operation timed out after ${timeout}ms`)), timeout);
    });
    
    try {
      // 使用 Promise.race 来添加超时保护
      const fetchPromise = this.performEmailFetch(client, uid);
      const result = await Promise.race([
        timeoutPromise,
        fetchPromise
      ]);
      
      // 确保连接被关闭（在后台异步执行，不阻塞返回）
      this.safeLogout(client).catch(() => {
        Logger.debug('后台连接清理完成，出现预期的超时（正常现象）');
      });
      
      return result;
      
    } catch (error) {
      Logger.error(`处理邮件 UID ${uid} 时发生错误:`, error);
      // 确保连接被关闭
      this.safeLogout(client).catch(() => {
        Logger.debug('错误清理期间的连接关闭完成');
      });
      throw error;
    }
  }

  /**
   * 执行邮件获取操作（从 getEmailTextContent 中提取出来，以便添加超时保护）
   */
  private async performEmailFetch(client: ImapFlow, uid: number): Promise<string | null> {
    await client.connect();
    
    // 选择收件箱
    const lock = await client.getMailboxLock('INBOX');
    
    try {
      // 检查邮件是否存在
      Logger.info(`正在检查 UID ${uid} 是否存在...`);
      
      // 尝试获取邮件的基本信息
      const messages = client.fetch(uid, { uid: true, envelope: true }, { uid: true });
      const messageList = [];
      for await (const message of messages) {
        messageList.push(message);
      }
      
      if (messageList.length === 0) {
        Logger.warn(`UID ${uid} 不存在`);
        return null;
      }
      
      Logger.info(`找到邮件 UID ${uid}, 主题: ${messageList[0].envelope?.subject || '无主题'}`);
      
      // 使用 fetch 获取邮件的完整源码
      const sourceMessages = client.fetch(uid, { source: true }, { uid: true });
      let emailSource = null;
      
      for await (const message of sourceMessages) {
        if (message.uid === uid) {
          emailSource = message.source;
          break;
        }
      }
      
      if (!emailSource) {
        Logger.warn(`无法下载 UID ${uid} 的邮件内容`);
        return null;
      }
      
      Logger.info(`邮件下载成功，大小: ${emailSource.length} 字节`);
      
      // 使用 simpleParser 解析邮件
      const parsed = await simpleParser(emailSource);

      // 1) 优先用 text/plain
      if (parsed.text) {
        Logger.info('找到纯文本内容');
        return this.cleanEmailText(parsed.text);
      }

      // 2) Fallback：把 HTML 转纯文本
      if (parsed.html) {
        Logger.info('找到HTML内容，转换为纯文本');
        const htmlText = htmlToText(parsed.html, {
          wordwrap: false,           // 不自动换行
          selectors: [               // 自定义换行策略（可选）
            { selector: 'a', options: { hideLinkHrefIfSameAsText: true } },
          ],
        });
        return this.cleanEmailText(htmlText);
      }

      Logger.warn('邮件中没有找到文本内容');
      return ''; // 邮件里什么正文都没有
      
    } finally {
      lock.release();
    }
  }

  /**
   * 安全地关闭 IMAP 连接，带有超时保护
   */
  private async safeLogout(client: ImapFlow): Promise<void> {
    const LOGOUT_TIMEOUT = 3000; // 3秒超时，缩短等待时间
    
    try {
      // 首先尝试正常关闭
      await Promise.race([
        client.logout(),
        new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('Logout timeout')), LOGOUT_TIMEOUT);
        })
      ]);
      Logger.debug('IMAP连接已正常关闭');
    } catch (error) {
      if (error instanceof Error && error.message === 'Logout timeout') {
        Logger.debug('IMAP正常关闭超时，尝试强制关闭连接（这是正常现象）');
      } else {
        Logger.warn('IMAP连接关闭时发生错误:', error);
      }
      
      // 尝试强制关闭连接
      try {
        // 尝试调用内部的关闭方法
        const clientWithClose = client as unknown as { 
          close?: () => void;
          connection?: { end?: () => void };
        };
        
        if (clientWithClose.close) {
          clientWithClose.close();
        } else if (clientWithClose.connection?.end) {
          clientWithClose.connection.end();
        }
        
        Logger.debug('连接已强制关闭');
      } catch (closeError) {
        // 这里不再记录警告，因为强制关闭失败是可以接受的
        Logger.debug('强制关闭连接时发生错误（可忽略）:', closeError);
      }
    }
  }

  /**
   * 清理邮件文本内容，移除链接等不需要的内容
   */
  private cleanEmailText(text: string): string {
    if (!text) return '';
    
    let cleanedText = text.trim();
    
    // 1. 移除方括号内的链接，如 [https://www.baidu.com/123123]
    cleanedText = cleanedText.replace(/\[https?:\/\/[^\]]+\]/g, '');
    
    // 2. 移除所有独立行的 HTTP/HTTPS 链接
    cleanedText = cleanedText.replace(/^https?:\/\/[^\s]+$/gm, '');
    
    // 3. 移除行内的 HTTP/HTTPS 链接
    cleanedText = cleanedText.replace(/https?:\/\/[^\s]+/g, '');
    
    // 4. 移除邮件中常见的隐藏字符（零宽字符等）
    cleanedText = cleanedText.replace(/\u200B/g, ''); // 零宽空格
    cleanedText = cleanedText.replace(/\u200C/g, ''); // 零宽非连字符
    cleanedText = cleanedText.replace(/\u200D/g, ''); // 零宽连字符
    cleanedText = cleanedText.replace(/\uFEFF/g, ''); // 字节顺序标记
    cleanedText = cleanedText.replace(/\u034F/g, ''); // 组合字符
    
    // 5. 移除只包含空白的行
    cleanedText = cleanedText.replace(/^\s+$/gm, '');
    
    // 6. 移除常见的邮件营销词汇行（可选，根据需要调整）
    // const marketingPatterns = [
    //   /^Sponsored$/gm,
    //   /^View item$/gm,
    //   /^Update your email preferences$/gm,
    //   /^unsubscribe$/gm,
    //   /^or learn about account protection$/gm,
    //   /^If you have a question, contact us$/gm,
    //   /^eBay Logo$/gm,
    //   /^© \d{4}.*eBay.*$/gm,
    //   /^eBay Inc\..*$/gm,
    //   /^\d+ watching$/gm,
    //   /^\d+ bids?$/gm,
    //   /^\$\d+\.\d+$/gm  // 价格行如 $99.00
    // ];
    
    // marketingPatterns.forEach(pattern => {
    //   cleanedText = cleanedText.replace(pattern, '');
    // });
    
    // 7. 清理多余的空行和空格
    cleanedText = cleanedText.replace(/\n\s*\n\s*\n+/g, '\n\n'); // 多个空行合并为双换行
    cleanedText = cleanedText.replace(/[ \t]+/g, ' '); // 多个空格合并为一个
    cleanedText = cleanedText.replace(/\n[ \t]+/g, '\n'); // 移除行首空格
    cleanedText = cleanedText.replace(/[ \t]+\n/g, '\n'); // 移除行尾空格
    
    // 8. 移除开头和结尾的空行
    cleanedText = cleanedText.replace(/^\n+/, '').replace(/\n+$/, '');
    
    return cleanedText.trim();
  }

  /**
   * 剔除html标签，获取纯文本内容
   */
  async getEmailBody(html: string): Promise<string> {
    const $ = cheerio.load(html);
    const text = $('body').text();
    return text;
  }



  /**
   * 清理纯文本内容
   */
  private cleanPlainText(text: string): string {
    if (!text) return '';
    
    // 移除MIME边界标记
    text = text.replace(/--[A-Za-z0-9=_-]+/g, '');
    
    // 移除Content-Type等MIME头
    text = text.replace(/Content-Type:.*?\n/gi, '');
    text = text.replace(/Content-Transfer-Encoding:.*?\n/gi, '');
    text = text.replace(/Content-Disposition:.*?\n/gi, '');
    
    // 清理多余的空行
    text = text.replace(/\n\s*\n\s*\n/g, '\n\n');
    
    // 移除开头和结尾的空白字符
    return text.trim();
  }

  /**
   * 检查内容是否为HTML
   */
  private isHtmlContent(content: string): boolean {
    if (!content) return false;
    
    // 检查常见的HTML标签
    const htmlPattern = /<\s*(html|body|div|p|br|img|a|span|table|tr|td)\s*[^>]*>/i;
    return htmlPattern.test(content);
  }

  /**
   * 从HTML中提取纯文本内容，保留文本结构
   */
  private stripHtmlTags(html: string): string {
    if (!html) return '';
    
    let text = html;
    
    // 首先处理块级元素，为它们添加换行
    const blockElements = [
      'p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 
      'li', 'dt', 'dd', 'blockquote', 'pre', 'address',
      'article', 'section', 'header', 'footer', 'main'
    ];
    
    blockElements.forEach(tag => {
      // 块级元素结束标签后添加双换行
      text = text.replace(new RegExp(`</${tag}[^>]*>`, 'gi'), '\n\n');
      // 列表项特殊处理，添加项目符号
      if (tag === 'li') {
        text = text.replace(new RegExp(`<${tag}[^>]*>`, 'gi'), '\n• ');
      } else {
        text = text.replace(new RegExp(`<${tag}[^>]*>`, 'gi'), '\n');
      }
    });
    
    // 处理换行元素
    text = text.replace(/<br\s*\/?>/gi, '\n');
    text = text.replace(/<hr\s*\/?>/gi, '\n---\n');
    
    // 处理表格元素
    text = text.replace(/<\/tr>/gi, '\n');
    text = text.replace(/<\/td>/gi, '\t');
    text = text.replace(/<\/th>/gi, '\t');
    text = text.replace(/<t[dh][^>]*>/gi, '');
    text = text.replace(/<\/?table[^>]*>/gi, '\n');
    text = text.replace(/<\/?tbody[^>]*>/gi, '');
    text = text.replace(/<\/?thead[^>]*>/gi, '');
    text = text.replace(/<tr[^>]*>/gi, '');
    
    // 处理链接，保留链接文本和URL
    text = text.replace(/<a[^>]*href\s*=\s*["']([^"']*)["'][^>]*>(.*?)<\/a>/gi, '$2 ($1)');
    
    // 处理图片，保留alt文本
    text = text.replace(/<img[^>]*alt\s*=\s*["']([^"']*)["'][^>]*>/gi, '[图片: $1]');
    text = text.replace(/<img[^>]*>/gi, '[图片]');
    
    // 移除脚本和样式内容
    text = text.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
    text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
    
    // 移除所有剩余的HTML标签
    text = text.replace(/<[^>]*>/g, '');
    
    // 解码HTML实体
    text = this.decodeHtmlEntities(text);
    
    // 清理空白字符
    text = text.replace(/[ \t]+/g, ' '); // 多个空格/制表符合并为一个空格
    text = text.replace(/\n[ \t]+/g, '\n'); // 移除行首的空格/制表符
    text = text.replace(/[ \t]+\n/g, '\n'); // 移除行尾的空格/制表符
    text = text.replace(/\n{3,}/g, '\n\n'); // 多个换行合并为双换行
    
    return text.trim();
  }

  /**
   * 解码HTML实体
   */
  private decodeHtmlEntities(text: string): string {
    // 常见的HTML实体映射
    const entities: { [key: string]: string } = {
      '&nbsp;': ' ',
      '&amp;': '&',
      '&lt;': '<',
      '&gt;': '>',
      '&quot;': '"',
      '&#39;': "'",
      '&apos;': "'",
      '&copy;': '©',
      '&reg;': '®',
      '&trade;': '™',
      '&hellip;': '...',
      '&mdash;': '—',
      '&ndash;': '–',
      '&lsquo;': '\u2018',
      '&rsquo;': '\u2019',
      '&ldquo;': '\u201C',
      '&rdquo;': '\u201D',
      '&bull;': '•',
      '&euro;': '€',
      '&pound;': '£',
      '&yen;': '¥'
    };
    
    let decoded = text;
    
    // 替换命名实体
    for (const [entity, replacement] of Object.entries(entities)) {
      decoded = decoded.replace(new RegExp(entity, 'gi'), replacement);
    }
    
    // 处理数字实体 &#123; 和 &#x1F;
    decoded = decoded.replace(/&#(\d+);/g, (match, dec) => {
      try {
        return String.fromCharCode(parseInt(dec, 10));
      } catch {
        return match;
      }
    });
    
    decoded = decoded.replace(/&#x([0-9A-Fa-f]+);/g, (match, hex) => {
      try {
        return String.fromCharCode(parseInt(hex, 16));
      } catch {
        return match;
      }
    });
    
    return decoded;
  }


  /**
   * 创建SMTP传输器
   */
  private async createTransporter(): Promise<nodemailer.Transporter> {
    if (!this.account) {
      throw new Error('No account configured');
    }

    // Check if token is expired for OAuth accounts
    if (this.account.provider === 'Gmail' && this.account.accessToken) {
      const isTokenValid = await this.checkAndRefreshToken();
      if (!isTokenValid) {
        throw new Error('OAuth token expired and refresh failed. Please re-authenticate.');
      }
    }

    if (!this.transporter) {
      // For OAuth accounts (Gmail), use OAuth2 authentication
      if (this.account.provider === 'Gmail' && this.account.accessToken) {
        this.transporter = nodemailer.createTransport({
          host: this.account.smtpHost,
          port: this.account.smtpPort,
          secure: this.account.secure,
          auth: {
            type: 'OAuth2',
            user: this.account.username,
            accessToken: this.account.accessToken
          },
          tls: {
            rejectUnauthorized: false,
            secureProtocol: 'TLSv1_2_method',
            servername: this.account.smtpHost,
            ciphers: 'ECDHE+AESGCM:ECDHE+CHACHA20:DHE+AESGCM:DHE+CHACHA20:!aNULL:!MD5:!DSS'
          },
          connectionTimeout: 60000,
          greetingTimeout: 30000,
          socketTimeout: 60000
        });
      } else {
        // Regular password authentication (QQ Mail)
        this.transporter = nodemailer.createTransport({
          host: this.account.smtpHost,
          port: this.account.smtpPort,
          secure: this.account.secure,
          auth: {
            user: this.account.username,
            pass: this.account.password
          },
          tls: {
            rejectUnauthorized: false,
            secureProtocol: 'TLSv1_2_method',
            servername: this.account.smtpHost
          },
          connectionTimeout: 60000,
          greetingTimeout: 30000,
          socketTimeout: 60000
        });
      }
    }

    return this.transporter;
  }

  /**
   * 发送邮件
   */
  async sendEmail(options: SendEmailOptions): Promise<boolean> {
    try {
      const transporter = await this.createTransporter();
      
      const mailOptions = {
        from: this.account!.email,
        to: options.to,
        subject: options.subject,
        text: options.text,
        html: options.html,
        attachments: options.attachments
      };

      const info = await transporter.sendMail(mailOptions);
      Logger.info(`Email sent successfully: ${info.messageId}`);
      return true;
    } catch (error) {
      Logger.error('Failed to send email', error);
      
      // Provide more detailed error information
      if (error instanceof Error) {
        if (error.message.includes('OAuth') || error.message.includes('token')) {
          throw new Error(`Authentication failed: ${error.message}. Please re-authenticate.`);
        } else if (error.message.includes('Invalid login')) {
          throw new Error(`Invalid credentials: ${error.message}. Please check your email and password.`);
        }
      }
      
      throw error;
    }
  }

  /**
   * 验证邮箱账户连接
   */
  async validateConnection(): Promise<boolean> {
    try {
      await this.connectImap();
      const lock = await this.openBox();
      lock.release();
      await this.disconnectImap();
      return true;
    } catch (error) {
      Logger.error('Account validation failed', error);
      return false;
    }
  }

  /**
   * Check if OAuth token is expired and refresh if possible
   */
  private async checkAndRefreshToken(): Promise<boolean> {
    if (!this.account || this.account.provider !== 'Gmail') {
      return true; // Not an OAuth account
    }

    // Check if token is expired
    if (this.account.tokenExpiry) {
      const expiryDate = new Date(this.account.tokenExpiry);
      const now = new Date();
      const timeUntilExpiry = expiryDate.getTime() - now.getTime();
      
      // If token expires in less than 5 minutes, try to refresh
      if (timeUntilExpiry < 5 * 60 * 1000) {
        Logger.info(`OAuth token expires soon for ${this.account.email}, attempting refresh...`);
        
        if (this.account.refreshToken) {
          try {
            await this.refreshOAuthToken();
            return true;
          } catch (error) {
            Logger.error('Failed to refresh OAuth token', error);
            return false;
          }
        } else {
          Logger.error('No refresh token available for OAuth token refresh');
          return false;
        }
      }
    }

    return true; // Token is still valid
  }

  /**
   * Refresh OAuth token using the local refresh endpoint
   */
  private async refreshOAuthToken(): Promise<void> {
    if (!this.account || !this.account.refreshToken) {
      throw new Error('No refresh token available');
    }

    try {
      // First try the local refresh endpoint
      const url = `${GMAIL_TOKEN_REFRESH_ENDPOINT}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          email: this.account.email,
          refresh_token: this.account.refreshToken
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        Logger.warn(`Local refresh endpoint failed: ${response.status} - ${errorText}`);
        
        // Fallback to direct Google OAuth refresh
        await this.fallbackRefreshOAuthToken();
        return;
      }

      const data = await response.json();

      if (!data.success) {
        Logger.warn(`Local refresh failed: ${data.message || 'Unknown error'}`);
        
        // Fallback to direct Google OAuth refresh
        await this.fallbackRefreshOAuthToken();
        return;
      }

      // Update the account with new tokens from local endpoint
      this.account.accessToken = data.access_token;
      this.account.tokenExpiry = data.expires_at;
      this.account.lastLogin = new Date().toISOString();

      // Update refresh token if provided
      if (data.refresh_token) {
        this.account.refreshToken = data.refresh_token;
      }

      // Save updated account to storage
      await EmailStorage.updateAccount(this.account);

      Logger.info(`OAuth token refreshed successfully via local endpoint for ${this.account.email}`);

    } catch (error) {
      Logger.warn('Failed to refresh OAuth token via local endpoint, trying fallback', error);
      
      // Fallback to direct Google OAuth refresh
      try {
        await this.fallbackRefreshOAuthToken();
      } catch (fallbackError) {
        Logger.error('All OAuth token refresh methods failed', fallbackError);
        throw new Error(`OAuth token refresh failed: ${fallbackError instanceof Error ? fallbackError.message : 'Unknown error'}`);
      }
    }
  }

  /**
   * Fallback refresh OAuth token using direct Google OAuth endpoint
   */
  private async fallbackRefreshOAuthToken(): Promise<void> {
    if (!this.account || !this.account.refreshToken) {
      throw new Error('No refresh token available');
    }

    const oauthConfig = Config.getGoogleOAuthConfig();
    if (!oauthConfig.clientId || !oauthConfig.clientSecret) {
      Logger.error('Google OAuth client configuration missing. Please set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET environment variables.');
      throw new Error('Google OAuth client configuration missing. Please re-authenticate manually.');
    }

    try {
      const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: this.account.refreshToken,
          client_id: oauthConfig.clientId,
          client_secret: oauthConfig.clientSecret
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        Logger.error(`OAuth token refresh failed: ${response.status} - ${errorText}`);
        throw new Error(`OAuth token refresh failed: ${response.status}`);
      }

      const data = await response.json();

      if (data.error) {
        Logger.error(`OAuth token refresh error: ${data.error} - ${data.error_description || ''}`);
        throw new Error(`OAuth token refresh error: ${data.error}`);
      }

      // Update the account with new tokens
      const expiryTime = new Date();
      expiryTime.setSeconds(expiryTime.getSeconds() + (data.expires_in || 3600));

      this.account.accessToken = data.access_token;
      this.account.tokenExpiry = expiryTime.toISOString();
      this.account.lastLogin = new Date().toISOString();

      // Update refresh token if provided (sometimes Google provides a new one)
      if (data.refresh_token) {
        this.account.refreshToken = data.refresh_token;
      }

      // Save updated account to storage
      await EmailStorage.updateAccount(this.account);

      Logger.info(`OAuth token refreshed successfully via fallback for ${this.account.email}`);

    } catch (error) {
      Logger.error('Failed to refresh OAuth token via fallback', error);
      throw new Error(`OAuth token refresh failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * 静态方法：创建邮件服务实例
   */
  static async createFromAccount(emailOrDisplayName: string): Promise<EmailService> {
    const account = await EmailStorage.getAccount(emailOrDisplayName);
    if (!account) {
      throw new Error(`Account not found: ${emailOrDisplayName}`);
    }
    return new EmailService(account);
  }

  /**
   * 静态方法：创建默认邮件服务实例
   */
  static async createDefault(): Promise<EmailService> {
    const account = await EmailStorage.getDefaultAccount();
    if (!account) {
      throw new Error('No default account configured');
    }
    return new EmailService(account);
  }

  /**
   * 静态方法：测试QQ邮箱连接
   */
  static async testQQConnection(email: string, password: string): Promise<boolean> {
    const config = EmailStorage.getQQEmailConfig();
    const testAccount: EmailAccount = {
      email,
      provider: 'QQ',
      username: email,
      password,
      ...config,
      isActive: true
    };

    const service = new EmailService(testAccount);
    return await service.validateConnection();
  }

  /**
   * 静态方法：测试Gmail OAuth连接
   */
  static async testGmailOAuthConnection(email: string, accessToken: string): Promise<boolean> {
    const config = EmailStorage.getGmailConfig();
    const testAccount: EmailAccount = {
      email,
      provider: 'Gmail',
      username: email,
      password: '',
      accessToken,
      ...config,
      isActive: true
    };

    const service = new EmailService(testAccount);
    return await service.validateConnection();
  }
} 