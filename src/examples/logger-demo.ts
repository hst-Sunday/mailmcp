import { Logger, LogLevel } from '../utils/logger.js';

async function demonstrateLogger() {
  Logger.info('=== Logger 功能演示 ===\n');

  // 1. 基本日志功能
  Logger.info('1. 基本日志功能：');
  Logger.debug('这是调试信息');
  Logger.info('这是普通信息');
  Logger.warn('这是警告信息');
  Logger.error('这是错误信息');
  Logger.info('');

  // 2. 演示不同的日志级别
  Logger.info('2. 设置日志级别为 ERROR（只显示错误）：');
  Logger.setLogLevel(LogLevel.ERROR);
  Logger.debug('这条调试信息不会显示');
  Logger.info('这条普通信息不会显示');
  Logger.warn('这条警告信息不会显示');
  Logger.error('只有这条错误信息会显示');
  
  // 临时恢复日志级别以显示说明信息
  Logger.setLogLevel(LogLevel.INFO);
  Logger.info('');

  // 3. 重置日志级别
  Logger.info('3. 重置日志级别为 INFO：');
  Logger.setLogLevel(LogLevel.INFO);
  Logger.debug('这条调试信息不会显示');
  Logger.info('这条普通信息会显示');
  Logger.warn('这条警告信息会显示');
  Logger.error('这条错误信息会显示');
  Logger.info('');

  // 4. 演示不同传输模式
  Logger.info('4. 演示不同传输模式：');
  
  Logger.info('模拟 stdio 模式（所有日志输出到 stderr）：');
  Logger.setTransport('stdio');
  Logger.info('在 stdio 模式下，这条信息输出到 stderr');
  Logger.error('在 stdio 模式下，这条错误也输出到 stderr');
  Logger.info('');

  Logger.info('模拟 http-sse 模式（INFO 输出到 stdout，ERROR 输出到 stderr）：');
  Logger.setTransport('http-sse');
  Logger.info('在 http-sse 模式下，这条信息输出到 stdout');
  Logger.error('在 http-sse 模式下，这条错误输出到 stderr');
  Logger.info('');

  // 5. 演示日志开关
  Logger.info('5. 演示日志开关：');
  Logger.setEnabled(false);
  Logger.info('这条信息不会显示（日志已禁用）');
  Logger.error('这条错误也不会显示（日志已禁用）');
  
  Logger.setEnabled(true);
  Logger.info('重新启用日志后，这条信息会显示');
  Logger.info('');

  // 6. 演示带参数的日志
  Logger.info('6. 演示带参数的日志：');
  const user = { name: 'Alice', id: 123 };
  Logger.info('用户登录:', user);
  Logger.error('连接失败，错误代码:', 500, '详细信息:', { endpoint: '/api/users' });
  Logger.info('');

  Logger.info('=== 演示完毕 ===');
}

// 运行演示
demonstrateLogger().catch(Logger.error); 