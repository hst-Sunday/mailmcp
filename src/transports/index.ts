/**
 * 传输层工厂
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { BaseTransport } from './base.transport.js';
import { StdioTransport } from './stdio.transport.js';
import { HttpSseTransport } from './http-sse.transport.js';
import { StreamableHttpTransport } from './streamable-http.transport.js';
import { BackwardCompatibleTransport } from './backward-compatible.transport.js';
import { TRANSPORT_TYPES, TransportType } from '../utils/constants.js';

export class TransportFactory {
  static create(type: TransportType, server: McpServer): BaseTransport {
    switch (type) {
      case TRANSPORT_TYPES.STDIO:
        return new StdioTransport(server);
      case TRANSPORT_TYPES.HTTP_SSE:
        return new HttpSseTransport(server);
      case TRANSPORT_TYPES.STREAMABLE_HTTP:
        return new StreamableHttpTransport(server);
      case TRANSPORT_TYPES.BACKWARD_COMPATIBLE:
        return new BackwardCompatibleTransport(server);
      default:
        throw new Error(`Unknown transport type: ${type}`);
    }
  }
}

export { BaseTransport } from './base.transport.js';