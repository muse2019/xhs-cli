// XHS CLI Bridge - Background Script
console.log('[XHS Bridge] Service Worker started');

const DAEMON_PORT = 19826;
let connected = false;
let activeTabId = null;
let useCdpInput = true;  // 使用 CDP 生成可信事件

// ==================== CDP 输入事件 ====================

/**
 * 添加小数坐标，模拟真实鼠标位置
 */
function addFloatJitter(value, maxJitter = 0.5) {
  // 添加小数部分（真实鼠标坐标通常有小数）
  const decimal = Math.random() * 0.99 + 0.01;  // 0.01 - 0.99
  const jitter = (Math.random() - 0.5) * maxJitter;
  return value + decimal + jitter;
}

/**
 * 使用 CDP Input.dispatchMouseEvent 生成可信事件
 * 注意：使用 chrome.debugger 会在浏览器顶部显示警告条
 */
async function cdpMouseMove(tabId, x, y) {
  // 添加小数坐标
  const floatX = addFloatJitter(x);
  const floatY = addFloatJitter(y);

  await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchMouseEvent', {
    type: 'mouseMoved',
    x: floatX,
    y: floatY,
  });
}

async function cdpMouseDown(tabId, x, y, button = 'left') {
  const floatX = addFloatJitter(x);
  const floatY = addFloatJitter(y);

  await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x: floatX,
    y: floatY,
    button,
    clickCount: 1,
  });
}

async function cdpMouseUp(tabId, x, y, button = 'left') {
  const floatX = addFloatJitter(x);
  const floatY = addFloatJitter(y);

  await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x: floatX,
    y: floatY,
    button,
    clickCount: 1,
  });
}

async function cdpClick(tabId, x, y) {
  // 移动到目标位置
  await cdpMouseMove(tabId, x, y);
  await new Promise(r => setTimeout(r, 50 + Math.random() * 50));

  // 按下（坐标可能有微小变化）
  await cdpMouseDown(tabId, x, y);
  await new Promise(r => setTimeout(r, 50 + Math.random() * 100));

  // 释放（坐标可能有微小变化）
  await cdpMouseUp(tabId, x, y);
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

        // 如果已有活动标签页，在其中导航
        if (activeTabId && !cmd.newTab) {
          await chrome.tabs.update(activeTabId, { url: cmd.url });
        } else {
          // 创建新标签页
          const tab = await chrome.tabs.create({ url: cmd.url });
          activeTabId = tab.id;
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

        // 如果启用 CDP，附加 debugger
        if (useCdpInput) {
          try {
            await ensureDebuggerAttached(activeTabId);
          } catch (e) {
            console.log('[XHS Bridge] Failed to attach debugger:', e.message);
          }
        }

        return { success: true, tabId: activeTabId };
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

        // 优先使用 CDP（生成 isTrusted=true 事件）
        if (useCdpInput && cmd.useCdp !== false) {
          try {
            await ensureDebuggerAttached(tabId);
            await cdpClick(tabId, cmd.x, cmd.y);
            return { success: true, method: 'cdp' };
          } catch (e) {
            console.log('[XHS Bridge] CDP click failed, fallback to content script:', e.message);
          }
        }

        // 回退到 content script
        const response = await chrome.tabs.sendMessage(tabId, {
          action: 'humanClick',
          x: cmd.x,
          y: cmd.y,
          options: cmd.options,
        });
        return { ...response, method: 'content' };
      }

      case 'humanClickElement': {
        const tabId = cmd.tabId || activeTabId;
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

        // 使用 CDP 点击
        if (useCdpInput && cmd.useCdp !== false) {
          try {
            await ensureDebuggerAttached(tabId);
            await cdpClick(tabId, pos.x, pos.y);
            return { success: true, method: 'cdp' };
          } catch (e) {
            console.log('[XHS Bridge] CDP click failed, fallback:', e.message);
          }
        }

        // 回退到 content script
        const response = await chrome.tabs.sendMessage(tabId, {
          action: 'humanClickElement',
          selector: cmd.selector,
        });
        return { ...response, method: 'content' };
      }

      case 'humanType': {
        const tabId = cmd.tabId || activeTabId;
        if (!tabId) return { success: false, error: 'No active tab' };

        // 优先使用 CDP
        if (useCdpInput && cmd.useCdp !== false) {
          try {
            await ensureDebuggerAttached(tabId);

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
            return { success: true, method: 'cdp' };
          } catch (e) {
            console.log('[XHS Bridge] CDP type failed, fallback:', e.message);
          }
        }

        // 回退到 content script
        const response = await chrome.tabs.sendMessage(tabId, {
          action: 'humanType',
          selector: cmd.selector,
          text: cmd.text,
        });
        return { ...response, method: 'content' };
      }

      case 'humanScroll': {
        const tabId = cmd.tabId || activeTabId;
        if (!tabId) return { success: false, error: 'No active tab' };

        // 优先使用 CDP
        if (useCdpInput && cmd.useCdp !== false) {
          try {
            await ensureDebuggerAttached(tabId);
            const deltaY = cmd.direction === 'up' ? -cmd.amount : cmd.amount;
            await cdpMouseWheel(tabId, 0, 0, 0, deltaY);
            return { success: true, method: 'cdp' };
          } catch (e) {
            console.log('[XHS Bridge] CDP scroll failed, fallback:', e.message);
          }
        }

        // 回退到 content script
        const response = await chrome.tabs.sendMessage(tabId, {
          action: 'humanScroll',
          direction: cmd.direction,
          amount: cmd.amount,
        });
        return { ...response, method: 'content' };
      }

      case 'randomScroll': {
        const tabId = cmd.tabId || activeTabId;
        if (!tabId) return { success: false, error: 'No active tab' };

        // 随机滚动使用 CDP
        if (useCdpInput && cmd.useCdp !== false) {
          try {
            await ensureDebuggerAttached(tabId);
            const duration = cmd.durationMs || 5000;
            const startTime = Date.now();

            while (Date.now() - startTime < duration) {
              const direction = Math.random() > 0.3 ? 1 : -1;
              const amount = 100 + Math.random() * 300;
              await cdpMouseWheel(tabId, 0, 0, 0, direction * amount);
              await new Promise(r => setTimeout(r, 300 + Math.random() * 700));
            }
            return { success: true, method: 'cdp' };
          } catch (e) {
            console.log('[XHS Bridge] CDP random scroll failed, fallback:', e.message);
          }
        }

        // 回退到 content script
        const response = await chrome.tabs.sendMessage(tabId, {
          action: 'randomScroll',
          durationMs: cmd.durationMs,
        });
        return { ...response, method: 'content' };
      }

      // ==================== 小红书专用命令 ====================

      case 'xhsLike': {
        const tabId = cmd.tabId || activeTabId;
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

        // 使用 CDP 点击
        if (useCdpInput) {
          try {
            await ensureDebuggerAttached(tabId);
            // 随机思考时间
            await new Promise(r => setTimeout(r, 200 + Math.random() * 500));
            await cdpClick(tabId, pos.x, pos.y);
            return { success: true, message: '点赞成功', method: 'cdp' };
          } catch (e) {
            console.log('[XHS Bridge] CDP like failed, fallback:', e.message);
          }
        }

        // 回退到 content script
        const response = await chrome.tabs.sendMessage(tabId, { action: 'xhsLike' });
        return { ...response, method: 'content' };
      }

      case 'xhsCollect': {
        const tabId = cmd.tabId || activeTabId;
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

        // 使用 CDP 点击
        if (useCdpInput) {
          try {
            await ensureDebuggerAttached(tabId);
            await new Promise(r => setTimeout(r, 200 + Math.random() * 500));
            await cdpClick(tabId, pos.x, pos.y);
            return { success: true, message: '收藏成功', method: 'cdp' };
          } catch (e) {
            console.log('[XHS Bridge] CDP collect failed, fallback:', e.message);
          }
        }

        // 回退到 content script
        const response = await chrome.tabs.sendMessage(tabId, { action: 'xhsCollect' });
        return { ...response, method: 'content' };
      }

      case 'xhsComment': {
        const tabId = cmd.tabId || activeTabId;
        if (!tabId) return { success: false, error: 'No active tab' };

        // 使用 CDP 完成评论流程
        if (useCdpInput) {
          try {
            await ensureDebuggerAttached(tabId);

            // 获取评论按钮并点击
            const chatPos = await chrome.scripting.executeScript({
              target: { tabId },
              func: () => {
                const btn = document.querySelector('.chat-wrapper');
                if (!btn) return null;
                const rect = btn.getBoundingClientRect();
                return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
              },
            });

            if (chatPos[0]?.result) {
              await cdpClick(tabId, chatPos[0].result.x, chatPos[0].result.y);
              await new Promise(r => setTimeout(r, 800 + Math.random() * 700));
            }

            // 获取输入框并点击
            const inputPos = await chrome.scripting.executeScript({
              target: { tabId },
              func: () => {
                const input = document.querySelector('#content-textarea, [contenteditable="true"]');
                if (!input) return null;
                input.focus();
                const rect = input.getBoundingClientRect();
                return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
              },
            });

            if (!inputPos[0]?.result) {
              return { success: false, error: '未找到评论输入框' };
            }

            await cdpClick(tabId, inputPos[0].result.x, inputPos[0].result.y);
            await new Promise(r => setTimeout(r, 200 + Math.random() * 200));

            // 输入评论
            await cdpType(tabId, cmd.text);
            await new Promise(r => setTimeout(r, 300 + Math.random() * 300));

            // 点击发送
            const submitPos = await chrome.scripting.executeScript({
              target: { tabId },
              func: () => {
                const btn = document.querySelector('button.btn.submit, [class*="submit"]');
                if (!btn) return null;
                const rect = btn.getBoundingClientRect();
                return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
              },
            });

            if (submitPos[0]?.result) {
              await cdpClick(tabId, submitPos[0].result.x, submitPos[0].result.y);
              return { success: true, message: '评论已发送', method: 'cdp' };
            }

            return { success: false, error: '未找到发送按钮' };
          } catch (e) {
            console.log('[XHS Bridge] CDP comment failed, fallback:', e.message);
          }
        }

        // 回退到 content script
        const response = await chrome.tabs.sendMessage(tabId, {
          action: 'xhsComment',
          text: cmd.text,
        });
        return { ...response, method: 'content' };
      }

      case 'xhsBrowseNote': {
        const tabId = cmd.tabId || activeTabId;
        if (!tabId) return { success: false, error: 'No active tab' };

        // 使用 CDP 随机滚动浏览
        if (useCdpInput) {
          try {
            await ensureDebuggerAttached(tabId);
            const duration = cmd.durationMs || 10000;
            const startTime = Date.now();

            while (Date.now() - startTime < duration) {
              // 70% 向下，30% 向上
              const direction = Math.random() > 0.3 ? 1 : -1;
              const amount = 100 + Math.random() * 400;
              await cdpMouseWheel(tabId, 0, 0, 0, direction * amount);
              await new Promise(r => setTimeout(r, 500 + Math.random() * 1500));
            }
            return { success: true, method: 'cdp' };
          } catch (e) {
            console.log('[XHS Bridge] CDP browse failed, fallback:', e.message);
          }
        }

        // 回退到 content script
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

chrome.runtime.onInstalled.addListener(() => {
  console.log('[XHS Bridge] Installed');
  connectDaemon();
});

chrome.runtime.onStartup.addListener(() => {
  console.log('[XHS Bridge] Startup');
  connectDaemon();
});

// 启动连接和定时任务（使用随机间隔）
connectDaemon();
setRandomInterval(heartbeat, 2500, 4000);      // 心跳: 2.5-4 秒
setRandomInterval(pollCommands, 80, 150);  // 轮询: 80-150ms
