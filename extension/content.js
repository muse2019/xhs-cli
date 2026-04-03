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

  // ==================== 隐蔽状态存储 ====================
  // 使用 WeakMap 代替全局变量，避免被检测

  const _state = {
    mousePos: { x: 100 + Math.random() * 400, y: 100 + Math.random() * 400 },
  };

  // 使用随机属性名进一步隐藏
  const _obfuscatedKey = '_x' + Math.random().toString(36).slice(2, 8);

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
    // 获取当前鼠标位置（使用隐蔽状态）
    const currentPos = _state.mousePos;

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

      // 更新记录的位置（隐蔽存储）
      _state.mousePos = point;

      // 随机延迟（中间快，两头慢）
      const progress = i / path.length;
      const speedFactor = Math.sin(progress * Math.PI);
      const delay = randomDelay(15) * (1 + (1 - speedFactor) * 0.5);
      await sleep(delay);
    }
  }

  // ==================== 真人行为噪声 ====================

  /**
   * 随机悬停 - 模拟在移动过程中停顿
   */
  async function randomHover(duration = 100) {
    if (Math.random() < 0.15) {  // 15% 概率悬停
      await sleep(duration + random(0, 200));
    }
  }

  /**
   * 偶尔偏离目标 - 模拟真人手抖/不准
   * 返回偏移后的坐标
   */
  function addJitter(x, y, maxOffset = 5) {
    // 80% 概率小偏移，20% 概率稍大偏移
    const jitter = Math.random() < 0.8 ? maxOffset : maxOffset * 2;
    return {
      x: x + random(-jitter, jitter),
      y: y + random(-jitter, jitter),
    };
  }

  /**
   * 模拟"失误"移动 - 先移动到错误位置，再纠正
   */
  async function moveWithCorrection(targetX, targetY) {
    // 10% 概率模拟失误
    if (Math.random() < 0.1) {
      // 先移动到附近但不准确的位置
      const wrongX = targetX + random(-30, 30);
      const wrongY = targetY + random(-30, 30);
      await humanMouseMove(wrongX, wrongY);
      await sleep(random(100, 300));  // 短暂停顿
      // 纠正到正确位置
      await humanMouseMove(targetX, targetY);
    } else {
      await humanMouseMove(targetX, targetY);
    }
  }

  /**
   * 随机页面外移动 - 模拟用户查看其他区域
   */
  async function randomPageMove() {
    if (Math.random() < 0.05) {  // 5% 概率
      const randomX = random(50, window.innerWidth - 50);
      const randomY = random(50, window.innerHeight - 50);
      await humanMouseMove(randomX, randomY);
      await sleep(random(200, 500));
    }
  }

  /**
   * 思考时间 - 随机延迟模拟人类思考
   */
  async function thinkTime(minMs = 200, maxMs = 800) {
    const base = random(minMs, maxMs);
    // 10% 概率思考更久
    if (Math.random() < 0.1) {
      await sleep(base + random(500, 1500));
    } else {
      await sleep(base);
    }
  }

  // ==================== 点击模拟 ====================

  /**
   * 创建 PointerEvent 事件参数
   */
  function createPointerEventInit(type, x, y, isPrimary = true) {
    return {
      bubbles: true,
      cancelable: true,
      pointerId: isPrimary ? 1 : Math.floor(Math.random() * 1000),
      pointerType: 'mouse',
      isPrimary,
      clientX: x,
      clientY: y,
      button: type.includes('down') || type.includes('up') ? 0 : -1,
      buttons: type.includes('down') ? 1 : 0,
      pressure: type.includes('down') ? 0.5 : 0,
      tiltX: 0,
      tiltY: 0,
      twist: 0,
      tangentialPressure: 0,
      width: 1,
      height: 1,
    };
  }

  /**
   * 模拟真人点击（包含 PointerEvent）
   */
  async function humanClick(x, y, options = {}) {
    const { doubleClick = false, moveFirst = true } = options;

    // 随机页面外移动（模拟查看其他区域）
    await randomPageMove();

    // 先移动到目标位置（可能带有"失误"纠正）
    if (moveFirst) {
      await moveWithCorrection(x, y);
    }

    // 添加抖动
    const clickedPos = addJitter(x, y);

    // 悬停延迟（模拟看目标）
    await randomHover();
    await thinkTime(100, 300);

    const element = document.elementFromPoint(clickedPos.x, clickedPos.y);
    if (!element) {
      return { success: false, error: 'No element at position' };
    }

    // pointerover -> pointerenter -> mouseover -> mouseenter
    element.dispatchEvent(new PointerEvent('pointerover', createPointerEventInit('over', clickedPos.x, clickedPos.y)));
    element.dispatchEvent(new PointerEvent('pointerenter', createPointerEventInit('enter', clickedPos.x, clickedPos.y)));
    element.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, cancelable: true, clientX: clickedPos.x, clientY: clickedPos.y }));
    element.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false, cancelable: false, clientX: clickedPos.x, clientY: clickedPos.y }));

    await sleep(random(20, 60));

    // pointerdown -> mousedown
    element.dispatchEvent(new PointerEvent('pointerdown', createPointerEventInit('down', clickedPos.x, clickedPos.y)));
    element.dispatchEvent(new MouseEvent('mousedown', {
      bubbles: true,
      cancelable: true,
      clientX: clickedPos.x,
      clientY: clickedPos.y,
      button: 0,
    }));

    // 按下延迟（真实按压时间）
    await sleep(random(50, 120));

    // pointerup -> mouseup -> click
    element.dispatchEvent(new PointerEvent('pointerup', createPointerEventInit('up', clickedPos.x, clickedPos.y)));
    element.dispatchEvent(new MouseEvent('mouseup', {
      bubbles: true,
      cancelable: true,
      clientX: clickedPos.x,
      clientY: clickedPos.y,
      button: 0,
    }));
    element.dispatchEvent(new PointerEvent('click', createPointerEventInit('click', clickedPos.x, clickedPos.y)));
    element.dispatchEvent(new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      clientX: clickedPos.x,
      clientY: clickedPos.y,
      button: 0,
    }));

    // 双击
    if (doubleClick) {
      await sleep(random(80, 200));

      const doublePos = addJitter(clickedPos.x, clickedPos.y, 3);
      element.dispatchEvent(new PointerEvent('pointerdown', createPointerEventInit('down', doublePos.x, doublePos.y)));
      element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, clientX: doublePos.x, clientY: doublePos.y, button: 0 }));
      await sleep(random(50, 100));
      element.dispatchEvent(new PointerEvent('pointerup', createPointerEventInit('up', doublePos.x, doublePos.y)));
      element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, clientX: doublePos.x, clientY: doublePos.y, button: 0 }));
      element.dispatchEvent(new PointerEvent('click', createPointerEventInit('click', doublePos.x, doublePos.y)));
      element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientX: doublePos.x, clientY: doublePos.y, button: 0 }));
      element.dispatchEvent(new PointerEvent('dblclick', createPointerEventInit('dblclick', doublePos.x, doublePos.y)));
      element.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true, clientX: doublePos.x, clientY: doublePos.y }));
    }

    // 点击后延迟
    await thinkTime(150, 400);

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
    await thinkTime(100, 200);

    // 3% 概率模拟打错字
    const simulateTypo = Math.random() < 0.03;
    let typoIndex = simulateTypo ? Math.floor(random(text.length * 0.3, text.length * 0.7)) : -1;

    for (let i = 0; i < text.length; i++) {
      const char = text[i];

      // 模拟打错字
      if (i === typoIndex) {
        // 打一个错误的字符
        const wrongChar = String.fromCharCode(char.charCodeAt(0) + (Math.random() > 0.5 ? 1 : -1));
        await typeChar(element, wrongChar);
        await sleep(random(100, 300));  // 发现错误

        // 删除
        await typeChar(element, 'Backspace');
        await sleep(random(100, 200));  // 纠正延迟
      }

      await typeChar(element, char);

      // 随机打字延迟
      let delay = randomDelay(CONFIG.typingSpeed);

      // 5% 概率停顿更久（模拟思考）
      if (Math.random() < 0.05) {
        delay += random(200, 600);
      }

      // 标点符号后多等一会
      if ([',', '.', '!', '?', '，', '。', '！', '？'].includes(char)) {
        delay += random(100, 300);
      }

      await sleep(delay);
    }

    // change 事件
    element.dispatchEvent(new Event('change', { bubbles: true }));

    return { success: true };
  }

  /**
   * 输入单个字符
   */
  async function typeChar(element, char) {
    const isBackspace = char === 'Backspace';

    // keydown
    element.dispatchEvent(new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: char,
    }));

    if (!isBackspace) {
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
    } else {
      // 删除最后一个字符
      if (element.isContentEditable) {
        document.execCommand('delete', false);
      } else if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
        element.value = element.value.slice(0, -1);
        element.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }

    // keyup
    element.dispatchEvent(new KeyboardEvent('keyup', {
      bubbles: true,
      cancelable: true,
      key: char,
    }));
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
      // 每步滚动量有变化
      const actualDelta = delta * random(0.7, 1.3);

      // wheel 事件
      window.dispatchEvent(new WheelEvent('wheel', {
        bubbles: true,
        cancelable: true,
        deltaY: actualDelta,
        deltaMode: 0,  // pixels
      }));

      // 实际滚动
      window.scrollBy(0, actualDelta);

      // 滚动间隔有变化
      await sleep(randomDelay(100 + i * 20));  // 越往后越慢
    }

    // 滚动后偶尔停顿
    if (Math.random() < 0.2) {
      await sleep(random(200, 500));
    }
  }

  /**
   * 随机滚动浏览
   */
  async function randomScroll(durationMs) {
    const startTime = Date.now();
    let totalScrolled = 0;

    while (Date.now() - startTime < durationMs) {
      // 70% 向下，30% 向上（但如果已经滚动很多，可能回头看看）
      let direction;
      if (totalScrolled > window.innerHeight * 3 && Math.random() < 0.4) {
        direction = 'up';  // 回头看看
      } else {
        direction = Math.random() > 0.3 ? 'down' : 'up';
      }

      const amount = random(80, 350);
      await humanScroll(direction, amount);

      totalScrolled += amount;

      // 阅读停顿
      const pause = random(300, 1500);
      // 偶尔停更久（模拟仔细阅读）
      const isReading = Math.random() < 0.15;
      await sleep(isReading ? pause + random(500, 1500) : pause);

      // 偶尔移动鼠标
      if (Math.random() < 0.1) {
        const randomX = random(100, window.innerWidth - 100);
        const randomY = random(100, window.innerHeight - 100);
        await humanMouseMove(randomX, randomY);
      }
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

  // ==================== 阅读时间 ====================

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
    // 随机思考时间
    await thinkTime(300, 800);

    const likeBtn = document.querySelector('.like-wrapper');
    if (!likeBtn) {
      return { success: false, error: '未找到点赞按钮' };
    }

    if (likeBtn.classList.contains('like-active')) {
      return { success: false, error: '已经点赞过了' };
    }

    // 获取按钮位置，添加随机偏移
    const rect = likeBtn.getBoundingClientRect();
    const x = rect.x + rect.width / 2 + random(-8, 8);
    const y = rect.y + rect.height / 2 + random(-8, 8);

    await humanClick(x, y);
    return { success: true, message: '点赞成功' };
  }

  /**
   * 小红书 - 真人风格收藏
   */
  async function xhsCollect() {
    await thinkTime(300, 800);

    const collectBtn = document.querySelector('.collect-wrapper');
    if (!collectBtn) {
      return { success: false, error: '未找到收藏按钮' };
    }

    if (collectBtn.classList.contains('collect-active')) {
      return { success: false, error: '已经收藏过了' };
    }

    const rect = collectBtn.getBoundingClientRect();
    const x = rect.x + rect.width / 2 + random(-8, 8);
    const y = rect.y + rect.height / 2 + random(-8, 8);

    await humanClick(x, y);
    return { success: true, message: '收藏成功' };
  }

  /**
   * 小红书 - 真人风格评论
   */
  async function xhsComment(text) {
    await thinkTime(400, 1000);

    // 点击评论按钮打开评论区
    const chatBtn = document.querySelector('.chat-wrapper');
    if (chatBtn) {
      const rect = chatBtn.getBoundingClientRect();
      await humanClick(rect.x + rect.width / 2, rect.y + rect.height / 2);
      await sleep(random(600, 1200));
    }

    // 找到输入框
    const input = document.querySelector('#content-textarea, [contenteditable="true"]');
    if (!input) {
      return { success: false, error: '未找到评论输入框' };
    }

    // 点击输入框
    const inputRect = input.getBoundingClientRect();
    await humanClick(inputRect.x + inputRect.width / 2, inputRect.y + inputRect.height / 2);
    await thinkTime(200, 400);

    // 输入评论
    await humanType(input, text);
    await thinkTime(300, 600);

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

  // 初始化完成（不再使用全局变量）
  console.log('[XHS Content] Loaded with human behavior simulation');

})();
