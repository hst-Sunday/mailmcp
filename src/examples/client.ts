import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { ToolResponse } from "../core/types.js";
import { Logger, LogLevel } from "../utils/logger.js";

// 测试Streamable HTTP客户端
async function testStreamableHttpClient(): Promise<void> {
  Logger.info("Testing Streamable HTTP client...");
  
  const client = new Client({
    name: "test-client",
    version: "1.0.0"
  });

  const transport = new StreamableHTTPClientTransport(
    new URL("http://localhost:3000/mcp")
  );
  // 修复类型: 保证sessionId为string
  const transportWithSession = transport as StreamableHTTPClientTransport & { sessionId: string };
  if (typeof transportWithSession.sessionId === 'undefined') {
    transportWithSession.sessionId = '';
  }

  try {
    await client.connect(transportWithSession);
    Logger.info("✓ Connected to Streamable HTTP server");

    // 列出工具
    const tools = await client.listTools();
    Logger.info("✓ Available tools:", tools.tools.map(t => t.name));

    // 调用hello工具
    const result1 = await client.callTool({
      name: "hello",
      arguments: {}
    }) as ToolResponse;
    Logger.info("✓ Hello tool result:", result1.content[0]);

    // 调用hello工具with参数
    const result2 = await client.callTool({
      name: "hello",
      arguments: {
        name: "Streamable HTTP"
      }
    }) as ToolResponse;
    Logger.info("✓ Hello tool with name:", result2.content[0]);

    // 调用server-info工具
    const result3 = await client.callTool({
      name: "server-info",
      arguments: {}
    }) as ToolResponse;
    Logger.info("✓ Server info:", JSON.parse(result3.content[0].text));

    await client.close();
    Logger.info("✓ Streamable HTTP client test completed\n");
  } catch (error) {
    Logger.error("✗ Streamable HTTP client test failed:", error);
  }
}

// 测试SSE客户端（向后兼容模式）
async function testSSEClient(): Promise<void> {
  Logger.info("Testing SSE client...");
  
  const client = new Client({
    name: "test-sse-client",
    version: "1.0.0"
  });

  const transport = new SSEClientTransport(
    new URL("http://localhost:3000/sse")
  );

  try {
    await client.connect(transport);
    Logger.info("✓ Connected to SSE server");

    // 列出工具
    const tools = await client.listTools();
    Logger.info("✓ Available tools:", tools.tools.map(t => t.name));

    // 调用hello工具
    const result1 = await client.callTool({
      name: "hello",
      arguments: {}
    }) as ToolResponse;
    Logger.info("✓ Hello tool result:", result1.content[0]);

    // 调用hello工具with参数
    const result2 = await client.callTool({
      name: "hello",
      arguments: {
        name: "SSE"
      }
    }) as ToolResponse;
    Logger.info("✓ Hello tool with name:", result2.content[0]);

    await client.close();
    Logger.info("✓ SSE client test completed\n");
  } catch (error) {
    Logger.error("✗ SSE client test failed:", error);
  }
}

// 测试向后兼容客户端（先尝试Streamable HTTP，失败后回退到SSE）
async function testBackwardCompatibleClient(): Promise<void> {
  Logger.info("Testing backward compatible client...");
  
  let client: Client | undefined = undefined;
  const baseUrl = new URL("http://localhost:3002/mcp");

  try {
    // 首先尝试Streamable HTTP
    client = new Client({
      name: 'streamable-http-client',
      version: '1.0.0'
    });
    
    const transport = new StreamableHTTPClientTransport(baseUrl);
    const transportWithSession = transport as StreamableHTTPClientTransport & { sessionId: string };
    if (typeof transportWithSession.sessionId === 'undefined') {
      transportWithSession.sessionId = '';
    }
    await client.connect(transportWithSession);
    Logger.info("✓ Connected using Streamable HTTP transport");
  } catch {
    Logger.info("- Streamable HTTP connection failed, falling back to SSE transport");
    
    // 回退到SSE
    client = new Client({
      name: 'sse-client',
      version: '1.0.0'
    });
    
    const sseTransport = new SSEClientTransport(
      new URL("http://localhost:3002/sse")
    );
    await client.connect(sseTransport);
    Logger.info("✓ Connected using SSE transport");
  }

  if (client) {
    // 测试工具
    const tools = await client.listTools();
    Logger.info("✓ Available tools:", tools.tools.map(t => t.name));

    // 调用hello工具
    const result = await client.callTool({
      name: "hello",
      arguments: {
        name: "Backward Compatible"
      }
    }) as ToolResponse;
    Logger.info("✓ Hello tool result:", result.content[0]);

    await client.close();
    Logger.info("✓ Backward compatible client test completed\n");
  }
}

// 测试stdio客户端
async function testStdioClient(): Promise<void> {
  Logger.info("Testing stdio client...");
  
  const client = new Client({
    name: "test-stdio-client",
    version: "1.0.0"
  });

  const transport = new StdioClientTransport({
    command: "node",
    args: ["node_modules/.bin/tsx", "src/index.ts", "stdio"]
  });

  try {
    await client.connect(transport);
    Logger.info("✓ Connected to stdio server");

    // 列出工具
    const tools = await client.listTools();
    Logger.info("✓ Available tools:", tools.tools.map(t => t.name));

    // 调用hello工具
    const result1 = await client.callTool({
      name: "hello",
      arguments: {}
    }) as ToolResponse;
    Logger.info("✓ Hello tool result:", result1.content[0]);

    // 调用hello工具with参数
    const result2 = await client.callTool({
      name: "hello",
      arguments: {
        name: "Stdio"
      }
    }) as ToolResponse;
    if (Array.isArray(result2.content)) {
      Logger.info("✓ Hello tool with name:", result2.content[0]);
    } else {
      Logger.info("✓ Hello tool with name: (unexpected result format)", result2);
    }

    await client.close();
    Logger.info("✓ Stdio client test completed\n");
  } catch (error) {
    Logger.error("✗ Stdio client test failed:", error);
  }
}

// 主函数
async function main(): Promise<void> {
  // 为客户端测试配置日志
  Logger.setTransport('http'); // 使用http模式，测试输出到stdout
  Logger.setLogLevel(LogLevel.INFO);
  
  Logger.info("MCP Client Test Suite");
  Logger.info("====================\n");

  const testType = process.argv[2] || 'all';

  switch (testType) {
    case 'streamable-http':
      await testStreamableHttpClient();
      break;
    case 'sse':
      await testSSEClient();
      break;
    case 'backward-compatible':
      await testBackwardCompatibleClient();
      break;
    case 'stdio':
      // 为stdio测试配置Logger
      Logger.setTransport('stdio');
      await testStdioClient();
      break;
    case 'all':
    default:
      await testStreamableHttpClient();
      await testBackwardCompatibleClient();
      await testSSEClient();
      // Note: stdio test is commented out as it would spawn a new process
      // await testStdioClient();
      break;
  }

  Logger.info("All tests completed!");
}

// 处理错误
process.on('unhandledRejection', (reason, promise) => {
  Logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  Logger.error('Uncaught Exception:', error);
  process.exit(1);
});

// 启动测试
main().catch(Logger.error); 