/**
 * 常量定义
 */
import 'dotenv/config'

export const TRANSPORT_TYPES = {
  STDIO: 'stdio',
  HTTP_SSE: 'http-sse',
  STREAMABLE_HTTP: 'streamable-http',
  BACKWARD_COMPATIBLE: 'backward-compatible'
} as const;

export const HTTP_ENDPOINTS = {
  MCP: '/mcp',
  SSE: '/sse',
  MESSAGES: '/messages',
  HEALTH: '/health'
} as const;

export const DEFAULT_PORTS = {
  HTTP_SSE: 3000,
  STREAMABLE_HTTP: 3001,
  BACKWARD_COMPATIBLE: 3002
} as const;

export type TransportType = typeof TRANSPORT_TYPES[keyof typeof TRANSPORT_TYPES];

export const GMAIL_OAUTH_URL = process.env.SERVICE_HOST && process.env.GMAIL_AUTH_ENDPOINT ? `${process.env.SERVICE_HOST}${process.env.GMAIL_AUTH_ENDPOINT}` as const : 'https://mailauth.mailmcp.de/api/auth/gmail-oauth';

export const GMAIL_TOKEN_REFRESH_ENDPOINT = process.env.SERVICE_HOST && process.env.GMAIL_TOKEN_REFRESH_ENDPOINT ? `${process.env.SERVICE_HOST}${process.env.GMAIL_TOKEN_REFRESH_ENDPOINT}` as const : 'https://mailauth.mailmcp.de/api/auth/refresh-token';