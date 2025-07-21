/**
 * 应用主程序
 */

import { MCPServerFactory } from './core/server.js';
import { EmailStorage } from './utils/storage.js';
import { Logger, LogLevel } from './utils/logger.js';
import { Config } from './utils/config.js';
import { LoginServer } from './utils/login-server.js';
import { TransportFactory } from './transports/index.js';
import { TransportType } from './utils/constants.js';

export class Application {
  private loginServer: LoginServer | null = null;

  async run(args: string[] = []): Promise<void> {
    const config = Config.getConfig(args);
    
    // 配置日志系统
    Logger.configure({
      transport: config.transport,
      level: LogLevel.INFO,
      enabled: true
    });

    // 输出启动信息
    Logger.info(`MCP Server starting with transport: ${config.transport}`);
    Logger.info(`Available transports: ${Config.getAvailableTransports().join(', ')}`);
    Logger.info('');

    // 验证传输类型
    if (!Config.isValidTransport(config.transport)) {
      Logger.error(`Unknown transport: ${config.transport}`);
      Logger.error(`Available transports: ${Config.getAvailableTransports().join(', ')}`);
      process.exit(1);
    }

    try {
      // Initialize storage and clean up expired tokens
      Logger.info('Initializing email storage and cleaning up expired tokens...');
      await EmailStorage.checkAndCleanExpiredTokens();
      
      // 启动登录服务器
      Logger.info('Starting login server...');
      this.loginServer = new LoginServer();
      await this.loginServer.start();
      
      // 创建服务器和传输层
      const server = MCPServerFactory.create();
      const transport = TransportFactory.create(config.transport as TransportType, server);
      
      // 启动传输层
      await transport.start(config.port);
    } catch (error) {
      Logger.error('Failed to start servers:', error);
      await this.cleanup();
      process.exit(1);
    }
  }

  private async cleanup(): Promise<void> {
    if (this.loginServer) {
      Logger.info('Stopping login server...');
      await this.loginServer.stop();
      this.loginServer = null;
    }
  }

  setupErrorHandlers(): void {
    process.on('unhandledRejection', async (reason, promise) => {
      Logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
      await this.cleanup();
      process.exit(1);
    });

    process.on('uncaughtException', async (error) => {
      Logger.error('Uncaught Exception:', error);
      await this.cleanup();
      process.exit(1);
    });

    process.on('SIGINT', async () => {
      Logger.info('\nReceived SIGINT, shutting down gracefully...');
      await this.cleanup();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      Logger.info('Received SIGTERM, shutting down gracefully...');
      await this.cleanup();
      process.exit(0);
    });
  }
}