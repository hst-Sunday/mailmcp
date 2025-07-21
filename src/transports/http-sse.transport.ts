/**
 * HTTP + SSE 传输层实现
 */

import express from 'express';
import cors from 'cors';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { BaseTransport } from './base.transport.js';
import { Logger } from '../utils/logger.js';
import { HTTP_ENDPOINTS } from '../utils/constants.js';
import { MCPServerFactory } from '../core/server.js';

export class HttpSseTransport extends BaseTransport {
  private transports: { [sessionId: string]: SSEServerTransport } = {};

  async start(port: number = 3000): Promise<void> {
    Logger.info(`Starting MCP server with HTTP+SSE transport on port ${port}...`);

    const app = express();
    app.use(express.json());
    app.use(cors({
      origin: '*',
      exposedHeaders: ['Mcp-Session-Id'],
      allowedHeaders: ['Content-Type', 'mcp-session-id']
    }));

    this.setupRoutes(app);

    app.listen(port, () => {
      this.logStartup('HTTP+SSE', port);
      Logger.info(`SSE endpoint: http://localhost:${port}${HTTP_ENDPOINTS.SSE}`);
      Logger.info(`Messages endpoint: http://localhost:${port}${HTTP_ENDPOINTS.MESSAGES}`);
      Logger.info(`Health check: http://localhost:${port}${HTTP_ENDPOINTS.HEALTH}`);
    });
  }

  private setupRoutes(app: express.Application): void {
    // SSE连接端点 (建立连接)
    app.get(HTTP_ENDPOINTS.SSE, async (_req, res) => {
      try {
        const transport = new SSEServerTransport(HTTP_ENDPOINTS.MESSAGES, res);
        this.transports[transport.sessionId] = transport;

        res.on('close', () => {
          Logger.info(`SSE connection closed for session: ${transport.sessionId}`);
          delete this.transports[transport.sessionId];
        });

        const server = MCPServerFactory.create();
        await server.connect(transport);
        Logger.info(`New SSE connection established with session: ${transport.sessionId}`);
      } catch (error) {
        Logger.error('Error establishing SSE connection:', error);
        res.status(500).send('Internal Server Error');
      }
    });

    // 消息处理端点 (客户端发送消息)
    app.post(HTTP_ENDPOINTS.MESSAGES, async (req, res) => {
      try {
        const sessionId = req.query.sessionId as string;
        Logger.info(`Received message for session: ${sessionId}`);
        
        if (!sessionId) {
          res.status(400).send('Missing sessionId parameter');
          return;
        }

        const transport = this.transports[sessionId];
        if (!transport) {
          res.status(400).send('No transport found for sessionId');
          return;
        }

        await transport.handlePostMessage(req, res, req.body);
      } catch (error) {
        Logger.error('Error handling message:', error);
        res.status(500).send('Internal Server Error');
      }
    });

    // Health check endpoint
    app.get(HTTP_ENDPOINTS.HEALTH, (_req, res) => {
      res.json({
        status: 'healthy',
        transport: 'http+sse',
        activeConnections: Object.keys(this.transports).length,
        endpoints: {
          sse: HTTP_ENDPOINTS.SSE,
          messages: HTTP_ENDPOINTS.MESSAGES
        },
        timestamp: new Date().toISOString()
      });
    });
  }
} 