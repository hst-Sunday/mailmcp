/**
 * MCP 服务器核心模块
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ToolRegistry } from './tools/index.js';
import { Config } from '../utils/config.js';

export class MCPServerFactory {
  static create(): McpServer {
    const config = Config.getConfig();
    
    const server = new McpServer({
      name: config.name,
      version: config.version
    });

    // 注册工具
    const toolRegistry = new ToolRegistry();
    toolRegistry.registerToServer(server);

    return server;
  }
}