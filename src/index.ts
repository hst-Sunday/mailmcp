/**
 * 应用入口
 */

import { Application } from './app.js';

// 导出公共 API
export { Logger, LogLevel } from './utils/logger.js';
export { Config } from './utils/config.js';
export { MCPServerFactory } from './core/server.js';
export { TransportFactory } from './transports/index.js';
export { ToolRegistry } from './core/tools/index.js';
export * from './core/types.js';

// CLI 入口
if (import.meta.url === `file://${process.argv[1]}`) {
  const app = new Application();
  app.setupErrorHandlers();
  app.run(process.argv.slice(2)).catch(console.error);
}