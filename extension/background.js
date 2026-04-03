// XHS CLI Bridge - Background Script
console.log('[XHS Bridge] Service Worker started');

const DAEMON_PORT = 19826;
let connected = false;
let activeTabId = null;

// ==================== 获取活动标签页 ====================

/**
 * 获取当前活动标签页，如果没有缓存的 activeTabId 则查询当前窗口的活动标签页
 */
async function getActiveTab() {
  // 如果有缓存的 activeTabId，检查它是否仍然有效
  if (activeTabId) {
    try {
      const tab = await chrome.tabs.get(activeTabId);
      if (tab) return tab;
    } catch {
      // 标签页已关闭
      activeTabId = null;
    }
  }

  // 查询当前窗口的活动标签页
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab) {
    activeTabId = tab.id;
  }
  return tab;
}

/**
 * 解析 tabId，如果未提供则获取当前活动标签页的 ID
 */
async function resolveTabId(cmdTabId) {
  if (cmdTabId) return cmdTabId;
  if (activeTabId) {
    try {
      await chrome.tabs.get(activeTabId);
      return activeTabId;
    } catch {
      activeTabId = null;
    }
  }
  const tab = await getActiveTab();
  return tab?.id;
}

// ==================== CDP 配置 ====================
// 混合模式：默认禁用 CDP 避免警告条，用户可按需开启
let cdpConfig = {
  enabled: false,           // 是否启用 CDP（会产生警告条）
  attachedTabs: new Set(),  // 已附加 debugger 的标签页
};

/**
 * 配置 CDP 模式
 * @param {boolean} enabled - 是否启用 CDP（isTrusted=true 事件）
 */
function setCdpMode(enabled) {
  cdpConfig.enabled = enabled;
  console.log('[XHS Bridge] CDP mode:', enabled ? 'enabled' : 'disabled');

  // 如果禁用，分离所有已附加的 debugger
  if (!enabled) {
    for (const tabId of cdpConfig.attachedTabs) {
      detachDebugger(tabId);
    }
    cdpConfig.attachedTabs.clear();
  }
}

// ==================== CDP 输入事件 ====================

/**
 * 添加小数坐标，模拟真实鼠标位置
 */
function addFloatJitter(value, maxJitter = 0.5) {
  const decimal = Math.random() * 0.99 + 0.01;
  const jitter = (Math.random() - 0.5) * maxJitter;
  return value + decimal + jitter;
}

/**
 * 确保 debugger 已附加（仅在 CDP 模式下）
 */
async function ensureDebuggerAttached(tabId) {
  if (!cdpConfig.enabled) return false;

  if (cdpConfig.attachedTabs.has(tabId)) return true;

  try {
    await chrome.debugger.attach({ tabId }, '1.3');
    cdpConfig.attachedTabs.add(tabId);
    console.log('[XHS Bridge] Debugger attached to tab:', tabId);
    return true;
  } catch (e) {
    if (!e.message.includes('already attached')) {
      console.log('[XHS Bridge] Debugger attach failed:', e.message);
      return false;
    }
    cdpConfig.attachedTabs.add(tabId);
    return true;
  }
}

/**
 * 分离 debugger
 */
async function detachDebugger(tabId) {
  try {
    await chrome.debugger.detach({ tabId });
    cdpConfig.attachedTabs.delete(tabId);
  } catch {}
}

// 监听 debugger 分离事件
chrome.debugger.onDetach.addListener((source, reason) => {
  if (source.tabId) {
    cdpConfig.attachedTabs.delete(source.tabId);
  }
  console.log('[XHS Bridge] Debugger detached:', reason);
});

/**
 * CDP 鼠标移动（仅在启用 CDP 时工作）
 */
async function cdpMouseMove(tabId, x, y) {
  if (!cdpConfig.enabled || !cdpConfig.attachedTabs.has(tabId)) return false;

  const floatX = addFloatJitter(x);
  const floatY = addFloatJitter(y);

  await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchMouseEvent', {
    type: 'mouseMoved',
    x: floatX,
    y: floatY,
  });
  return true;
}

async function cdpMouseDown(tabId, x, y, button = 'left') {
  if (!cdpConfig.enabled || !cdpConfig.attachedTabs.has(tabId)) return false;

  const floatX = addFloatJitter(x);
  const floatY = addFloatJitter(y);

  await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x: floatX,
    y: floatY,
    button,
    clickCount: 1,
  });
  return true;
}

async function cdpMouseUp(tabId, x, y, button = 'left') {
  if (!cdpConfig.enabled || !cdpConfig.attachedTabs.has(tabId)) return false;

  const floatX = addFloatJitter(x);
  const floatY = addFloatJitter(y);

  await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x: floatX,
    y: floatY,
    button,
    clickCount: 1,
  });
  return true;
}

/**
 * CDP 点击（生成 isTrusted=true 事件）
 * 返回 true 表示成功，false 表示 CDP 不可用
 */
async function cdpClick(tabId, x, y) {
  if (!cdpConfig.enabled) return false;

  if (!await ensureDebuggerAttached(tabId)) return false;

  await cdpMouseMove(tabId, x, y);
  await new Promise(r => setTimeout(r, 50 + Math.random() * 50));
  await cdpMouseDown(tabId, x, y);
  await new Promise(r => setTimeout(r, 50 + Math.random() * 100));
  await cdpMouseUp(tabId, x, y);
  return true;
}

async function cdpMouseWheel(tabId, x, y, deltaX = 0, deltaY = 0) {
  await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchMouseEvent', {
    type: 'mouseWheel',
    x,
    y,
    deltaX,
    deltaY,
  });
}

async function cdpKeyDown(tabId, key, text = undefined) {
  await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchKeyEvent', {
    type: 'keyDown',
    key,
    text,
  });
}

async function cdpKeyUp(tabId, key) {
  await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchKeyEvent', {
    type: 'keyUp',
    key,
  });
}

async function cdpType(tabId, text) {
  for (const char of text) {
    await cdpKeyDown(tabId, char, char);
    await new Promise(r => setTimeout(r, 50 + Math.random() * 100));
    await cdpKeyUp(tabId, char);
    await new Promise(r => setTimeout(r, 30 + Math.random() * 70));
  }
}

// 确保 debugger 已附加
async function ensureDebuggerAttached(tabId) {
  try {
    await chrome.debugger.attach({ tabId }, '1.3');
    console.log('[XHS Bridge] Debugger attached to tab:', tabId);
  } catch (e) {
    // 可能已经附加
    if (!e.message.includes('already attached')) {
      throw e;
    }
  }
}

// 分离 debugger
async function detachDebugger(tabId) {
  try {
    await chrome.debugger.detach({ tabId });
  } catch {}
}

// 监听 debugger 分离事件
chrome.debugger.onDetach.addListener((source, reason) => {
  console.log('[XHS Bridge] Debugger detached:', source, reason);
});

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

        let createdTab = null;

        // 检查 activeTabId 是否有效
        let tabExists = false;
        if (activeTabId) {
          try {
            await chrome.tabs.get(activeTabId);
            tabExists = true;
          } catch {
            console.log('[XHS Bridge] Tab', activeTabId, 'no longer exists, creating new tab');
            activeTabId = null;
          }
        }

        // 如果有有效的活动标签页，在其中导航
        if (tabExists && !cmd.newTab) {
          await chrome.tabs.update(activeTabId, { url: cmd.url });
        } else {
          // 创建新标签页
          createdTab = await chrome.tabs.create({ url: cmd.url });
          activeTabId = createdTab.id;
        }
        console.log('[XHS Bridge] Tab:', activeTabId);

        // 等待加载完成（最多10秒）
        await new Promise(resolve => {
          const timeout = setTimeout(() => {
            chrome.tabs.onUpdated.removeListener(listener);
            console.log('[XHS Bridge] Navigate timeout, continuing...');
            resolve(undefined);
          }, 10000);

          const listener = (tabId, info) => {
            if (tabId === activeTabId && info.status === 'complete') {
              clearTimeout(timeout);
              chrome.tabs.onUpdated.removeListener(listener);
              console.log('[XHS Bridge] Tab loaded');
              resolve(undefined);
            }
          };
          chrome.tabs.onUpdated.addListener(listener);
        });

        // 获取实际的 URL
        let actualUrl = cmd.url;
        try {
          const tab = await chrome.tabs.get(activeTabId);
          actualUrl = tab.url || cmd.url;
          console.log('[XHS Bridge] Actual URL:', actualUrl);
        } catch (e) {
          console.log('[XHS Bridge] Failed to get URL:', e.message);
          // 如果创建标签页时有 URL，使用那个
          if (createdTab && createdTab.url) {
            actualUrl = createdTab.url;
          }
        }

        return { success: true, tabId: activeTabId, url: actualUrl };
      }

      // ==================== 配置命令 ====================

      case 'setConfig': {
        if (cmd.cdp !== undefined) {
          setCdpMode(cmd.cdp);
        }
        return { success: true, cdp: cdpConfig.enabled };
      }

      case 'getConfig': {
        return { success: true, cdp: cdpConfig.enabled };
      }

      case 'exec': {
        // 使用传入的 tabId 或获取当前活动标签页
        let tabId = cmd.tabId || activeTabId;
        if (!tabId) {
          const activeTab = await getActiveTab();
          tabId = activeTab?.id;
        }
        if (!tabId) return { success: false, error: 'No active tab' };

        console.log('[XHS Bridge] exec: using MAIN world for tab', tabId);

        // 使用 chrome.scripting.executeScript 的 world: 'MAIN' 直接在页面执行
        // 这可以绑过 CSP 限制
        try {
          // 先生成一个唯一 ID 用于传递结果
          const resultId = 'xhs_result_' + Date.now();

          // 注入代码到页面主世界
          await chrome.scripting.executeScript({
            target: { tabId },
            world: 'MAIN',
            func: (code, resultId) => {
              try {
                const result = eval(code);
                // 将结果存储到全局变量
                window[resultId] = { success: true, data: result };
              } catch (e) {
                window[resultId] = { success: false, error: e.message };
              }
            },
            args: [cmd.code, resultId],
          });

          // 等待一小段时间让代码执行完成
          await new Promise(r => setTimeout(r, 50));

          // 读取结果
          const results = await chrome.scripting.executeScript({
            target: { tabId },
            world: 'MAIN',
            func: (resultId) => {
              const result = window[resultId];
              delete window[resultId];
              return result;
            },
            args: [resultId],
          });

          const response = results[0]?.result;
          console.log('[XHS Bridge] exec: got result', response);
          return { success: response?.success, result: response?.data, error: response?.error };
        } catch (e) {
          console.log('[XHS Bridge] exec: error', e.message);
          return { success: false, error: e.message };
        }
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
        const tabId = await resolveTabId(cmd.tabId);
        if (!tabId) return { success: false, error: 'No active tab' };

        // 如果启用 CDP 且命令要求使用 CDP
        if (cdpConfig.enabled && cmd.useCdp === true) {
          const cdpSuccess = await cdpClick(tabId, cmd.x, cmd.y);
          if (cdpSuccess) {
            return { success: true, method: 'cdp', isTrusted: true };
          }
        }

        // 默认使用 content script（无警告条）
        const response = await chrome.tabs.sendMessage(tabId, {
          action: 'humanClick',
          x: cmd.x,
          y: cmd.y,
          options: cmd.options,
        });
        return { ...response, method: 'content', isTrusted: false };
      }

      case 'humanClickElement': {
        const tabId = await resolveTabId(cmd.tabId);
        if (!tabId) return { success: false, error: 'No active tab' };

        // 先获取元素位置
        const posResult = await chrome.scripting.executeScript({
          target: { tabId },
          func: (selector) => {
            const el = document.querySelector(selector);
            if (!el) return null;
            const rect = el.getBoundingClientRect();
            return {
              x: rect.x + rect.width / 2,
              y: rect.y + rect.height / 2,
              visible: rect.width > 0 && rect.height > 0
            };
          },
          args: [cmd.selector],
        });

        const pos = posResult[0]?.result;
        if (!pos || !pos.visible) {
          return { success: false, error: 'Element not found or not visible' };
        }

        // 如果明确要求使用 CDP
        if (cdpConfig.enabled && cmd.useCdp === true) {
          const cdpSuccess = await cdpClick(tabId, pos.x, pos.y);
          if (cdpSuccess) {
            return { success: true, method: 'cdp', isTrusted: true };
          }
        }

        // 默认使用 content script
        const response = await chrome.tabs.sendMessage(tabId, {
          action: 'humanClickElement',
          selector: cmd.selector,
        });
        return { ...response, method: 'content', isTrusted: false };
      }

      case 'humanType': {
        const tabId = await resolveTabId(cmd.tabId);
        if (!tabId) return { success: false, error: 'No active tab' };

        // 如果明确要求使用 CDP
        if (cdpConfig.enabled && cmd.useCdp === true) {
          const attached = await ensureDebuggerAttached(tabId);
          if (attached) {
            // 先点击元素聚焦
            if (cmd.selector) {
              const posResult = await chrome.scripting.executeScript({
                target: { tabId },
                func: (selector) => {
                  const el = document.querySelector(selector);
                  if (!el) return null;
                  el.focus();
                  const rect = el.getBoundingClientRect();
                  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
                },
                args: [cmd.selector],
              });
              const pos = posResult[0]?.result;
              if (pos) {
                await cdpClick(tabId, pos.x, pos.y);
              }
            }

            await cdpType(tabId, cmd.text);
            return { success: true, method: 'cdp', isTrusted: true };
          }
        }

        // 默认使用 content script
        const response = await chrome.tabs.sendMessage(tabId, {
          action: 'humanType',
          selector: cmd.selector,
          text: cmd.text,
        });
        return { ...response, method: 'content', isTrusted: false };
      }

      case 'humanScroll': {
        const tabId = await resolveTabId(cmd.tabId);
        if (!tabId) return { success: false, error: 'No active tab' };

        // 滚动通常不需要 isTrusted，直接用 content script
        const response = await chrome.tabs.sendMessage(tabId, {
          action: 'humanScroll',
          direction: cmd.direction,
          amount: cmd.amount,
        });
        return { ...response, method: 'content' };
      }

      case 'randomScroll': {
        const tabId = await resolveTabId(cmd.tabId);
        if (!tabId) return { success: false, error: 'No active tab' };

        // 滚动不需要 CDP
        const response = await chrome.tabs.sendMessage(tabId, {
          action: 'randomScroll',
          durationMs: cmd.durationMs,
        });
        return { ...response, method: 'content' };
      }

      // ==================== 小红书专用命令 ====================

      case 'xhsLike': {
        const tabId = await resolveTabId(cmd.tabId);
        if (!tabId) return { success: false, error: 'No active tab' };

        // 获取点赞按钮位置
        const posResult = await chrome.scripting.executeScript({
          target: { tabId },
          func: () => {
            const btn = document.querySelector('.like-wrapper');
            if (!btn) return null;
            if (btn.classList.contains('like-active')) return { alreadyLiked: true };
            const rect = btn.getBoundingClientRect();
            return {
              x: rect.x + rect.width / 2 + (Math.random() - 0.5) * 10,
              y: rect.y + rect.height / 2 + (Math.random() - 0.5) * 10,
              visible: rect.width > 0 && rect.height > 0
            };
          },
        });

        const pos = posResult[0]?.result;
        if (!pos) return { success: false, error: '未找到点赞按钮' };
        if (pos.alreadyLiked) return { success: false, error: '已经点赞过了' };

        // 默认使用 content script（无警告条）
        const response = await chrome.tabs.sendMessage(tabId, { action: 'xhsLike' });
        return { ...response, method: 'content', isTrusted: false };
      }

      case 'xhsCollect': {
        const tabId = await resolveTabId(cmd.tabId);
        if (!tabId) return { success: false, error: 'No active tab' };

        // 获取收藏按钮位置
        const posResult = await chrome.scripting.executeScript({
          target: { tabId },
          func: () => {
            const btn = document.querySelector('.collect-wrapper');
            if (!btn) return null;
            if (btn.classList.contains('collect-active')) return { alreadyCollected: true };
            const rect = btn.getBoundingClientRect();
            return {
              x: rect.x + rect.width / 2 + (Math.random() - 0.5) * 10,
              y: rect.y + rect.height / 2 + (Math.random() - 0.5) * 10,
              visible: rect.width > 0 && rect.height > 0
            };
          },
        });

        const pos = posResult[0]?.result;
        if (!pos) return { success: false, error: '未找到收藏按钮' };
        if (pos.alreadyCollected) return { success: false, error: '已经收藏过了' };

        // 默认使用 content script
        const response = await chrome.tabs.sendMessage(tabId, { action: 'xhsCollect' });
        return { ...response, method: 'content', isTrusted: false };
      }

      case 'xhsComment': {
        const tabId = await resolveTabId(cmd.tabId);
        if (!tabId) return { success: false, error: 'No active tab' };

        // 默认使用 content script
        const response = await chrome.tabs.sendMessage(tabId, {
          action: 'xhsComment',
          text: cmd.text,
        });
        return { ...response, method: 'content', isTrusted: false };
      }

      case 'xhsBrowseNote': {
        const tabId = await resolveTabId(cmd.tabId);
        if (!tabId) return { success: false, error: 'No active tab' };

        // 滚动浏览不需要 CDP
        const response = await chrome.tabs.sendMessage(tabId, {
          action: 'xhsBrowseNote',
          durationMs: cmd.durationMs,
        });
        return { ...response, method: 'content' };
      }

      default:
        return { success: false, error: `Unknown action: ${cmd.action}` };
    }
  } catch (e) {
    console.error('[XHS Bridge] Command error:', e);
    return { success: false, error: e.message };
  }
}

// ==================== 随机间隔定时器 ====================

/**
 * 随机间隔执行函数，避免固定频率被检测
 */
function setRandomInterval(fn, minMs, maxMs) {
  let timeoutId = null;

  const run = async () => {
    await fn();
    // 随机下一次执行时间
    const nextDelay = minMs + Math.random() * (maxMs - minMs);
    timeoutId = setTimeout(run, nextDelay);
  };

  // 首次执行也随机延迟
  const initialDelay = Math.random() * minMs;
  timeoutId = setTimeout(run, initialDelay);

  // 返回清除函数
  return () => {
    if (timeoutId) clearTimeout(timeoutId);
  };
}

// ==================== 初始化 ====================

// MV3 Service Worker 会在空闲时休眠（约 30 秒无活动）
// 休眠时 setTimeout/setInterval 会被暂停
// 解决方案：使用 chrome.alarms + 在每次唤醒时主动重连

// 创建闹钟保持 Service Worker 活跃
// chrome.alarms 最小间隔是 1 分钟
async function startAlarms() {
  try {
    await chrome.alarms.create('keepalive', { periodInMinutes: 0.5 }); // 30 秒
  } catch {}
}

// 监听闹钟 - 保持活跃并检查连接
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'keepalive') {
    // 每次唤醒时主动检查并重连
    if (!connected) {
      console.log('[XHS Bridge] Alarm triggered, reconnecting...');
      await connectDaemon();
    }
    // 确保轮询继续运行
    pollCommands();
  }
});

// 监听 Service Worker 启动
chrome.runtime.onInstalled.addListener(() => {
  console.log('[XHS Bridge] Installed');
  connected = false; // 重置连接状态
  connectDaemon();
  startAlarms();
  startPolling();
});

chrome.runtime.onStartup.addListener(() => {
  console.log('[XHS Bridge] Startup');
  connected = false; // 重置连接状态
  connectDaemon();
  startAlarms();
  startPolling();
});

// 标记轮询是否已启动
let pollingStarted = false;

// 启动轮询
function startPolling() {
  if (pollingStarted) return;
  pollingStarted = true;

  // 立即开始一次
  pollCommands();
  heartbeat();

  // 使用 setInterval（会被 Service Worker 休眠暂停，但闹钟会唤醒）
  setInterval(async () => {
    // 每次轮询前检查连接
    if (!connected) {
      await connectDaemon();
    }
    await pollCommands();
  }, 100);

  setInterval(async () => {
    if (!connected) {
      await connectDaemon();
    }
    await heartbeat();
  }, 3000);
}

// 初始化
connectDaemon();
startAlarms();
startPolling();
