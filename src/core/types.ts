/**
 * 核心类型定义
 */

import { z } from 'zod';

export interface ToolResponse {
  [x: string]: unknown;
  content: Array<{
    type: 'text';
    text: string;
  }>;
}

export interface Tool {
  name: string;
  title: string;
  description: string;
  inputSchema: z.ZodRawShape;
  handler: (args: Record<string, unknown>) => Promise<ToolResponse>;
}

export interface ServerInfo {
  name: string;
  version: string;
  description: string;
  supportedTransports: string[];
  timestamp: string;
}