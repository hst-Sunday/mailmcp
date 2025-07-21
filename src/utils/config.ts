/**
 * 配置管理模块
 */

export interface ServerConfig {
  transport: string;
  port: number;
  name: string;
  version: string;
  description: string;
}

export interface GoogleOAuthConfig {
  clientId?: string;
  clientSecret?: string;
  redirectUri?: string;
}

export class Config {
  private static readonly DEFAULT_CONFIG: ServerConfig = {
    transport: 'stdio',
    port: 3000,
    name: 'hello-mcp-server',
    version: '1.0.0',
    description: 'A demo MCP server supporting stdio, SSE, and streamable HTTP transports'
  };

  static getConfig(args: string[] = []): ServerConfig {
    const transport = args[0] || process.env.MCP_TRANSPORT || this.DEFAULT_CONFIG.transport;
    const port = parseInt(args[1] || process.env.PORT || this.DEFAULT_CONFIG.port.toString());

    return {
      ...this.DEFAULT_CONFIG,
      transport,
      port
    };
  }

  static getGoogleOAuthConfig(): GoogleOAuthConfig {
    return {
      clientId: process.env.GOOGLE_CLIENT_ID || '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
      redirectUri: process.env.GOOGLE_REDIRECT_URI || 'urn:ietf:wg:oauth:2.0:oob'
    };
  }

  static getAvailableTransports(): string[] {
    return ['stdio', 'http-sse', 'streamable-http', 'backward-compatible'];
  }

  static isValidTransport(transport: string): boolean {
    return this.getAvailableTransports().includes(transport);
  }
}