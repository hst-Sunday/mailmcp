# ImapFlow 邮件正文获取完整指南

本文档详细说明如何使用 ImapFlow 正确获取邮件正文内容。

## 🔧 核心修复

### 1. Flags 类型错误修复

**错误代码:**
```javascript
console.log(message.flags?.join(', ')); // ❌ 错误：flags 是 Set 不是数组
```

**正确代码:**
```javascript
console.log(message.flags ? Array.from(message.flags).join(', ') : 'None'); // ✅ 正确
```

**原因:** 在 ImapFlow 中，`flags` 是 `Set<string>` 类型，不是数组。

## 📧 获取邮件正文的三种主要方法

### 方法 1: 使用 bodyParts 参数 (推荐)

```javascript
// 在 fetch 调用中指定要获取的部分
for await (const message of client.fetch([uid], {
  envelope: true,
  bodyStructure: true,
  bodyParts: ['TEXT', '1', '1.1', '1.2'] // 指定要获取的部分标识符
}, { uid: true })) {
  
  // bodyParts 是一个 Map<string, Buffer>
  const textContent = message.bodyParts.get('TEXT');
  if (textContent) {
    console.log(textContent.toString('utf8'));
  }
  
  // 遍历所有获取到的部分
  for (const [partId, content] of message.bodyParts.entries()) {
    console.log(`Part ${partId}: ${content.toString('utf8')}`);
  }
}
```

### 方法 2: 使用 download 方法

```javascript
// 下载特定的邮件部分
const {meta, content} = await client.download(uid, '1.1', { uid: true });

// 读取流内容
const chunks = [];
for await (const chunk of content) {
  chunks.push(chunk);
}
const textContent = Buffer.concat(chunks).toString('utf8');
console.log(textContent);

// 或下载完整消息
const {content: fullContent} = await client.download(uid, null, { uid: true });
```

### 方法 3: 使用 source 参数

```javascript
for await (const message of client.fetch([uid], {
  source: true // 获取完整的 RFC822 格式消息
}, { uid: true })) {
  console.log(message.source.toString());
}
```

## 🏗️ 理解邮件结构

邮件通常采用 MIME 多部分结构：

```
邮件结构示例:
├── 1 (multipart/alternative)
│   ├── 1.1 (text/plain)     ← 纯文本版本
│   └── 1.2 (text/html)      ← HTML版本
├── 2 (image/png)            ← 内联图片
└── 3 (application/pdf)      ← 附件
```

**常见的部分标识符:**
- `TEXT` - 尝试获取纯文本内容
- `1` - 第一个部分（通常是主要内容）
- `1.1` - 第一个子部分（通常是 text/plain）
- `1.2` - 第二个子部分（通常是 text/html）
- `2`, `3`, ... - 其他部分（可能是附件）

## 💡 最佳实践

### 1. 智能内容获取策略

```javascript
async function getEmailContent(client, uid) {
  // 第一步：尝试获取常见的文本部分
  for await (const message of client.fetch([uid], {
    bodyParts: ['TEXT', '1', '1.1', '1.2']
  }, { uid: true })) {
    
    // 优先级排序：TEXT > 1.1 > 1.2 > 1
    const priorities = ['TEXT', '1.1', '1.2', '1'];
    
    for (const partId of priorities) {
      const content = message.bodyParts.get(partId);
      if (content) {
        let text = content.toString('utf8');
        
        // 如果是HTML，转换为纯文本
        if (text.includes('<html>') || text.includes('<body>')) {
          text = stripHtmlTags(text);
        }
        
        return text;
      }
    }
  }
  
  // 第二步：如果上述方法失败，分析邮件结构
  return await getContentByStructureAnalysis(client, uid);
}
```

### 2. 邮件结构分析

```javascript
function analyzeBodyStructure(structure) {
  const parts = [];
  
  function traverse(node, part = '1') {
    if (Array.isArray(node)) {
      node.forEach((child, index) => {
        traverse(child, `${part}.${index + 1}`);
      });
    } else if (node && node.type) {
      parts.push({
        part: part,
        contentType: `${node.type}/${node.subtype}`,
        size: node.size,
        encoding: node.encoding
      });
      
      if (node.childNodes) {
        node.childNodes.forEach((child, index) => {
          traverse(child, `${part}.${index + 1}`);
        });
      }
    }
  }
  
  traverse(structure);
  return parts;
}
```

### 3. HTML 转纯文本

```javascript
function stripHtmlTags(html) {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}
```

## ⚠️ 常见陷阱

### 1. 错误的类型假设
```javascript
// ❌ 错误：假设 flags 是数组
message.flags.join(', ')

// ✅ 正确：flags 是 Set
Array.from(message.flags).join(', ')
```

### 2. 未处理 Buffer 类型
```javascript
// ❌ 错误：直接使用 Buffer
console.log(content.substring(0, 100));

// ✅ 正确：转换为字符串
console.log(content.toString('utf8').substring(0, 100));
```

### 3. 忽略异步流处理
```javascript
// ❌ 错误：直接使用流
console.log(content);

// ✅ 正确：收集流数据
const chunks = [];
for await (const chunk of content) {
  chunks.push(chunk);
}
const fullContent = Buffer.concat(chunks).toString('utf8');
```

## 🧪 完整示例

这里是一个完整的实现示例：

```javascript
import { ImapFlow } from 'imapflow';

async function fetchEmailContent(config, uid) {
  const client = new ImapFlow(config);
  
  try {
    await client.connect();
    const lock = await client.getMailboxLock('INBOX');
    
    try {
      // 方法1：直接获取常见部分
      for await (const message of client.fetch([uid], {
        envelope: true,
        bodyStructure: true,
        flags: true,
        bodyParts: ['TEXT', '1', '1.1', '1.2']
      }, { uid: true })) {
        
        console.log('基本信息:');
        console.log(`UID: ${message.uid}`);
        console.log(`主题: ${message.envelope.subject}`);
        console.log(`标志: ${Array.from(message.flags).join(', ')}`);
        
        // 获取文本内容
        let textContent = '';
        for (const [partId, content] of message.bodyParts.entries()) {
          if (partId === 'TEXT' || partId === '1.1') {
            textContent = content.toString('utf8');
            break;
          }
        }
        
        if (textContent) {
          console.log('邮件内容:');
          console.log(textContent.substring(0, 500) + '...');
        } else {
          console.log('未找到可读的文本内容');
        }
      }
      
    } finally {
      lock.release();
    }
    
  } finally {
    await client.logout();
  }
}
```

## 📋 测试验证

运行我们提供的测试脚本来验证实现：

```bash
# 构建项目
npm run build

# 运行 UID 获取测试
npm run test:uid-fetch

# 查看帮助
node test/test-imapflow-fetch-by-uid.js --help
```

## 🔗 相关资源

- [ImapFlow 官方文档](https://imapflow.com/)
- [IMAP 协议规范 RFC 3501](https://tools.ietf.org/html/rfc3501)
- [MIME 格式规范 RFC 2045](https://tools.ietf.org/html/rfc2045)

---

通过这个指南，你应该能够正确地使用 ImapFlow 获取各种格式的邮件正文内容，并避免常见的类型错误。 