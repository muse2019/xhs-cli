/**
 * XHS CLI Bridge - Content Script
 *
 * 在页面上下文中执行真人行为模拟
 * 包括：鼠标轨迹、随机延迟、打字模拟、滚动模拟
 */

(function() {
  'use strict';

  // ==================== 配置 ====================

  const CONFIG = {
    mouseSpeed: 200,        // 鼠标移动基础速度 (px/s)
    typingSpeed: 80,        // 打字基础速度 (ms/字符)
    scrollSpeed: 300,       // 滚动基础速度 (px/次)
    randomness: 0.3,        // 随机程度 (0-1)
  };

  // ==================== 工具函数 ====================

  /**
   * 随机数生成
   */
  function random(min, max) {
    return min + Math.random() * (max - min);
  }

  /**
   * 随机延迟
   */
  function randomDelay(baseMs) {
    const variance = baseMs * CONFIG.randomness;
    return baseMs + random(-variance, variance);
  }

  /**
   * 高斯分布随机数
   */
  function gaussian(mean, stdDev) {
    const u1 = Math.random();
    const u2 = Math.random();
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return mean + z * stdDev;
  }

  /**
   * 睡眠
   */
  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // ==================== 鼠标轨迹模拟 ====================

  /**
   * 生成贝塞尔曲线控制点
   */
  function generateBezierPoints(start, end, steps) {
    // 随机生成两个控制点
    const cp1 = {
      x: start.x + (end.x - start.x) * random(0.2, 0.4) + random(-50, 50),
      y: start.y + (end.y - start.y) * random(0.2, 0.4) + random(-50, 50),
    };

    const cp2 = {
      x: start.x + (end.x - start.x) * random(0.6, 0.8) + random(-50, 50),
      y: start.y + (end.y - start.y) * random(0.6, 0.8) + random(-50, 50),
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
        x += random(-2, 2);
        y += random(-2, 2);
      }

      points.push({ x: Math.round(x), y: Math.round(y) });
    }

    return points;
  }

  /**
   * 模拟真人鼠标移动
   * 使用 CDP Input.dispatchMouseEvent
   */
  async function humanMouseMove(x, y) {
    // 获取当前鼠标位置（模拟）
    const currentPos = window.__xhs_mouse_pos || { x: random(100, 500), y: random(100, 500) };

    // 计算步数（基于距离）
    const distance = Math.sqrt(Math.pow(x - currentPos.x, 2) + Math.pow(y - currentPos.y, 2));
    const steps = Math.max(10, Math.min(30, Math.floor(distance / 20)));

    // 生成贝塞尔曲线路径
    const path = generateBezierPoints(currentPos, { x, y }, steps);

    // 模拟移动事件
    for (let i = 0; i < path.length; i++) {
      const point = path[i];

      // 触发 mousemove 事件
      const event = new MouseEvent('mousemove', {
        bubbles: true,
        cancelable: true,
        clientX: point.x,
        clientY: point.y,
      });
      document.elementFromPoint?.(point.x, point.y)?.dispatchEvent(event);

      // 更新记录的位置
      window.__xhs_mouse_pos = point;

      // 随机延迟（中间快，两头慢）
      const progress = i / path.length;
      const speedFactor = Math.sin(progress * Math.PI);
      const delay = randomDelay(15) * (1 + (1 - speedFactor) * 0.5);
      await sleep(delay);
    }
  }

  // ==================== 点击模拟 ====================

  /**
   * 模拟真人点击
   */
  async function humanClick(x, y, options = {}) {
    const { doubleClick = false, moveFirst = true } = options;

    // 先移动到目标位置
    if (moveFirst) {
      await humanMouseMove(x, y);
    }

    // 悬停延迟
    await sleep(randomDelay(100));

    const element = document.elementFromPoint(x, y);
    if (!element) {
      return { success: false, error: 'No element at position' };
    }

    // mousedown
    const downEvent = new MouseEvent('mousedown', {
      bubbles: true,
      cancelable: true,
      clientX: x,
      clientY: y,
      button: 0,
    });
    element.dispatchEvent(downEvent);

    // 按下延迟
    await sleep(random(50, 100));

    // mouseup
    const upEvent = new MouseEvent('mouseup', {
      bubbles: true,
      cancelable: true,
      clientX: x,
      clientY: y,
      button: 0,
    });
    element.dispatchEvent(upEvent);

    // click
    const clickEvent = new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      clientX: x,
      clientY: y,
      button: 0,
    });
    element.dispatchEvent(clickEvent);

    // 双击
    if (doubleClick) {
      await sleep(random(50, 150));

      element.dispatchEvent(new MouseEvent('mousedown', {
        bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0,
      }));
      await sleep(random(50, 100));
      element.dispatchEvent(new MouseEvent('mouseup', {
        bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0,
      }));
      element.dispatchEvent(new MouseEvent('click', {
        bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0,
      }));
      element.dispatchEvent(new MouseEvent('dblclick', {
        bubbles: true, cancelable: true, clientX: x, clientY: y,
      }));
    }

    // 点击后延迟
    await sleep(randomDelay(200));

    return { success: true };
  }

  // ==================== 打字模拟 ====================

  /**
   * 模拟真人打字
   */
  async function humanType(element, text) {
    if (!element) {
      return { success: false, error: 'Element not found' };
    }

    // 聚焦
    element.focus();

    // 聚焦延迟
    await sleep(randomDelay(150));

    for (let i = 0; i < text.length; i++) {
      const char = text[i];

      // keydown
      element.dispatchEvent(new KeyboardEvent('keydown', {
        bubbles: true,
        cancelable: true,
        key: char,
      }));

      // keypress
      element.dispatchEvent(new KeyboardEvent('keypress', {
        bubbles: true,
        cancelable: true,
        key: char,
      }));

      // 输入字符
      if (element.isContentEditable) {
        document.execCommand('insertText', false, char);
      } else if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
        const nativeSetter = Object.getOwnPropertyDescriptor(
          element.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype,
          'value'
        )?.set;
        if (nativeSetter) {
          nativeSetter.call(element, element.value + char);
        } else {
          element.value += char;
        }
      }

      // input 事件
      element.dispatchEvent(new Event('input', { bubbles: true }));

      // keyup
      element.dispatchEvent(new KeyboardEvent('keyup', {
        bubbles: true,
        cancelable: true,
        key: char,
      }));

      // 随机打字延迟
      let delay = randomDelay(CONFIG.typingSpeed);

      // 偶尔停顿更久（模拟思考）
      if (Math.random() < 0.05) {
        delay += random(200, 500);
      }

      await sleep(delay);
    }

    // change 事件
    element.dispatchEvent(new Event('change', { bubbles: true }));

    return { success: true };
  }

  // ==================== 滚动模拟 ====================

  /**
   * 模拟真人滚动
   */
  async function humanScroll(direction, amount) {
    const steps = 3 + Math.floor(random(1, 4));
    const stepAmount = amount / steps;

    for (let i = 0; i < steps; i++) {
      const delta = direction === 'up' ? -stepAmount : stepAmount;
      const actualDelta = delta * random(0.8, 1.2);

      // wheel 事件
      window.dispatchEvent(new WheelEvent('wheel', {
        bubbles: true,
        cancelable: true,
        deltaY: actualDelta,
      }));

      // 实际滚动
      window.scrollBy(0, actualDelta);

      await sleep(randomDelay(150));
    }
  }

  /**
   * 随机滚动浏览
   */
  async function randomScroll(durationMs) {
    const startTime = Date.now();

    while (Date.now() - startTime < durationMs) {
      const direction = Math.random() > 0.3 ? 'down' : 'up';
      const amount = random(100, 400);

      await humanScroll(direction, amount);
      await sleep(random(500, 2000));
    }
  }

  // ==================== 元素操作 ====================

  /**
   * 查找元素并获取位置
   */
  function getElementBounds(selector) {
    const element = document.querySelector(selector);
    if (!element) {
      return null;
    }

    const rect = element.getBoundingClientRect();
    return {
      element,
      x: rect.x + rect.width / 2,
      y: rect.y + rect.height / 2,
      width: rect.width,
      height: rect.height,
    };
  }

  /**
   * 真人风格点击元素
   */
  async function humanClickElement(selector) {
    const bounds = getElementBounds(selector);
    if (!bounds) {
      return { success: false, error: 'Element not found' };
    }

    // 滚动到可见
    bounds.element.scrollIntoView({ behavior: 'instant', block: 'center' });
    await sleep(300);

    // 重新获取位置
    const newBounds = getElementBounds(selector);
    if (!newBounds) {
      return { success: false, error: 'Element not visible' };
    }

    return await humanClick(newBounds.x, newBounds.y);
  }

  /**
   * 真人风格输入
   */
  async function humanTypeElement(selector, text) {
    const bounds = getElementBounds(selector);
    if (!bounds) {
      return { success: false, error: 'Element not found' };
    }

    // 先点击聚焦
    await humanClick(bounds.x, bounds.y);

    // 输入
    return await humanType(bounds.element, text);
  }

  // ==================== 思考延迟 ====================

  /**
   * 模拟思考时间
   */
  async function thinkTime() {
    const base = random(200, 800);
    // 10% 概率思考更久
    if (Math.random() < 0.1) {
      await sleep(base + random(500, 1500));
    } else {
      await sleep(base);
    }
  }

  /**
   * 模拟阅读时间
   */
  async function readTime(text) {
    const wordCount = text.length;
    const wpm = random(200, 300);
    const minutes = wordCount / wpm;
    await sleep(Math.max(500, minutes * 60000));
  }

  // ==================== 小红书专用操作 ====================

  /**
   * 小红书 - 真人风格点赞
   */
  async function xhsLike() {
    await thinkTime();

    const likeBtn = document.querySelector('.like-wrapper');
    if (!likeBtn) {
      return { success: false, error: '未找到点赞按钮' };
    }

    if (likeBtn.classList.contains('like-active')) {
      return { success: false, error: '已经点赞过了' };
    }

    // 获取按钮位置
    const rect = likeBtn.getBoundingClientRect();
    const x = rect.x + rect.width / 2 + random(-5, 5);
    const y = rect.y + rect.height / 2 + random(-5, 5);

    await humanClick(x, y);
    return { success: true, message: '点赞成功' };
  }

  /**
   * 小红书 - 真人风格收藏
   */
  async function xhsCollect() {
    await thinkTime();

    const collectBtn = document.querySelector('.collect-wrapper');
    if (!collectBtn) {
      return { success: false, error: '未找到收藏按钮' };
    }

    if (collectBtn.classList.contains('collect-active')) {
      return { success: false, error: '已经收藏过了' };
    }

    const rect = collectBtn.getBoundingClientRect();
    const x = rect.x + rect.width / 2 + random(-5, 5);
    const y = rect.y + rect.height / 2 + random(-5, 5);

    await humanClick(x, y);
    return { success: true, message: '收藏成功' };
  }

  /**
   * 小红书 - 真人风格评论
   */
  async function xhsComment(text) {
    await thinkTime();

    // 点击评论按钮打开评论区
    const chatBtn = document.querySelector('.chat-wrapper');
    if (chatBtn) {
      const rect = chatBtn.getBoundingClientRect();
      await humanClick(rect.x + rect.width / 2, rect.y + rect.height / 2);
      await sleep(random(800, 1500));
    }

    // 找到输入框
    const input = document.querySelector('#content-textarea, [contenteditable="true"]');
    if (!input) {
      return { success: false, error: '未找到评论输入框' };
    }

    // 点击输入框
    const inputRect = input.getBoundingClientRect();
    await humanClick(inputRect.x + inputRect.width / 2, inputRect.y + inputRect.height / 2);
    await sleep(random(200, 400));

    // 输入评论
    await humanType(input, text);
    await sleep(random(300, 600));

    // 发送
    const submitBtn = document.querySelector('button.btn.submit, [class*="submit"]');
    if (submitBtn) {
      const btnRect = submitBtn.getBoundingClientRect();
      await humanClick(btnRect.x + btnRect.width / 2, btnRect.y + btnRect.height / 2);
      return { success: true, message: '评论已发送' };
    }

    return { success: false, error: '未找到发送按钮' };
  }

  /**
   * 小红书 - 浏览笔记
   */
  async function xhsBrowseNote(durationMs) {
    const content = document.querySelector('.note-text, [class*="content"]');
    const textLength = content?.textContent?.length || 0;

    // 阅读内容
    await readTime(content?.textContent || '');

    // 随机滚动
    const remaining = durationMs - textLength * 5;
    if (remaining > 0) {
      await randomScroll(remaining);
    }
  }

  // ==================== 消息监听 ====================

  // 监听来自 background 的消息
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('[XHS Content] Received message:', message.action);

    // 异步处理
    (async () => {
      let result;

      try {
        switch (message.action) {
          case 'humanClick':
            result = await humanClick(message.x, message.y, message.options);
            break;

          case 'humanClickElement':
            result = await humanClickElement(message.selector);
            break;

          case 'humanType':
            result = await humanTypeElement(message.selector, message.text);
            break;

          case 'humanScroll':
            result = await humanScroll(message.direction, message.amount);
            break;

          case 'randomScroll':
            result = await randomScroll(message.durationMs);
            break;

          case 'xhsLike':
            result = await xhsLike();
            break;

          case 'xhsCollect':
            result = await xhsCollect();
            break;

          case 'xhsComment':
            result = await xhsComment(message.text);
            break;

          case 'xhsBrowseNote':
            result = await xhsBrowseNote(message.durationMs);
            break;

          default:
            result = { success: false, error: 'Unknown action' };
        }
      } catch (e) {
        result = { success: false, error: e.message };
      }

      sendResponse(result);
    })();

    // 返回 true 表示异步响应
    return true;
  });

  // 初始化鼠标位置
  window.__xhs_mouse_pos = {
    x: random(100, 500),
    y: random(100, 500),
  };

  console.log('[XHS Content] Loaded with human behavior simulation');

})();
