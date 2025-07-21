/**
 * Server Info 工具实现
 */

import { Tool, ServerInfo } from '../types.js';
import { Config } from '../../utils/config.js';

export class ServerInfoTool implements Tool {
  name = 'server-info';
  title = 'Server Information';
  description = 'Get information about the MCP server';
  inputSchema = {};

  async handler(): Promise<any> {
    const config = Config.getConfig();
    const serverInfo: ServerInfo = {
      name: config.name,
      version: config.version,
      description: config.description,
      supportedTransports: Config.getAvailableTransports(),
      timestamp: new Date().toISOString()
    };

    return {
      content: [{
        type: 'text',
        text: JSON.stringify(serverInfo, null, 2)
      }]
    };
  }
}