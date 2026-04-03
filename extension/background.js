// XHS CLI Bridge - Background Script
console.log('[XHS Bridge] Service Worker started');

const DAEMON_PORT = 19826;
let connected = false;
let activeTabId = null;

// 连接 Daemon
async function connectDaemon() {
  if (connected) return true;

  try {
    const response = await fetch(`http://localhost:${DAEMON_PORT}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'extension', timestamp: Date.now() }),
    });
    if (response.ok) {
      connected = true;
      console.log('[XHS Bridge] Connected to daemon');
      return true;
    }
  } catch (e) {
    console.log('[XHS Bridge] Connection failed:', e.message);
  }
  return false;
}

// 心跳
async function heartbeat() {
  // 如果未连接，尝试重连
  if (!connected) {
    await connectDaemon();
    return;
  }

  try {
    await fetch(`http://localhost:${DAEMON_PORT}/heartbeat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ timestamp: Date.now() }),
    });
  } catch (e) {
    console.log('[XHS Bridge] Heartbeat failed:', e.message);
    connected = false;
  }
}

// 命令队列
let lastCommandId = 0;
let executingCommandId = null;  // 正在执行的命令 ID

// 轮询命令
async function pollCommands() {
  // 如果未连接，尝试连接
  if (!connected) {
    await connectDaemon();
    return;
  }

  try {
    const response = await fetch(`http://localhost:${DAEMON_PORT}/poll?lastId=${lastCommandId}`);
    const data = await response.json();

    if (data.commands && data.commands.length > 0) {
      for (const cmd of data.commands) {
        // 跳过正在执行的命令
        if (executingCommandId === cmd.id) {
          continue;
        }

        console.log('[XHS Bridge] Executing command:', cmd.action, cmd.id);
        executingCommandId = cmd.id;

        try {
          const result = await executeCommand(cmd);
          console.log('[XHS Bridge] Result:', result);
          lastCommandId = cmd.id;

          // 返回结果
          await fetch(`http://localhost:${DAEMON_PORT}/result`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: cmd.id, result }),
          });
        } finally {
          executingCommandId = null;
        }
      }
    }
  } catch (e) {
    console.log('[XHS Bridge] Poll failed:', e.message);
  }
}

// 执行命令
async function executeCommand(cmd) {
  console.log('[XHS Bridge] executeCommand:', cmd.action, cmd);

  try {
    switch (cmd.action) {
      case 'navigate': {
        console.log('[XHS Bridge] Navigating to:', cmd.url);

        // 创建新标签页
        const tab = await chrome.tabs.create({ url: cmd.url });
        activeTabId = tab.id;
        console.log('[XHS Bridge] Tab created:', tab.id);

        // 等待加载完成（最多10秒）
        await new Promise(resolve => {
          const timeout = setTimeout(() => {
            chrome.tabs.onUpdated.removeListener(listener);
            console.log('[XHS Bridge] Navigate timeout, continuing...');
            resolve(undefined);
          }, 10000);

          const listener = (tabId, info) => {
            if (tabId === tab.id && info.status === 'complete') {
              clearTimeout(timeout);
              chrome.tabs.onUpdated.removeListener(listener);
              console.log('[XHS Bridge] Tab loaded');
              resolve(undefined);
            }
          };
          chrome.tabs.onUpdated.addListener(listener);
        });

        return { success: true, tabId: tab.id, url: tab.url };
      }

      case 'exec': {
        const tabId = cmd.tabId || activeTabId;
        if (!tabId) return { success: false, error: 'No active tab' };

        const results = await chrome.scripting.executeScript({
          target: { tabId },
          func: (code) => {
            try { return eval(code); }
            catch (e) { return { error: e.message }; }
          },
          args: [cmd.code],
        });
        return { success: true, result: results[0]?.result };
      }

      case 'cookies': {
        const cookies = await chrome.cookies.getAll({ domain: cmd.domain || '.xiaohongshu.com' });
        return { success: true, cookies: cookies.map(c => ({ name: c.name, value: c.value, domain: c.domain })) };
      }

      case 'screenshot': {
        const dataUrl = await chrome.tabs.captureVisibleTab(null, { format: cmd.format || 'png' });
        return { success: true, dataUrl };
      }

      case 'tabs': {
        if (cmd.op === 'list') {
          const tabs = await chrome.tabs.query({});
          return { success: true, tabs: tabs.map(t => ({ id: t.id, url: t.url, title: t.title })) };
        }
        return { success: false, error: 'Unknown tabs op' };
      }

      case 'wait': {
        await new Promise(r => setTimeout(r, cmd.ms || 1000));
        return { success: true };
      }

      // ==================== 真人行为命令 ====================

      case 'humanClick': {
        const tabId = cmd.tabId || activeTabId;
        if (!tabId) return { success: false, error: 'No active tab' };

        const response = await chrome.tabs.sendMessage(tabId, {
          action: 'humanClick',
          x: cmd.x,
          y: cmd.y,
          options: cmd.options,
        });
        return response;
      }

      case 'humanClickElement': {
        const tabId = cmd.tabId || activeTabId;
        if (!tabId) return { success: false, error: 'No active tab' };

        const response = await chrome.tabs.sendMessage(tabId, {
          action: 'humanClickElement',
          selector: cmd.selector,
        });
        return response;
      }

      case 'humanType': {
        const tabId = cmd.tabId || activeTabId;
        if (!tabId) return { success: false, error: 'No active tab' };

        const response = await chrome.tabs.sendMessage(tabId, {
          action: 'humanType',
          selector: cmd.selector,
          text: cmd.text,
        });
        return response;
      }

      case 'humanScroll': {
        const tabId = cmd.tabId || activeTabId;
        if (!tabId) return { success: false, error: 'No active tab' };

        const response = await chrome.tabs.sendMessage(tabId, {
          action: 'humanScroll',
          direction: cmd.direction,
          amount: cmd.amount,
        });
        return response;
      }

      case 'randomScroll': {
        const tabId = cmd.tabId || activeTabId;
        if (!tabId) return { success: false, error: 'No active tab' };

        const response = await chrome.tabs.sendMessage(tabId, {
          action: 'randomScroll',
          durationMs: cmd.durationMs,
        });
        return response;
      }

      // ==================== 小红书专用命令 ====================

      case 'xhsLike': {
        const tabId = cmd.tabId || activeTabId;
        if (!tabId) return { success: false, error: 'No active tab' };

        const response = await chrome.tabs.sendMessage(tabId, { action: 'xhsLike' });
        return response;
      }

      case 'xhsCollect': {
        const tabId = cmd.tabId || activeTabId;
        if (!tabId) return { success: false, error: 'No active tab' };

        const response = await chrome.tabs.sendMessage(tabId, { action: 'xhsCollect' });
        return response;
      }

      case 'xhsComment': {
        const tabId = cmd.tabId || activeTabId;
        if (!tabId) return { success: false, error: 'No active tab' };

        const response = await chrome.tabs.sendMessage(tabId, {
          action: 'xhsComment',
          text: cmd.text,
        });
        return response;
      }

      case 'xhsBrowseNote': {
        const tabId = cmd.tabId || activeTabId;
        if (!tabId) return { success: false, error: 'No active tab' };

        const response = await chrome.tabs.sendMessage(tabId, {
          action: 'xhsBrowseNote',
          durationMs: cmd.durationMs,
        });
        return response;
      }

      default:
        return { success: false, error: `Unknown action: ${cmd.action}` };
    }
  } catch (e) {
    console.error('[XHS Bridge] Command error:', e);
    return { success: false, error: e.message };
  }
}

// 初始化
chrome.runtime.onInstalled.addListener(() => {
  console.log('[XHS Bridge] Installed');
  connectDaemon();
});

chrome.runtime.onStartup.addListener(() => {
  console.log('[XHS Bridge] Startup');
  connectDaemon();
});

// 启动连接和定时任务
connectDaemon();
setInterval(heartbeat, 3000);
setInterval(pollCommands, 100);  // 更快的轮询
