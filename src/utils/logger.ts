/**
 * 智能日志系统
 * 根据传输模式自动选择输出流，避免在 stdio 模式下干扰 JSON-RPC 通信
 */

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3
}

export interface LoggerConfig {
  transport?: string;
  level?: LogLevel;
  enabled?: boolean;
}

export class Logger {
  private static currentTransport: string = 'stdio';
  private static logLevel: LogLevel = LogLevel.INFO;
  private static enabled: boolean = true;

  static configure(config: LoggerConfig): void {
    if (config.transport !== undefined) {
      this.currentTransport = config.transport;
    }
    if (config.level !== undefined) {
      this.logLevel = config.level;
    }
    if (config.enabled !== undefined) {
      this.enabled = config.enabled;
    }
  }

  static setTransport(transport: string): void {
    this.currentTransport = transport;
  }

  static setLogLevel(level: LogLevel): void {
    this.logLevel = level;
  }

  static setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  private static shouldLog(level: LogLevel): boolean {
    return this.enabled && level >= this.logLevel;
  }

  private static getOutputStream(level: LogLevel): typeof console.log {
    // 在 stdio 模式下，所有日志都输出到 stderr 以避免干扰 JSON-RPC 通信
    if (this.currentTransport === 'stdio') {
      return console.error;
    }
    
    // 在其他模式下，ERROR 和 WARN 输出到 stderr，其他输出到 stdout
    if (level >= LogLevel.WARN) {
      return console.error;
    }
    
    return console.log;
  }

  private static formatMessage(level: string, message: string): string {
    const timestamp = new Date().toISOString();
    return `[${timestamp}] [${level}] ${message}`;
  }

  static debug(message: string, ...args: unknown[]): void {
    if (this.shouldLog(LogLevel.DEBUG)) {
      const output = this.getOutputStream(LogLevel.DEBUG);
      output(this.formatMessage('DEBUG', message), ...args);
    }
  }

  static info(message: string, ...args: unknown[]): void {
    if (this.shouldLog(LogLevel.INFO)) {
      const output = this.getOutputStream(LogLevel.INFO);
      output(this.formatMessage('INFO', message), ...args);
    }
  }

  static warn(message: string, ...args: unknown[]): void {
    if (this.shouldLog(LogLevel.WARN)) {
      const output = this.getOutputStream(LogLevel.WARN);
      output(this.formatMessage('WARN', message), ...args);
    }
  }

  static error(message: string, ...args: unknown[]): void {
    if (this.shouldLog(LogLevel.ERROR)) {
      const output = this.getOutputStream(LogLevel.ERROR);
      output(this.formatMessage('ERROR', message), ...args);
    }
  }

  static log(message: string, ...args: unknown[]): void {
    this.info(message, ...args);
  }
}