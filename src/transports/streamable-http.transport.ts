/**
 * Streamable HTTP 传输层实现（无 SSE）
 */

import express from 'express';
import cors from 'cors';
import { randomUUID } from 'crypto';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { BaseTransport } from './base.transport.js';
import { Logger } from '../utils/logger.js';
import { HTTP_ENDPOINTS } from '../utils/constants.js';
import { MCPServerFactory } from '../core/server.js';

export class StreamableHttpTransport extends BaseTransport {
  private transports: { [sessionId: string]: StreamableHTTPServerTransport } = {};

  async start(port: number = 3001): Promise<void> {
    Logger.info(`Starting MCP server with Streamable HTTP transport on port ${port}...`);

    const app = express();
    app.use(express.json());
    app.use(cors({
      origin: '*',
      exposedHeaders: ['Mcp-Session-Id'],
      allowedHeaders: ['Content-Type', 'mcp-session-id']
    }));

    this.setupRoutes(app);

    app.listen(port, () => {
      this.logStartup('Streamable HTTP', port);
      Logger.info(`Health check: http://localhost:${port}${HTTP_ENDPOINTS.HEALTH}`);
    });
  }

  private setupRoutes(app: express.Application): void {
    // POST requests
    app.post(HTTP_ENDPOINTS.MCP, async (req, res) => {
      const sessionId = req.headers['mcp-session-id'] as string | undefined;
      let transport: StreamableHTTPServerTransport;

      if (sessionId && this.transports[sessionId]) {
        transport = this.transports[sessionId];
      } else {
        transport = await this.createTransport();
      }

      await transport.handleRequest(req, res, req.body);
    });

    // SSE not supported (return 405)
    app.get(HTTP_ENDPOINTS.MCP, async (_req, res) => {
      res.status(405).json({
        jsonrpc: '2.0',
        error: {
          code: -32000,
          message: 'Method not allowed. This server only supports Streamable HTTP transport.'
        },
        id: null
      });
    });

    // Session termination
    app.delete(HTTP_ENDPOINTS.MCP, async (req, res) => {
      const sessionId = req.headers['mcp-session-id'] as string | undefined;
      if (!sessionId || !this.transports[sessionId]) {
        res.status(400).send('Invalid or missing session ID');
        return;
      }

      const transport = this.transports[sessionId];
      await transport.handleRequest(req, res);
    });

    // Health check endpoint
    app.get(HTTP_ENDPOINTS.HEALTH, (_req, res) => {
      res.json({
        status: 'healthy',
        transport: 'streamable-http',
        timestamp: new Date().toISOString()
      });
    });
  }

  private async createTransport(): Promise<StreamableHTTPServerTransport> {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (sessionId) => {
        this.transports[sessionId] = transport;
      }
    });

    transport.onclose = () => {
      if (transport.sessionId) {
        delete this.transports[transport.sessionId];
      }
    };

    const server = MCPServerFactory.create();
    await server.connect(transport);

    return transport;
  }
}