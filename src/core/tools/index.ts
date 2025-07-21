/**
 * 工具注册器
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Tool } from '../types.js';
import { HelloTool } from './hello.tool.js';
import { ServerInfoTool } from './server-info.tool.js';
import { EmailLoginTool } from './email-login.tool.js';
import { EmailQueryTool } from './email-query.tool.js';
import { EmailSendTool } from './email-send.tool.js';
import { EmailDetailTool } from './email-detail.tool.js';

export class ToolRegistry {
  private tools: Tool[] = [];

  constructor() {
    // 注册默认工具
    this.register(new HelloTool());
    this.register(new ServerInfoTool());
    
    // 注册邮件工具
    this.register(new EmailLoginTool());
    this.register(new EmailQueryTool());
    this.register(new EmailSendTool());
    this.register(new EmailDetailTool());
  }

  register(tool: Tool): void {
    this.tools.push(tool);
  }

  registerToServer(server: McpServer): void {
    for (const tool of this.tools) {
      server.registerTool(
        tool.name,
        {
          title: tool.title,
          description: tool.description,
          inputSchema: tool.inputSchema
        },
        async (args: Record<string, unknown>) => {
          return await tool.handler(args);
        }
      );
    }
  }

  getTools(): Tool[] {
    return this.tools;
  }
}