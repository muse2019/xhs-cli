/**
 * XHS CLI Daemon
 *
 * 本地 HTTP 服务，作为 CLI 和 Chrome Extension 之间的桥梁
 * CLI 发送命令 -> Daemon -> Chrome Extension -> 执行
 */

import http from 'http';
import { URL } from 'url';

const PORT = 19826;

// 状态
let extensionConnected = false;
let commandQueue: Array<any> = [];
let commandResults: Map<number, any> = new Map();
let commandIdCounter = 0;
let lastHeartbeat = 0;

// 创建 HTTP 服务器
const server = http.createServer(async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  const url = new URL(req.url || '/', `http://localhost:${PORT}`);
  const pathname = url.pathname;

  try {
    // 路由处理
    if (pathname === '/status' && req.method === 'GET') {
      handleStatus(req, res);
    } else if (pathname === '/register' && req.method === 'POST') {
      handleRegister(req, res);
    } else if (pathname === '/heartbeat' && req.method === 'POST') {
      handleHeartbeat(req, res);
    } else if (pathname === '/poll' && req.method === 'GET') {
      handlePoll(req, res);
    } else if (pathname === '/result' && req.method === 'POST') {
      handleResult(req, res);
    } else if (pathname === '/command' && req.method === 'POST') {
      handleCommand(req, res);
    } else {
      res.writeHead(404);
      res.end(JSON.stringify({ error: 'Not found' }));
    }
  } catch (e) {
    res.writeHead(500);
    res.end(JSON.stringify({ error: String(e) }));
  }
});

// ==================== 路由处理 ====================

// GET /status - 检查状态
function handleStatus(req: http.IncomingMessage, res: http.ServerResponse) {
  res.writeHead(200);
  res.end(JSON.stringify({
    running: true,
    extensionConnected,
    lastHeartbeat,
    queueLength: commandQueue.length,
  }));
}

// POST /register - 扩展注册
function handleRegister(req: http.IncomingMessage, res: http.ServerResponse) {
  extensionConnected = true;
  lastHeartbeat = Date.now();
  console.log('[Daemon] Extension registered');
  res.writeHead(200);
  res.end(JSON.stringify({ success: true }));
}

// POST /heartbeat - 心跳
function handleHeartbeat(req: http.IncomingMessage, res: http.ServerResponse) {
  extensionConnected = true;
  lastHeartbeat = Date.now();
  res.writeHead(200);
  res.end(JSON.stringify({ success: true }));
}

// GET /poll - 扩展轮询命令
function handlePoll(req: http.IncomingMessage, res: http.ServerResponse) {
  const url = new URL(req.url || '/', `http://localhost:${PORT}`);
  const lastId = parseInt(url.searchParams.get('lastId') || '0', 10);

  // 返回 lastId 之后的新命令
  const newCommands = commandQueue.filter(cmd => cmd.id > lastId);

  res.writeHead(200);
  res.end(JSON.stringify({ commands: newCommands }));
}

// POST /result - 扩展返回结果
async function handleResult(req: http.IncomingMessage, res: http.ServerResponse) {
  const body = await readBody(req);
  const { id, result } = JSON.parse(body);

  commandResults.set(id, result);

  // 从队列中移除已完成的命令
  commandQueue = commandQueue.filter(cmd => cmd.id !== id);

  res.writeHead(200);
  res.end(JSON.stringify({ success: true }));
}

// POST /command - CLI 发送命令
async function handleCommand(req: http.IncomingMessage, res: http.ServerResponse) {
  if (!extensionConnected) {
    res.writeHead(503);
    res.end(JSON.stringify({
      error: 'Extension not connected. Please install and enable the XHS CLI Bridge extension.',
    }));
    return;
  }

  const body = await readBody(req);
  const cmd = JSON.parse(body);

  // 分配命令 ID
  const id = ++commandIdCounter;
  cmd.id = id;

  // 加入队列
  commandQueue.push(cmd);

  console.log('[Daemon] Command received:', cmd.action, 'id:', id);

  // 等待结果（最多 30 秒，带随机性避免固定模式）
  const timeout = cmd.timeout || (28000 + Math.random() * 4000);
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    if (commandResults.has(id)) {
      const result = commandResults.get(id);
      commandResults.delete(id);
      res.writeHead(200);
      res.end(JSON.stringify(result));
      return;
    }

    // 等待 80-150ms（随机化避免固定间隔检测）
    await new Promise(resolve => setTimeout(resolve, 80 + Math.random() * 70));
  }

  // 超时
  res.writeHead(504);
  res.end(JSON.stringify({ error: 'Command timeout' }));
}

// ==================== 工具函数 ====================

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

// ==================== 启动 ====================

server.listen(PORT, () => {
  console.log(`[Daemon] Listening on http://localhost:${PORT}`);
  console.log('[Daemon] Waiting for extension to connect...');
});

// 心跳检查 - 随机化间隔避免固定模式（8-12秒超时，4-6秒检查）
let heartbeatCheckInterval = 4000 + Math.random() * 2000;
const heartbeatTimeout = () => 8000 + Math.random() * 4000;

const checkHeartbeat = () => {
  const timeout = heartbeatTimeout();
  if (lastHeartbeat && Date.now() - lastHeartbeat > timeout) {
    extensionConnected = false;
    console.log('[Daemon] Extension disconnected');
  }
  // 随机化下次检查时间
  heartbeatCheckInterval = 4000 + Math.random() * 2000;
  setTimeout(checkHeartbeat, heartbeatCheckInterval);
};
setTimeout(checkHeartbeat, heartbeatCheckInterval);
