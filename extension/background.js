// XHS CLI Bridge - Background Script

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
 * 从 storage 加载 CDP 配置（MV3 Service Worker 持久化）
 */
async function loadCdpConfig() {
  try {
    const result = await chrome.storage.local.get('cdpEnabled');
    if (result.cdpEnabled !== undefined) {
      cdpConfig.enabled = result.cdpEnabled;
    }
  } catch (e) {
    console.error('[XHS Bridge] Failed to load CDP config:', e);
  }
}

/**
 * 配置 CDP 模式
 * @param {boolean} enabled - 是否启用 CDP（isTrusted=true 事件）
 */
async function setCdpMode(enabled) {
  cdpConfig.enabled = enabled;

  // 持久化到 storage
  try {
    await chrome.storage.local.set({ cdpEnabled: enabled });
  } catch (e) {
    console.error('[XHS Bridge] Failed to save CDP config:', e);
  }

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
 * 生成更自然的小数部分，避免固定模式被检测
 * - 使用多层次的随机性
 * - 小数位数不固定
 * - 避免均匀分布，使用更接近真实鼠标的自然分布
 */
function addFloatJitter(value, maxJitter = 0.5) {
  // 使用混合随机源，避免单一 Math.random() 模式
  const rand1 = Math.random();
  const rand2 = Math.random();

  // 生成小数部分：使用正态分布模拟真实鼠标位置偏好
  // Box-Muller 变换生成近似正态分布
  const normalRandom = Math.sqrt(-2 * Math.log(rand1 || 0.0001)) * Math.cos(2 * Math.PI * rand2);
  // 将正态分布映射到 0-1 范围，并偏向某些值
  const decimal = 0.1 + Math.abs(normalRandom) * 0.4 + Math.random() * 0.3;

  // 抖动也使用更自然的分布
  const jitterMagnitude = maxJitter * (0.3 + Math.random() * 0.7);
  const jitter = (Math.random() - 0.5) * jitterMagnitude;

  // 偶尔添加微小的额外偏移（模拟手抖）
  const microJitter = (Math.random() < 0.3) ? (Math.random() - 0.5) * 0.1 : 0;

  return value + decimal + jitter + microJitter;
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
    return true;
  } catch (e) {
    if (!e.message.includes('already attached')) {
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
  await naturalDelay(40, 80); // 更自然的悬停延迟
  await cdpMouseDown(tabId, x, y);
  await naturalDelay(50, 120); // 按压延迟
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
    await naturalDelay(40, 100);
    await cdpKeyUp(tabId, char);
    await naturalDelay(20, 90);
  }
}

// ==================== CDP 真人轨迹模拟 ====================

/**
 * 生成贝塞尔曲线控制点（真人轨迹）
 */
function generateBezierPoints(start, end, steps) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const distance = Math.sqrt(dx * dx + dy * dy);

  const baseOffset = Math.min(distance * 0.3, 100);
  const offsetVariance = baseOffset * (0.5 + Math.random());

  const cp1Ratio = 0.15 + Math.random() * 0.3;
  const cp2Ratio = 0.55 + Math.random() * 0.3;

  const angle = Math.atan2(dy, dx);
  const perpX = -Math.sin(angle);
  const perpY = Math.cos(angle);

  const arcDirection = Math.random() > 0.5 ? 1 : -1;
  const arcAmount = (0.1 + Math.random() * 0.3) * distance * arcDirection;

  const cp1 = {
    x: start.x + dx * cp1Ratio + perpX * arcAmount * 0.5 + (Math.random() - 0.5) * offsetVariance,
    y: start.y + dy * cp1Ratio + perpY * arcAmount * 0.5 + (Math.random() - 0.5) * offsetVariance,
  };

  const cp2 = {
    x: start.x + dx * cp2Ratio + perpX * arcAmount + (Math.random() - 0.5) * offsetVariance,
    y: start.y + dy * cp2Ratio + perpY * arcAmount + (Math.random() - 0.5) * offsetVariance,
  };

  const points = [];

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const t2 = t * t;
    const t3 = t2 * t;
    const mt = 1 - t;
    const mt2 = mt * mt;
    const mt3 = mt2 * mt;

    let x = mt3 * start.x + 3 * mt2 * t * cp1.x + 3 * mt * t2 * cp2.x + t3 * end.x;
    let y = mt3 * start.y + 3 * mt2 * t * cp1.y + 3 * mt * t2 * cp2.y + t3 * end.y;

    // 添加随机抖动
    if (i > 0 && i < steps) {
      const baseJitter = 1 + distance * 0.01;
      x += (Math.random() - 0.5) * baseJitter * 2;
      y += (Math.random() - 0.5) * baseJitter * 2;
    }

    points.push({ x: Math.round(x), y: Math.round(y) });
  }

  return points;
}

// 记录当前鼠标位置
let currentMousePos = { x: 100, y: 100 };

/**
 * CDP 真人轨迹鼠标移动
 */
async function cdpHumanMouseMove(tabId, x, y) {
  if (!cdpConfig.enabled || !cdpConfig.attachedTabs.has(tabId)) return false;

  const distance = Math.sqrt(Math.pow(x - currentMousePos.x, 2) + Math.pow(y - currentMousePos.y, 2));
  const baseSteps = Math.floor(distance / (15 + Math.random() * 10));
  const steps = Math.max(8, Math.min(40, baseSteps));

  const path = generateBezierPoints(currentMousePos, { x, y }, steps);

  for (let i = 0; i < path.length; i++) {
    const point = path[i];
    const floatX = addFloatJitter(point.x);
    const floatY = addFloatJitter(point.y);

    await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: floatX,
      y: floatY,
    });

    currentMousePos = point;

    // 速度曲线：加速-匀速-减速
    const progress = i / path.length;
    let speedFactor;
    if (progress < 0.2) {
      speedFactor = progress / 0.2;
    } else if (progress > 0.8) {
      speedFactor = (1 - progress) / 0.2;
    } else {
      speedFactor = 1;
    }
    speedFactor = 0.3 + speedFactor * 0.7;

    const baseDelay = 10 + distance * 0.05;
    const delay = baseDelay / speedFactor + (Math.random() - 0.5) * 6;
    await new Promise(r => setTimeout(r, Math.max(5, delay)));
  }

  return true;
}

/**
 * CDP 真人点击（带轨迹）
 */
async function cdpHumanClick(tabId, x, y) {
  if (!cdpConfig.enabled) return false;
  if (!await ensureDebuggerAttached(tabId)) return false;

  // 移动到目标位置（带轨迹）
  await cdpHumanMouseMove(tabId, x, y);

  // 悬停延迟（更自然的范围）
  await naturalDelay(40, 150);

  // 按下
  const floatX = addFloatJitter(x);
  const floatY = addFloatJitter(y);
  await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x: floatX,
    y: floatY,
    button: 'left',
    clickCount: 1,
  });

  // 按压时间（真人 50-150ms，使用自然延迟）
  await naturalDelay(60, 100);

  // 释放
  await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x: floatX,
    y: floatY,
    button: 'left',
    clickCount: 1,
  });

  // 点击后延迟（更宽的范围）
  await naturalDelay(80, 300);

  return true;
}

/**
 * CDP 真人输入（带随机延迟）
 */
async function cdpHumanType(tabId, text) {
  if (!cdpConfig.enabled || !cdpConfig.attachedTabs.has(tabId)) return false;

  // 3% 概率模拟打错字
  const simulateTypo = Math.random() < 0.03;
  let typoIndex = simulateTypo ? Math.floor(text.length * (0.3 + Math.random() * 0.4)) : -1;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    // 模拟打错字
    if (i === typoIndex) {
      const wrongChar = String.fromCharCode(char.charCodeAt(0) + (Math.random() > 0.5 ? 1 : -1));
      await cdpKeyDown(tabId, wrongChar, wrongChar);
      await naturalDelay(40, 120);
      await cdpKeyUp(tabId, wrongChar);
      await naturalDelay(80, 300); // 发现错误

      // 删除
      await cdpKeyDown(tabId, 'Backspace');
      await naturalDelay(30, 90);
      await cdpKeyUp(tabId, 'Backspace');
      await naturalDelay(60, 180); // 纠正延迟
    }

    await cdpKeyDown(tabId, char, char);
    await naturalDelay(40, 120);
    await cdpKeyUp(tabId, char);

    // 随机延迟（使用更自然的分布）
    let delay = 25 + Math.random() * 85 + (Math.random() < 0.15 ? Math.random() * 30 : 0);

    // 5% 概率停顿更久
    if (Math.random() < 0.05) {
      delay += 200 + Math.random() * 400;
    }

    // 标点符号后多等一会
    if ([',', '.', '!', '?', '，', '。', '！', '？'].includes(char)) {
      delay += 100 + Math.random() * 200;
    }

    await new Promise(r => setTimeout(r, delay));
  }

  return true;
}

/**
 * 随机延迟（增强随机性）
 */
function randomDelay(min, max) {
  // 基础随机
  let delay = min + Math.random() * (max - min);
  // 偶尔添加额外偏移，避免固定模式
  if (Math.random() < 0.15) {
    delay += (Math.random() - 0.5) * (max - min) * 0.3;
  }
  return new Promise(r => setTimeout(r, Math.max(10, delay)));
}

/**
 * 自然随机延迟（避免固定模式）
 * 使用分段随机和偶尔的长停顿模拟人类行为
 */
function naturalDelay(baseMs, varianceMs) {
  // 基础延迟 + 方差
  let delay = baseMs + Math.random() * varianceMs;
  // 偶尔添加额外的随机因子
  if (Math.random() < 0.2) {
    delay += (Math.random() - 0.3) * varianceMs * 0.5;
  }
  // 确保最小值
  return new Promise(r => setTimeout(r, Math.max(10, delay)));
}

/**
 * CDP 评论功能（真人行为）
 */
async function cdpXhsComment(tabId, text) {
  if (!cdpConfig.enabled) return { success: false, error: 'CDP 未启用', needCdp: true };
  if (!await ensureDebuggerAttached(tabId)) return { success: false, error: 'Debugger 附加失败' };

  // 思考时间
  await randomDelay(400, 1000);

  // 1. 获取评论按钮位置并点击
  const chatBtnResult = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      const btn = document.querySelector('.chat-wrapper');
      if (!btn) return null;
      const rect = btn.getBoundingClientRect();
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2, visible: rect.width > 0 };
    },
  });

  const chatBtnPos = chatBtnResult[0]?.result;
  if (!chatBtnPos) return { success: false, error: '未找到评论按钮' };

  await cdpHumanClick(tabId, chatBtnPos.x, chatBtnPos.y);
  await randomDelay(800, 1500); // 等待评论区加载

  // 2. 获取输入框位置并点击
  const inputResult = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      // 多种选择器尝试
      const selectors = ['#content-textarea', '[contenteditable="true"]', 'textarea[placeholder*="评论"]'];
      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el) {
          const rect = el.getBoundingClientRect();
          return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2, visible: rect.width > 0 };
        }
      }
      return null;
    },
  });

  const inputPos = inputResult[0]?.result;
  if (!inputPos) return { success: false, error: '未找到评论输入框' };

  await cdpHumanClick(tabId, inputPos.x, inputPos.y);
  await randomDelay(200, 400);

  // 3. 输入评论内容
  await cdpHumanType(tabId, text);
  await randomDelay(300, 600);

  // 4. 获取发送按钮位置并点击
  const submitResult = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      const selectors = ['button.btn.submit', 'button[class*="submit"]:not([disabled])', '[class*="send-btn"]:not([disabled])'];
      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el && !el.disabled) {
          const rect = el.getBoundingClientRect();
          return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2, visible: rect.width > 0 };
        }
      }
      return null;
    },
  });

  const submitPos = submitResult[0]?.result;
  if (!submitPos) return { success: false, error: '未找到发送按钮' };

  await cdpHumanClick(tabId, submitPos.x, submitPos.y);
  await randomDelay(500, 1000);

  // 5. 验证发送结果
  const verifyResult = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      // 检查是否有错误提示
      const errorEl = document.querySelector('[class*="error"]:not([style*="none"])');
      if (errorEl && errorEl.offsetParent !== null) {
        return { hasError: true, message: errorEl.textContent || '发送失败' };
      }
      return { hasError: false };
    },
  });

  const verify = verifyResult[0]?.result;
  if (verify?.hasError) {
    return { success: false, error: verify.message };
  }

  return { success: true, message: '评论已发送', method: 'cdp', isTrusted: true };
}

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
      return true;
    }
  } catch (e) {
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

        executingCommandId = cmd.id;

        try {
          // 命令执行前的思考时间（模拟人类反应时间）
          const thinkTime = 30 + Math.random() * 100;
          await new Promise(r => setTimeout(r, thinkTime));

          const result = await executeCommand(cmd);
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
  }
}

// 执行命令
async function executeCommand(cmd) {

  try {
    switch (cmd.action) {
      case 'navigate': {

        let createdTab = null;

        // 检查 activeTabId 是否有效
        let tabExists = false;
        if (activeTabId) {
          try {
            await chrome.tabs.get(activeTabId);
            tabExists = true;
          } catch {
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

        // 等待加载完成（最多10秒）
        await new Promise(resolve => {
          const timeout = setTimeout(() => {
            chrome.tabs.onUpdated.removeListener(listener);
            resolve(undefined);
          }, 10000);

          const listener = (tabId, info) => {
            if (tabId === activeTabId && info.status === 'complete') {
              clearTimeout(timeout);
              chrome.tabs.onUpdated.removeListener(listener);
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
        } catch (e) {
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
          await setCdpMode(cmd.cdp);
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
          return { success: response?.success, result: response?.data, error: response?.error };
        } catch (e) {
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

        // 优先使用 CDP 模式（更安全，isTrusted=true）
        if (cdpConfig.enabled) {
          const result = await cdpXhsComment(tabId, cmd.text);
          return result;
        }

        // 回退到 content script
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
      await connectDaemon();
    }
    // 确保轮询继续运行
    pollCommands();
  }
});

// 监听 Service Worker 启动
chrome.runtime.onInstalled.addListener(() => {
  connected = false; // 重置连接状态
  loadCdpConfig();   // 加载持久化的 CDP 配置
  connectDaemon();
  startAlarms();
  startRandomPolling();
});

chrome.runtime.onStartup.addListener(() => {
  connected = false; // 重置连接状态
  loadCdpConfig();   // 加载持久化的 CDP 配置
  connectDaemon();
  startAlarms();
  startRandomPolling();
});

// 标记轮询是否已启动
let pollingStarted = false;

// 随机间隔轮询（避免固定频率被检测）
function startRandomPolling() {
  if (pollingStarted) return;
  pollingStarted = true;

  const scheduleNextPoll = () => {
    // 随机间隔 60-300ms（更宽的范围避免固定模式）
    // 使用分段随机让分布更自然
    const baseDelay = 60 + Math.random() * 240;
    // 偶尔添加额外延迟（模拟网络波动）
    const extraDelay = (Math.random() < 0.15) ? Math.random() * 50 : 0;
    const delay = baseDelay + extraDelay;
    setTimeout(async () => {
      if (!connected) {
        await connectDaemon();
      }
      await pollCommands();
      scheduleNextPoll();
    }, delay);
  };

  const scheduleNextHeartbeat = () => {
    // 随机间隔 2500-4000ms（平均 ~3s）
    const delay = 2500 + Math.random() * 1500;
    setTimeout(async () => {
      if (!connected) {
        await connectDaemon();
      }
      await heartbeat();
      scheduleNextHeartbeat();
    }, delay);
  };

  // 立即开始一次
  pollCommands();
  heartbeat();

  // 启动随机间隔轮询
  scheduleNextPoll();
  scheduleNextHeartbeat();
}

// 初始化
loadCdpConfig();  // 加载持久化的 CDP 配置
connectDaemon();
startAlarms();
startRandomPolling();
