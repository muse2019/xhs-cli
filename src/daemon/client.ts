/**
 * Daemon Client - CLI 端
 *
 * 发送命令到 Daemon，由 Daemon 转发给 Chrome Extension 执行
 */

const DAEMON_PORT = 19826;
const DAEMON_URL = `http://localhost:${DAEMON_PORT}`;

export interface DaemonStatus {
  running: boolean;
  extensionConnected: boolean;
  lastHeartbeat: number;
}

/**
 * 检查 Daemon 状态
 */
export async function checkDaemonStatus(): Promise<DaemonStatus | null> {
  try {
    const response = await fetch(`${DAEMON_URL}/status`);
    return await response.json();
  } catch {
    return null;
  }
}

/**
 * 检查扩展是否已连接
 */
export async function isExtensionConnected(): Promise<boolean> {
  const status = await checkDaemonStatus();
  return status?.extensionConnected ?? false;
}

/**
 * 发送命令到 Daemon
 */
export async function sendCommand(action: string, params: Record<string, any> = {}): Promise<any> {
  const response = await fetch(`${DAEMON_URL}/command`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...params }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || `HTTP ${response.status}`);
  }

  return await response.json();
}

// ==================== 便捷方法 ====================

/**
 * 导航到 URL
 */
export async function navigate(url: string, tabId?: number): Promise<{ tabId: number; url: string }> {
  return await sendCommand('navigate', { url, tabId });
}

/**
 * 执行 JavaScript
 */
export async function exec(code: string, tabId?: number): Promise<any> {
  const result = await sendCommand('exec', { code, tabId });
  return result.result;
}

/**
 * 截图
 */
export async function screenshot(tabId?: number, format: 'png' | 'jpeg' = 'png'): Promise<string> {
  const result = await sendCommand('screenshot', { tabId, format });
  return result.dataUrl;
}

/**
 * 获取 Cookie
 */
export async function getCookies(domain?: string): Promise<Array<{ name: string; value: string }>> {
  const result = await sendCommand('cookies', { domain });
  return result.cookies;
}

/**
 * 获取标签页列表
 */
export async function listTabs(): Promise<Array<{ id: number; url: string; title: string }>> {
  const result = await sendCommand('tabs', { op: 'list' });
  return result.tabs;
}

/**
 * 选择标签页
 */
export async function selectTab(index: number): Promise<void> {
  await sendCommand('tabs', { op: 'select', index });
}

/**
 * 点击元素
 */
export async function click(selector: string, tabId?: number): Promise<void> {
  await sendCommand('click', { selector, tabId });
}

/**
 * 输入文本
 */
export async function type(selector: string, text: string, tabId?: number): Promise<void> {
  await sendCommand('type', { selector, text, tabId });
}

/**
 * 滚动
 */
export async function scroll(direction: 'up' | 'down', amount: number = 300, tabId?: number): Promise<void> {
  await sendCommand('scroll', { direction, amount, tabId });
}

/**
 * 等待
 */
export async function wait(ms: number): Promise<void> {
  await sendCommand('wait', { ms });
}

// ==================== 真人行为 ====================

/**
 * 真人风格点击坐标
 */
export async function humanClick(x: number, y: number, options?: { doubleClick?: boolean }): Promise<any> {
  return await sendCommand('humanClick', { x, y, options });
}

/**
 * 真人风格点击元素
 */
export async function humanClickElement(selector: string): Promise<any> {
  return await sendCommand('humanClickElement', { selector });
}

/**
 * 真人风格输入
 */
export async function humanType(selector: string, text: string): Promise<any> {
  return await sendCommand('humanType', { selector, text });
}

/**
 * 真人风格滚动
 */
export async function humanScroll(direction: 'up' | 'down', amount: number = 300): Promise<any> {
  return await sendCommand('humanScroll', { direction, amount });
}

/**
 * 随机滚动浏览
 */
export async function randomScroll(durationMs: number = 5000): Promise<any> {
  return await sendCommand('randomScroll', { durationMs });
}

// ==================== 小红书专用 ====================

/**
 * 小红书点赞（真人风格）
 */
export async function xhsLike(): Promise<any> {
  return await sendCommand('xhsLike', {});
}

/**
 * 小红书收藏（真人风格）
 */
export async function xhsCollect(): Promise<any> {
  return await sendCommand('xhsCollect', {});
}

/**
 * 小红书评论（真人风格）
 */
export async function xhsComment(text: string): Promise<any> {
  return await sendCommand('xhsComment', { text });
}

/**
 * 小红书浏览笔记（真人风格）
 */
export async function xhsBrowseNote(durationMs: number = 5000): Promise<any> {
  return await sendCommand('xhsBrowseNote', { durationMs });
}
