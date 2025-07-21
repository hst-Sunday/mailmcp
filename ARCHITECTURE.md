# MCP Server 项目架构设计

## 项目概述

这是一个支持多种传输方式的 MCP (Model Context Protocol) 服务器实现，提供了模块化、可扩展的架构设计。

## 架构原则

1. **单一职责原则**: 每个模块只负责一个功能领域
2. **依赖倒置原则**: 高层模块不依赖低层模块，都依赖抽象
3. **开闭原则**: 对扩展开放，对修改关闭
4. **关注点分离**: 传输层、业务逻辑、工具实现相互独立

## 目录结构

```
src/
├── core/                    # 核心业务逻辑
│   ├── server.ts           # MCP服务器创建和配置
│   ├── tools/              # 工具注册和实现
│   │   ├── index.ts        # 工具注册器
│   │   ├── hello.tool.ts   # Hello工具实现
│   │   └── server-info.tool.ts # 服务器信息工具
│   └── types.ts            # 核心类型定义
│
├── transports/             # 传输层实现
│   ├── index.ts           # 传输层工厂和导出
│   ├── base.transport.ts  # 传输层基类
│   ├── stdio.transport.ts # Stdio传输实现
│   ├── http-sse.transport.ts # HTTP+SSE传输实现
│   ├── streamable-http.transport.ts # Streamable HTTP传输实现
│   └── backward-compatible.transport.ts # 向后兼容传输实现
│
├── utils/                  # 工具类
│   ├── logger.ts          # 日志系统
│   ├── config.ts          # 配置管理
│   └── constants.ts       # 常量定义
│
├── examples/              # 示例代码
│   ├── client.ts          # 客户端测试示例
│   └── logger-demo.ts     # 日志系统演示
│
├── index.ts               # 应用入口（导出API）
└── app.ts                 # 应用主逻辑（CLI入口）
```

## 模块职责

### Core 模块

**server.ts**
- 创建和配置 MCP 服务器实例
- 管理工具注册
- 处理服务器生命周期

**tools/**
- 定义工具接口
- 实现具体工具逻辑
- 提供工具注册机制

### Transports 模块

**base.transport.ts**
- 定义传输层抽象接口
- 提供公共功能实现

**各传输层实现**
- 封装特定传输方式的逻辑
- 处理连接管理
- 实现协议特定功能

### Utils 模块

**logger.ts**
- 智能日志输出（根据传输模式选择输出流）
- 日志级别管理
- 日志格式化

**config.ts**
- 环境变量管理
- 默认配置值
- 配置验证

## 数据流

```
CLI/入口 → App → TransportFactory → 具体Transport → MCPServer
                                                        ↓
                                                    Tools注册
```

## 扩展点

1. **新增传输方式**: 在 `transports/` 目录下实现新的传输类
2. **新增工具**: 在 `core/tools/` 目录下添加新的工具实现
3. **自定义日志**: 扩展 `Logger` 类或实现自定义日志处理器

## 配置管理

支持以下配置方式（优先级从高到低）：
1. 命令行参数
2. 环境变量
3. 配置文件（可选）
4. 默认值

## 错误处理

- 统一的错误处理机制
- 优雅的关闭流程
- 详细的错误日志

## 测试策略

- 单元测试：测试各个模块的独立功能
- 集成测试：测试传输层与服务器的集成
- 端到端测试：使用示例客户端测试完整流程