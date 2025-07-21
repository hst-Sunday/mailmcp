/**
 * Stdio 传输层实现
 */

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { BaseTransport } from './base.transport.js';
import { Logger } from '../utils/logger.js';

export class StdioTransport extends BaseTransport {
  async start(): Promise<void> {
    Logger.info('Starting MCP server with stdio transport...');
    
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    
    this.logStartup('stdio');
  }
}