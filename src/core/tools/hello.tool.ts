/**
 * Hello 工具实现
 */

import { z } from 'zod';
import { Tool } from '../types.js';

export class HelloTool implements Tool {
  name = 'hello';
  title = 'Hello MCP';
  description = 'A simple tool that returns "hello mcp" message';
  inputSchema = {
    name: z.string().optional()
  };

  async handler({ name }: { name?: string }): Promise<any> {
    const greeting = name ? `hello mcp, ${name}!` : 'hello mcp';
    return {
      content: [{ type: 'text', text: greeting }]
    };
  }
}