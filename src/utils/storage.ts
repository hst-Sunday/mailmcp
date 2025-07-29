/**
 * 邮件存储管理模块
 * 用于管理用户的邮箱登录信息
 */

import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { Logger } from './logger.js';
import { GMAIL_TOKEN_REFRESH_ENDPOINT } from './constants.js';

export interface EmailAccount {
  email: string;
  displayName?: string;
  provider: string;
  username: string;
  password: string;
  imapHost: string;
  imapPort: number;
  smtpHost: string;
  smtpPort: number;
  secure: boolean;
  lastLogin?: string;
  isActive: boolean;
  accessToken?: string;  // For OAuth providers
  refreshToken?: string; // For OAuth providers
  tokenExpiry?: string;  // For OAuth providers
}

export interface GmailAuthData {
  user: {
    email?: string;
    name?: string;
    [key: string]: unknown;
  };
  gmail: {
    email?: string;
    [key: string]: unknown;
  };
  tokens: {
    access_token: string;
    refresh_token?: string;
    scope?: string;
    token_type: string;
    expiry_date?: number;
  };
  loginTime: string;
}

export interface StorageData {
  accounts: EmailAccount[];
  defaultAccount?: string | undefined;
  lastUpdated: string;
  gmailAuths?: GmailAuthData[];
}

export class EmailStorage {
  private static readonly STORAGE_DIR = path.join(os.homedir(), '.mailmcp');
  private static readonly STORAGE_FILE = 'storage.json';
  private static readonly STORAGE_PATH = path.join(EmailStorage.STORAGE_DIR, EmailStorage.STORAGE_FILE);

  /**
   * 创建默认存储数据
   */
  private static createDefaultStorageData(): StorageData {
    return {
      accounts: [],
      lastUpdated: new Date().toISOString()
    };
  }

  /**
   * 验证存储数据结构
   */
  private static validateStorageData(data: unknown): StorageData {
    if (!data || typeof data !== 'object') {
      Logger.warn('Invalid storage data: not an object, creating default');
      return EmailStorage.createDefaultStorageData();
    }

    const obj = data as Record<string, unknown>;

    // 确保 accounts 数组存在
    if (!Array.isArray(obj.accounts)) {
      Logger.warn('Invalid storage data: accounts is not an array, fixing');
      obj.accounts = [];
    }

    // 确保 lastUpdated 存在
    if (!obj.lastUpdated || typeof obj.lastUpdated !== 'string') {
      obj.lastUpdated = new Date().toISOString();
    }

    // 确保 gmailAuths 是数组（如果存在）
    if (obj.gmailAuths && !Array.isArray(obj.gmailAuths)) {
      obj.gmailAuths = [];
    }

    return obj as unknown as StorageData;
  }

  /**
   * 初始化存储文件
   */
  private static async initializeStorage(): Promise<void> {
    try {
      // 确保目录存在
      await fs.mkdir(EmailStorage.STORAGE_DIR, { recursive: true });
      await fs.access(EmailStorage.STORAGE_PATH);
      
      // 检查文件是否有效
      const data = await fs.readFile(EmailStorage.STORAGE_PATH, 'utf8');
      if (!data.trim()) {
        throw new Error('Empty storage file');
      }
      
      // 尝试解析 JSON 以验证文件有效性
      JSON.parse(data);
    } catch {
      // 文件不存在或无效，创建默认结构
      const defaultData = EmailStorage.createDefaultStorageData();
      await fs.writeFile(EmailStorage.STORAGE_PATH, JSON.stringify(defaultData, null, 2), 'utf8');
      Logger.info('Storage file created or repaired');
    }
  }

  /**
   * 读取存储数据
   */
  static async readStorage(): Promise<StorageData> {
    try {
      await EmailStorage.initializeStorage();
      Logger.info("EmailStorage.STORAGE_PATH:", EmailStorage.STORAGE_PATH);
      const data = await fs.readFile(EmailStorage.STORAGE_PATH, 'utf8');
      
      // 解析并验证 JSON 数据
      let parsedData;
      try {
        parsedData = JSON.parse(data);
      } catch (parseError) {
        Logger.warn('Invalid JSON in storage file, creating default data', parseError);
        const defaultData = EmailStorage.createDefaultStorageData();
        await fs.writeFile(EmailStorage.STORAGE_PATH, JSON.stringify(defaultData, null, 2), 'utf8');
        return defaultData;
      }
      
      // 验证并修复数据结构
      const validatedData = EmailStorage.validateStorageData(parsedData);
      
      // 如果数据被修复，保存回文件
      if (JSON.stringify(validatedData) !== JSON.stringify(parsedData)) {
        await fs.writeFile(EmailStorage.STORAGE_PATH, JSON.stringify(validatedData, null, 2), 'utf8');
        Logger.info('Storage data structure repaired and saved');
      }
      
      return validatedData;
    } catch (error) {
      Logger.error('Failed to read storage, creating default', error);
      const defaultData = EmailStorage.createDefaultStorageData();
      try {
        await fs.writeFile(EmailStorage.STORAGE_PATH, JSON.stringify(defaultData, null, 2), 'utf8');
      } catch (writeError) {
        Logger.error('Failed to create default storage file', writeError);
      }
      return defaultData;
    }
  }

  /**
   * 写入存储数据
   */
  static async writeStorage(data: StorageData): Promise<void> {
    try {
      data.lastUpdated = new Date().toISOString();
      await fs.writeFile(EmailStorage.STORAGE_PATH, JSON.stringify(data, null, 2), 'utf8');
      Logger.info('Storage data updated');
    } catch (error) {
      Logger.error('Failed to write storage', error);
      throw new Error('Failed to write storage data');
    }
  }

  /**
   * 添加邮箱账户
   */
  static async addAccount(account: Omit<EmailAccount, 'lastLogin' | 'isActive'>): Promise<void> {
    const storage = await EmailStorage.readStorage();

    // 检查是否已存在
    const existingIndex = storage.accounts.findIndex(acc => acc.email === account.email);

    const newAccount: EmailAccount = {
      ...account,
      lastLogin: new Date().toISOString(),
      isActive: true
    };

    if (existingIndex >= 0) {
      // 更新现有账户
      storage.accounts[existingIndex] = newAccount;
      Logger.info(`Account updated: ${account.email}`);
    } else {
      // 添加新账户
      storage.accounts.push(newAccount);
      Logger.info(`Account added: ${account.email}`);
    }

    // 如果是第一个账户，设为默认账户
    if (!storage.defaultAccount) {
      storage.defaultAccount = account.email;
    }

    await EmailStorage.writeStorage(storage);
  }

  /**
   * 获取邮箱账户
   */
  static async getAccount(emailOrDisplayName: string): Promise<EmailAccount | null> {
    const storage = await EmailStorage.readStorage();

    const account = storage.accounts.find(acc =>
      acc.email === emailOrDisplayName ||
      acc.displayName === emailOrDisplayName
    );

    return account || null;
  }

  /**
   * 获取所有账户
   */
  static async getAllAccounts(): Promise<EmailAccount[]> {
    const storage = await EmailStorage.readStorage();
    return storage.accounts;
  }

  /**
   * 获取默认账户
   */
  static async getDefaultAccount(): Promise<EmailAccount | null> {
    const storage = await EmailStorage.readStorage();

    if (!storage.defaultAccount) {
      return null;
    }

    return await EmailStorage.getAccount(storage.defaultAccount);
  }

  /**
   * 设置默认账户
   */
  static async setDefaultAccount(email: string): Promise<void> {
    const storage = await EmailStorage.readStorage();
    const account = storage.accounts.find(acc => acc.email === email);

    if (!account) {
      throw new Error(`Account not found: ${email}`);
    }

    storage.defaultAccount = email;
    await EmailStorage.writeStorage(storage);
  }

  /**
   * 删除账户
   */
  static async removeAccount(email: string): Promise<void> {
    const storage = await EmailStorage.readStorage();
    const index = storage.accounts.findIndex(acc => acc.email === email);

    if (index === -1) {
      throw new Error(`Account not found: ${email}`);
    }

    storage.accounts.splice(index, 1);

    // 如果删除的是默认账户，重新设置默认账户
    if (storage.defaultAccount === email) {
      storage.defaultAccount = storage.accounts.length > 0 ? storage.accounts[0].email : undefined;
    }

    await EmailStorage.writeStorage(storage);
    Logger.info(`Account removed: ${email}`);
  }

  /**
   * 更新账户信息
   */
  static async updateAccount(account: EmailAccount): Promise<void> {
    const storage = await EmailStorage.readStorage();
    const index = storage.accounts.findIndex(acc => acc.email === account.email);

    if (index === -1) {
      throw new Error(`Account not found: ${account.email}`);
    }

    // 更新账户信息
    storage.accounts[index] = {
      ...account,
      lastLogin: new Date().toISOString()
    };

    await EmailStorage.writeStorage(storage);
    Logger.info(`Account updated: ${account.email}`);
  }

  /**
   * 验证账户是否存在且有效
   */
  static async validateAccount(emailOrDisplayName: string): Promise<boolean> {
    const account = await EmailStorage.getAccount(emailOrDisplayName);
    return account !== null && account.isActive;
  }

  /**
   * 获取QQ邮箱的默认配置
   */
  static getQQEmailConfig(): Pick<EmailAccount, 'imapHost' | 'imapPort' | 'smtpHost' | 'smtpPort' | 'secure'> {
    return {
      imapHost: 'imap.qq.com',
      imapPort: 993,
      smtpHost: 'smtp.qq.com',
      smtpPort: 465,
      secure: true
    };
  }

  /**
   * 获取Gmail的默认配置
   */
  static getGmailConfig(): Pick<EmailAccount, 'imapHost' | 'imapPort' | 'smtpHost' | 'smtpPort' | 'secure'> {
    return {
      imapHost: 'imap.gmail.com',
      imapPort: 993,
      smtpHost: 'smtp.gmail.com',
      smtpPort: 465,
      secure: true
    };
  }

  /**
   * 添加OAuth账户
   */
  static async addOAuthAccount(account: Omit<EmailAccount, 'password' | 'lastLogin' | 'isActive'>): Promise<void> {
    const storage = await EmailStorage.readStorage();

    // 检查是否已存在
    const existingIndex = storage.accounts.findIndex(acc => acc.email === account.email);

    const newAccount: EmailAccount = {
      ...account,
      password: '', // OAuth doesn't use password
      lastLogin: new Date().toISOString(),
      isActive: true
    };

    if (existingIndex >= 0) {
      // 更新现有账户
      storage.accounts[existingIndex] = newAccount;
      Logger.info(`OAuth account updated: ${account.email}`);
    } else {
      // 添加新账户
      storage.accounts.push(newAccount);
      Logger.info(`OAuth account added: ${account.email}`);
    }

    // 如果是第一个账户，设为默认账户
    if (!storage.defaultAccount) {
      storage.defaultAccount = account.email;
    }

    await EmailStorage.writeStorage(storage);
  }

  /**
   * 将Gmail授权数据转换为EmailAccount格式
   */
  static convertGmailAuthToAccount(gmailAuth: GmailAuthData): EmailAccount {
    const email = gmailAuth.user?.email || (gmailAuth.gmail?.email as string) || '';
    const displayName = gmailAuth.user?.name || email;

    const account: EmailAccount = {
      email: typeof email === 'string' ? email : '',
      displayName: typeof displayName === 'string' ? displayName : '',
      provider: 'Gmail',
      username: typeof email === 'string' ? email : '',
      password: '', // OAuth doesn't use password
      imapHost: 'imap.gmail.com',
      imapPort: 993,
      smtpHost: 'smtp.gmail.com',
      smtpPort: 465,
      secure: true,
      lastLogin: gmailAuth.loginTime,
      isActive: true,
      accessToken: gmailAuth.tokens.access_token
    };

    if (gmailAuth.tokens.refresh_token) {
      account.refreshToken = gmailAuth.tokens.refresh_token;
    }

    if (gmailAuth.tokens.expiry_date) {
      account.tokenExpiry = new Date(gmailAuth.tokens.expiry_date).toISOString();
    }

    return account;
  }

  /**
   * 同步Gmail授权数据到accounts数组
   */
  static async syncGmailAuthsToAccounts(): Promise<void> {
    const storage = await EmailStorage.readStorage();

    if (!storage.gmailAuths || storage.gmailAuths.length === 0) {
      return;
    }

    // 将每个Gmail授权转换为账户
    for (const gmailAuth of storage.gmailAuths) {
      const account = EmailStorage.convertGmailAuthToAccount(gmailAuth);

      // 检查账户是否已存在
      const existingIndex = storage.accounts.findIndex(acc => acc.email === account.email);

      if (existingIndex >= 0) {
        // 更新现有账户
        storage.accounts[existingIndex] = account;
      } else {
        // 添加新账户
        storage.accounts.push(account);
      }
    }

    // 如果没有默认账户且有账户存在，设置第一个为默认
    if (!storage.defaultAccount && storage.accounts.length > 0) {
      storage.defaultAccount = storage.accounts[0].email;
    }

    await EmailStorage.writeStorage(storage);
    Logger.info('Gmail auths synced to accounts');
  }

  /**
   * 检查并清理过期的OAuth令牌
   */
  static async checkAndCleanExpiredTokens(): Promise<void> {
    try {
      const storage = await EmailStorage.readStorage();
      
      // 安全检查：确保 accounts 数组存在
      if (!storage || !Array.isArray(storage.accounts)) {
        Logger.warn('Invalid storage structure in checkAndCleanExpiredTokens, skipping token cleanup');
        return;
      }
      
      let hasChanges = false;

      for (let i = 0; i < storage.accounts.length; i++) {
      const account = storage.accounts[i];
      if (account.provider === 'Gmail' && account.tokenExpiry) {
        const expiryDate = new Date(account.tokenExpiry);
        const now = new Date();
        // If token has expired more than 1 hour ago, try to refresh it
        if (expiryDate.getTime() < now.getTime() - 60 * 55 * 1000) {
          Logger.warn(`OAuth token expired for account: ${account.email}, attempting refresh...`);

          try {
            // Try to refresh the token
            const refreshSuccess = await EmailStorage.attemptTokenRefresh(account);
            if (refreshSuccess) {
              Logger.info(`Successfully refreshed token for account: ${account.email}`);
              // Explicitly update the account in the storage array
              storage.accounts[i] = account;
              hasChanges = true;
            } else {
              Logger.warn(`Failed to refresh token for account: ${account.email}, marking as inactive`);
              account.isActive = false;
              storage.accounts[i] = account;
              hasChanges = true;
            }
          } catch (error) {
            Logger.error(`Error refreshing token for account: ${account.email}`, error);
            account.isActive = false;
            storage.accounts[i] = account;
            hasChanges = true;
          }
        }
      }
    }

      if (hasChanges) {
        await EmailStorage.writeStorage(storage);
        Logger.info('Completed OAuth token cleanup and refresh attempts');
      }
    } catch (error) {
      Logger.error('Error in checkAndCleanExpiredTokens, continuing with startup', error);
      // 不要抛出错误，让应用继续启动
    }
  }

  /**
   * 尝试刷新单个账户的OAuth令牌
   */
  static async attemptTokenRefresh(account: EmailAccount): Promise<boolean> {
    if (!account.refreshToken) {
      Logger.warn(`No refresh token available for account: ${account.email}`);
      return false;
    }

    try {
      // First try the local refresh endpoint
      const response = await fetch(GMAIL_TOKEN_REFRESH_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          email: account.email,
          refresh_token: account.refreshToken
        })
      });

      if (response.ok) {
        const { data } = await response.json();
        // Update account with new token data
        account.accessToken = data.access_token;
        account.tokenExpiry = new Date(data.expiry_date).toISOString();
        account.lastLogin = new Date().toISOString();
        account.isActive = true;

        if (data.refresh_token) {
          account.refreshToken = data.refresh_token;
        }

        return true;
      }

      // If local endpoint fails, try direct Google OAuth refresh
      const { Config } = await import('./config.js');
      const oauthConfig = Config.getGoogleOAuthConfig();

      if (!oauthConfig.clientId || !oauthConfig.clientSecret) {
        Logger.warn(`Google OAuth configuration missing for account: ${account.email}`);
        return false;
      }

      const oauthResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: account.refreshToken,
          client_id: oauthConfig.clientId,
          client_secret: oauthConfig.clientSecret
        })
      });

      if (!oauthResponse.ok) {
        Logger.warn(`Direct OAuth refresh failed for account: ${account.email} - ${oauthResponse.status}`);
        return false;
      }

      const oauthData = await oauthResponse.json();

      if (oauthData.error) {
        Logger.warn(`OAuth refresh error for account: ${account.email} - ${oauthData.error}`);
        return false;
      }

      // Update account with new token data
      const expiryTime = new Date();
      expiryTime.setSeconds(expiryTime.getSeconds() + (oauthData.expires_in || 3600));

      account.accessToken = oauthData.access_token;
      account.tokenExpiry = expiryTime.toISOString();
      account.lastLogin = new Date().toISOString();

      if (oauthData.refresh_token) {
        account.refreshToken = oauthData.refresh_token;
      }

      return true;

    } catch (error) {
      Logger.error(`Exception during token refresh for account: ${account.email}`, error);
      return false;
    }
  }

  /**
   * 检查账户令牌是否需要刷新
   */
  static async checkTokenExpiry(emailOrDisplayName: string): Promise<{
    isExpired: boolean;
    expiresIn: number; // milliseconds
    needsRefresh: boolean;
  }> {
    const account = await EmailStorage.getAccount(emailOrDisplayName);

    if (!account || account.provider !== 'Gmail' || !account.tokenExpiry) {
      return {
        isExpired: false,
        expiresIn: Infinity,
        needsRefresh: false
      };
    }

    const expiryDate = new Date(account.tokenExpiry);
    const now = new Date();
    const expiresIn = expiryDate.getTime() - now.getTime();

    return {
      isExpired: expiresIn <= 0,
      expiresIn,
      needsRefresh: expiresIn < 5 * 60 * 1000 // Less than 5 minutes
    };
  }
} 