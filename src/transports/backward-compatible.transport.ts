/**
 * 向后兼容传输层实现（同时支持 Streamable HTTP 和 SSE）
 */

import express from 'express';
import cors from 'cors';
import { randomUUID } from 'crypto';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { BaseTransport } from './base.transport.js';
import { Logger } from '../utils/logger.js';
import { HTTP_ENDPOINTS } from '../utils/constants.js';
import { MCPServerFactory } from '../core/server.js';

interface TransportStore {
  streamable: Record<string, StreamableHTTPServerTransport>;
  sse: Record<string, SSEServerTransport>;
}

export class BackwardCompatibleTransport extends BaseTransport {
  private transports: TransportStore = {
    streamable: {},
    sse: {}
  };

  async start(port: number = 3002): Promise<void> {
    Logger.info(`Starting MCP server with backward compatible transport on port ${port}...`);

    const app = express();
    app.use(express.json());
    app.use(cors({
      origin: '*',
      exposedHeaders: ['Mcp-Session-Id'],
      allowedHeaders: ['Content-Type', 'mcp-session-id']
    }));

    this.setupRoutes(app);

    app.listen(port, () => {
      this.logStartup('backward compatible', port);
      Logger.info(`Modern endpoint: http://localhost:${port}${HTTP_ENDPOINTS.MCP}`);
      Logger.info(`Legacy SSE endpoint: http://localhost:${port}${HTTP_ENDPOINTS.SSE}`);
      Logger.info(`Health check: http://localhost:${port}${HTTP_ENDPOINTS.HEALTH}`);
    });
  }

  private setupRoutes(app: express.Application): void {
    // Modern Streamable HTTP endpoint
    app.all(HTTP_ENDPOINTS.MCP, async (req, res) => {
      const sessionId = req.headers['mcp-session-id'] as string | undefined;
      let transport: StreamableHTTPServerTransport;

      if (sessionId && this.transports.streamable[sessionId]) {
        transport = this.transports.streamable[sessionId];
      } else {
        transport = await this.createStreamableTransport();
      }

      await transport.handleRequest(req, res, req.body);
    });

    // Legacy SSE endpoint
    app.get(HTTP_ENDPOINTS.SSE, async (_req, res) => {
      const transport = new SSEServerTransport(HTTP_ENDPOINTS.MESSAGES, res);
      this.transports.sse[transport.sessionId] = transport;

      res.on('close', () => {
        delete this.transports.sse[transport.sessionId];
      });

      const server = MCPServerFactory.create();
      await server.connect(transport);
    });

    // Legacy messages endpoint
    app.post(HTTP_ENDPOINTS.MESSAGES, async (req, res) => {
      const sessionId = req.query.sessionId as string;
      const transport = this.transports.sse[sessionId];
      
      if (transport) {
        await transport.handlePostMessage(req, res, req.body);
      } else {
        res.status(400).send('No transport found for sessionId');
      }
    });

    // Health check endpoint
    app.get(HTTP_ENDPOINTS.HEALTH, (_req, res) => {
      res.json({
        status: 'healthy',
        transport: 'backward-compatible',
        supportedTransports: ['streamable-http', 'sse'],
        timestamp: new Date().toISOString()
      });
    });
  }

  private async createStreamableTransport(): Promise<StreamableHTTPServerTransport> {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (sessionId) => {
        this.transports.streamable[sessionId] = transport;
      }
    });

    transport.onclose = () => {
      if (transport.sessionId) {
        delete this.transports.streamable[transport.sessionId];
      }
    };

    const server = MCPServerFactory.create();
    await server.connect(transport);

    return transport;
  }
}