/**
 * 传输层基类
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Logger } from '../utils/logger.js';

export abstract class BaseTransport {
  protected server: McpServer;

  constructor(server: McpServer) {
    this.server = server;
  }

  abstract start(port?: number): Promise<void>;
  
  protected logStartup(transportName: string, port?: number): void {
    if (port) {
      Logger.info(`MCP server is running with ${transportName} transport on port ${port}`);
    } else {
      Logger.info(`MCP server is running with ${transportName} transport`);
    }
  }
}