/**
 * XHS CLI Bridge - Content Script
 *
 * 在页面上下文中执行真人行为模拟
 * 包括：鼠标轨迹、随机延迟、打字模拟、滚动模拟
 *
 * 安全特性：
 * - isTrusted 欺骗
 * - 动态行为噪声
 * - 完整事件链
 * - 随机微操作
 */

(function() {
  'use strict';

  // ==================== 配置 ====================

  const CONFIG = {
    mouseSpeed: 200,        // 鼠标移动基础速度 (px/s)
    typingSpeed: 80,        // 打字基础速度 (ms/字符)
    scrollSpeed: 300,       // 滚动基础速度 (px/次)
    randomness: 0.3,        // 随机程度 (0-1)
    behaviorNoise: true,    // 行为噪声（防止机器学习检测）
    highFreqJitter: true,   // 高频抖动（模拟手部微颤）
  };

  // ==================== 隐蔽状态存储 ====================
  // 使用 WeakMap 和 Symbol 实现更隐蔽的状态存储，避免全局变量被检测

  const _stateKey = Symbol.for('_xhs_' + Math.random().toString(36).slice(2, 10));
  const _stateStore = new WeakMap();

  // 获取状态的隐蔽访问器
  function getState() {
    if (!_stateStore.has(window)) {
      // 初始化状态 - 使用更随机的初始位置
      const viewportWidth = Math.min(window.innerWidth, 1920);
      const viewportHeight = Math.min(window.innerHeight, 1080);
      _stateStore.set(window, {
        mousePos: {
          x: Math.floor(50 + Math.random() * (viewportWidth - 100)),
          y: Math.floor(50 + Math.random() * (viewportHeight - 100))
        },
        sessionStart: Date.now(),
        actionCount: 0,
        lastActionTime: 0,
        // 动态噪声参数（动态化以避免固定模式）
        noiseParams: {
          microActionProb: 0.03 + Math.random() * 0.05,
          hoverProb: 0.10 + Math.random() * 0.10,
          correctionProb: 0.05 + Math.random() * 0.10,
          pageMoveProb: 0.03 + Math.random() * 0.05,
          thinkProb: 0.08 + Math.random() * 0.07,
          lastUpdate: Date.now(),
        },
        // 速度曲线参数 - 动态化
        speedCurve: {
          accelRatio: 0.15 + Math.random() * 0.10,  // 加速阶段比例
          decelRatio: 0.15 + Math.random() * 0.10,  // 减速阶段比例
          minSpeedFactor: 0.2 + Math.random() * 0.15,
        },
      });
    }
    return _stateStore.get(window);
  }

  // 便捷访问
  const _state = { get current() { return getState(); } };

  // ==================== isTrusted 欺骗 ====================

  /**
   * 创建带有 isTrusted=true 欺骗的事件
   * 使用多层欺骗策略
   */
  function createTrustedEvent(type, eventInit, eventType = 'Mouse') {
    const EventClass = eventType === 'Mouse' ? MouseEvent :
                       eventType === 'Pointer' ? PointerEvent :
                       eventType === 'Keyboard' ? KeyboardEvent :
                       eventType === 'Wheel' ? WheelEvent : Event;

    const event = new EventClass(type, eventInit);

    // 尝试多种方法覆盖 isTrusted 属性
    try {
      // 方法1: 直接定义属性
      Object.defineProperty(event, 'isTrusted', {
        value: true,
        writable: false,
        configurable: true,
        enumerable: true
      });
    } catch (e) {
      // 方法2: 使用 getter
      try {
        Object.defineProperty(event, 'isTrusted', {
          get: function() { return true; },
          configurable: true,
          enumerable: true
        });
      } catch (e2) {
        // 静默失败，某些浏览器不允许修改
      }
    }

    return event;
  }

  /**
   * 分发事件并尝试绕过检测
   */
  function dispatchTrustedEvent(target, event) {
    if (!target) return;

    try {
      // 使用原生 dispatchEvent 方法，避免被 hook
      const nativeDispatch = EventTarget.prototype.dispatchEvent;
      nativeDispatch.call(target, event);
    } catch (e) {
      // 降级到普通分发
      target.dispatchEvent(event);
    }
  }

  /**
   * 创建完整的鼠标事件
   */
  function createMouseEvent(type, x, y, extraInit = {}) {
    const state = _state.current;
    const lastPos = state.mousePos;

    // 计算 movementX/Y（相对于上次位置的偏移）
    const movementX = x - lastPos.x;
    const movementY = y - lastPos.y;

    const baseInit = {
      bubbles: true,
      cancelable: type !== 'mouseenter' && type !== 'mouseleave',
      clientX: x,
      clientY: y,
      screenX: x + window.screenX,
      screenY: y + window.screenY,
      button: extraInit.button !== undefined ? extraInit.button : 0,
      buttons: extraInit.buttons !== undefined ? extraInit.buttons : 0,
      relatedTarget: extraInit.relatedTarget || null,
      view: window,
      detail: 0,
      ctrlKey: false,
      altKey: false,
      shiftKey: false,
      metaKey: false,
      movementX: movementX,
      movementY: movementY,
    };

    return createTrustedEvent(type, { ...baseInit, ...extraInit }, 'Mouse');
  }

  /**
   * 获取或创建 InputDeviceCapabilities 对象
   */
  let _inputDeviceCapabilities = null;
  function getInputDeviceCapabilities() {
    if (!_inputDeviceCapabilities && typeof InputDeviceCapabilities !== 'undefined') {
      try {
        _inputDeviceCapabilities = new InputDeviceCapabilities({
          fireTouchEvents: false,
        });
      } catch (e) {
        // 某些浏览器可能不支持
      }
    }
    return _inputDeviceCapabilities;
  }

  /**
   * 创建完整的 Pointer 事件
   */
  function createPointerEvent(type, x, y, extraInit = {}) {
    const isDown = type.includes('down');
    const isUp = type.includes('up');

    const baseInit = {
      bubbles: true,
      cancelable: true,
      pointerId: 1,
      pointerType: 'mouse',
      isPrimary: true,
      clientX: x,
      clientY: y,
      screenX: x + window.screenX,
      screenY: y + window.screenY,
      button: isDown || isUp ? 0 : -1,
      buttons: isDown ? 1 : (isUp ? 0 : 0),
      pressure: isDown ? 0.5 : 0,
      tiltX: 0,
      tiltY: 0,
      twist: 0,
      tangentialPressure: 0,
      width: 1,
      height: 1,
      view: window,
      ctrlKey: false,
      altKey: false,
      shiftKey: false,
      metaKey: false,
    };

    return createTrustedEvent(type, { ...baseInit, ...extraInit }, 'Pointer');
  }

  // ==================== 动态噪声参数更新 ====================

  /**
   * 更新动态噪声参数
   * 定期更新以避免固定模式
   */
  function updateNoiseParams() {
    const state = _state.current;
    const now = Date.now();
    // 每 30-90 秒更新一次参数
    if (now - state.noiseParams.lastUpdate > random(30000, 90000)) {
      state.noiseParams = {
        microActionProb: random(0.03, 0.08),
        hoverProb: random(0.10, 0.20),
        correctionProb: random(0.05, 0.15),
        pageMoveProb: random(0.03, 0.08),
        thinkProb: random(0.08, 0.15),
        lastUpdate: now,
      };
      // 同时更新速度曲线参数
      state.speedCurve = {
        accelRatio: random(0.12, 0.22),
        decelRatio: random(0.12, 0.22),
        minSpeedFactor: random(0.20, 0.35),
      };
    }
  }

  // ==================== 行为噪声生成器 ====================

  /**
   * 生成行为噪声，防止机器学习检测
   */
  const behaviorNoise = {
    /**
     * 生成随机微操作
     * 在主要操作之间插入无意义的小动作
     */
    async randomMicroAction() {
      if (!CONFIG.behaviorNoise) return;

      updateNoiseParams();
      const state = _state.current;
      const prob = state.noiseParams.microActionProb;

      if (Math.random() < prob) {
        const actions = [
          // 随机移动一小段
          async () => {
            const offsetX = random(-20, 20);
            const offsetY = random(-20, 20);
            const newX = Math.max(0, state.mousePos.x + offsetX);
            const newY = Math.max(0, state.mousePos.y + offsetY);
            await humanMouseMove(newX, newY);
          },
          // 随机滚动一点点
          async () => {
            window.scrollBy(0, random(-30, 30));
          },
          // 短暂停顿（模拟思考）
          async () => {
            await sleep(random(100, 300));
          },
          // 随机焦点切换
          async () => {
            const randomElement = document.elementsFromPoint(
              random(100, window.innerWidth - 100),
              random(100, window.innerHeight - 100)
            )[0];
            if (randomElement && randomElement.focus) {
              try { randomElement.focus(); } catch (e) {}
            }
          },
          // 随机滚动到页面顶部再回来
          async () => {
            const currentScroll = window.scrollY;
            window.scrollTo({ top: 0, behavior: 'instant' });
            await sleep(random(100, 300));
            window.scrollTo({ top: currentScroll, behavior: 'instant' });
          },
          // 模拟选择文本
          async () => {
            const selection = window.getSelection();
            if (selection) {
              selection.removeAllRanges();
            }
          },
        ];
        const action = actions[Math.floor(Math.random() * actions.length)];
        await action();
      }
    },

    /**
     * 计算自适应延迟
     * 根据会话时长和操作频率调整延迟（动态阈值）
     * 增强随机性和自然性
     */
    getAdaptiveDelay(baseMs) {
      const state = _state.current;
      const sessionDuration = Date.now() - state.sessionStart;
      const actionsPerMinute = state.actionCount / Math.max(sessionDuration / 60000, 0.1);

      // 动态阈值：根据时间段变化
      // 模拟真人：刚开始快，之后变慢，偶尔又快一点
      const hour = new Date().getHours();
      const dayOfWeek = new Date().getDay();

      // 工作日工作时间稍快，周末和夜间稍慢
      let timeFactor = 1.0;
      if (dayOfWeek === 0 || dayOfWeek === 6) {
        timeFactor = 1.2; // 周末更慢
      } else if (hour >= 9 && hour <= 12) {
        timeFactor = 0.9; // 上午工作高峰
      } else if (hour >= 14 && hour <= 18) {
        timeFactor = 0.95; // 下午工作时间
      } else if (hour >= 22 || hour <= 6) {
        timeFactor = 1.3; // 深夜更慢
      }

      // 动态阈值（带随机偏移）
      const baseThreshold = 20 + gaussian(10, 3); // 均值30，有波动

      // 如果操作太频繁，增加延迟
      let multiplier = 1;
      if (actionsPerMinute > baseThreshold) {
        multiplier = 1 + Math.pow((actionsPerMinute - baseThreshold) / baseThreshold, 1.5) * timeFactor;
      }

      // 会话疲劳：长时间操作后变慢
      const fatigueFactor = 1 + Math.min(sessionDuration / 3600000, 0.5); // 最多增加50%

      // 多层随机变化
      const noise = 1 + gaussian(0, 0.3); // 高斯噪声
      const burstFactor = Math.random() < 0.05 ? random(0.5, 0.8) : 1; // 5%概率突然变快（爆发操作）

      const finalDelay = baseMs * multiplier * fatigueFactor * noise * timeFactor / burstFactor;

      // 确保在合理范围内
      return Math.max(baseMs * 0.3, Math.min(baseMs * 3, finalDelay));
    },

    /**
     * 记录操作
     */
    recordAction() {
      const state = _state.current;
      state.actionCount++;
      state.lastActionTime = Date.now();
      updateNoiseParams();
    }
  };

  // ==================== 工具函数 ====================

  /**
   * 随机数生成
   */
  function random(min, max) {
    return min + Math.random() * (max - min);
  }

  /**
   * 随机延迟（使用自适应延迟）
   */
  function randomDelay(baseMs) {
    return behaviorNoise.getAdaptiveDelay(baseMs);
  }

  /**
   * 高斯分布随机数
   */
  function gaussian(mean, stdDev) {
    const u1 = Math.random();
    const u2 = Math.random();
    const z = Math.sqrt(-2 * Math.log(u1 || 0.0001)) * Math.cos(2 * Math.PI * u2);
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
   * 根据移动距离动态调整参数，避免固定模式被检测
   */
  function generateBezierPoints(start, end, steps) {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    // 根据距离动态调整控制点偏移范围
    // 距离越大，偏移范围越大，但不是线性关系
    const baseOffset = Math.min(distance * 0.3, 100);
    const offsetVariance = baseOffset * (0.5 + Math.random());

    // 控制点位置参数也随机化，不总是固定在 0.2-0.4 和 0.6-0.8
    const cp1Ratio = random(0.15, 0.45);
    const cp2Ratio = random(0.55, 0.85);

    // 计算移动方向的垂直向量，用于生成弧度
    const angle = Math.atan2(dy, dx);
    const perpX = -Math.sin(angle);
    const perpY = Math.cos(angle);

    // 弧度方向随机（向左弯或向右弯）
    const arcDirection = Math.random() > 0.5 ? 1 : -1;
    const arcAmount = random(0.1, 0.4) * distance * arcDirection;

    // 偶尔生成"奇怪"的轨迹（模拟疲劳、分心）
    const isErratic = Math.random() < 0.08;

    // 控制点1
    const cp1 = {
      x: start.x + dx * cp1Ratio + perpX * arcAmount * 0.5 + random(-offsetVariance, offsetVariance),
      y: start.y + dy * cp1Ratio + perpY * arcAmount * 0.5 + random(-offsetVariance, offsetVariance),
    };

    // 控制点2
    const cp2 = {
      x: start.x + dx * cp2Ratio + perpX * arcAmount + random(-offsetVariance, offsetVariance),
      y: start.y + dy * cp2Ratio + perpY * arcAmount + random(-offsetVariance, offsetVariance),
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
        // 基础抖动
        const baseJitter = 1 + distance * 0.01;
        x += random(-baseJitter, baseJitter);
        y += random(-baseJitter, baseJitter);

        // "奇怪"轨迹额外抖动
        if (isErratic && Math.random() < 0.3) {
          x += random(-8, 8);
          y += random(-8, 8);
        }

        // 高频微颤（模拟手部自然抖动）
        if (CONFIG.highFreqJitter) {
          // 频率约 8-12Hz，振幅 0.5-2px
          const microJitter = Math.sin(i * 0.8 + Math.random()) * random(0.5, 2);
          const microJitterY = Math.cos(i * 0.6 + Math.random()) * random(0.5, 2);
          x += microJitter;
          y += microJitterY;
        }
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
    const state = _state.current;
    const currentPos = state.mousePos;

    // 计算步数（基于距离，添加随机性）
    const distance = Math.sqrt(Math.pow(x - currentPos.x, 2) + Math.pow(y - currentPos.y, 2));
    const baseSteps = Math.floor(distance / (15 + random(5, 15)));
    const steps = Math.max(8, Math.min(40, baseSteps));

    // 生成贝塞尔曲线路径
    const path = generateBezierPoints(currentPos, { x, y }, steps);

    let lastElement = null;

    // 模拟移动事件
    for (let i = 0; i < path.length; i++) {
      const point = path[i];

      // 获取当前位置下的元素
      const elementUnderPoint = document.elementFromPoint(point.x, point.y);

      // 触发 mouseout/mouseover 事件（元素变化时）
      if (lastElement && lastElement !== elementUnderPoint) {
        // 离开上一个元素
        dispatchTrustedEvent(lastElement, createMouseEvent('mouseout', point.x, point.y, {
          relatedTarget: elementUnderPoint
        }));
        dispatchTrustedEvent(lastElement, createMouseEvent('mouseleave', point.x, point.y, {
          relatedTarget: elementUnderPoint
        }));

        // 进入新元素
        if (elementUnderPoint) {
          dispatchTrustedEvent(elementUnderPoint, createMouseEvent('mouseover', point.x, point.y, {
            relatedTarget: lastElement
          }));
          dispatchTrustedEvent(elementUnderPoint, createMouseEvent('mouseenter', point.x, point.y, {
            relatedTarget: lastElement
          }));
        }
      }

      // 触发 mousemove 事件
      const moveEvent = createMouseEvent('mousemove', point.x, point.y);
      if (elementUnderPoint) {
        dispatchTrustedEvent(elementUnderPoint, moveEvent);
      }
      // 同时在 document 上触发
      dispatchTrustedEvent(document, createMouseEvent('mousemove', point.x, point.y));

      lastElement = elementUnderPoint;

      // 更新记录的位置（隐蔽存储）
      state.mousePos = point;

      // 延迟计算：中间快，两头慢（加速-匀速-减速）
      // 使用动态化的速度曲线参数
      const progress = i / path.length;
      const curve = state.speedCurve;
      let speedFactor;
      if (progress < curve.accelRatio) {
        // 加速阶段
        speedFactor = (progress / curve.accelRatio);
      } else if (progress > (1 - curve.decelRatio)) {
        // 减速阶段
        speedFactor = ((1 - progress) / curve.decelRatio);
      } else {
        // 匀速阶段
        speedFactor = 1;
      }
      speedFactor = curve.minSpeedFactor + speedFactor * (1 - curve.minSpeedFactor);

      const baseDelay = 10 + distance * 0.05;
      const delay = baseDelay / speedFactor + random(-3, 3);
      await sleep(Math.max(5, delay));
    }
  }

  // ==================== 真人行为噪声 ====================

  /**
   * 随机悬停 - 模拟在移动过程中停顿
   */
  async function randomHover(duration = 100) {
    updateNoiseParams();
    const state = _state.current;
    if (Math.random() < state.noiseParams.hoverProb) {
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
    updateNoiseParams();
    const state = _state.current;
    const prob = state.noiseParams.correctionProb;

    if (Math.random() < prob) {
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
    updateNoiseParams();
    const state = _state.current;
    const prob = state.noiseParams.pageMoveProb;

    if (Math.random() < prob) {
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
    updateNoiseParams();
    const state = _state.current;
    // 使用动态概率
    if (Math.random() < state.noiseParams.thinkProb) {
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
   * 创建 Touch 事件
   */
  function createTouch(x, y, identifier = 0) {
    return new Touch({
      identifier,
      target: document.elementFromPoint(x, y) || document.body,
      clientX: x,
      clientY: y,
      pageX: x + window.scrollX,
      pageY: y + window.scrollY,
      screenX: x,
      screenY: y,
      radiusX: 5,
      radiusY: 5,
      rotationAngle: 0,
      force: 0.5
    });
  }

  /**
   * 创建 TouchEvent 事件参数
   */
  function createTouchEventInit(type, touches, changedTouches) {
    return {
      bubbles: true,
      cancelable: true,
      view: window,
      detail: 0,
      ctrlKey: false,
      altKey: false,
      shiftKey: false,
      metaKey: false,
      touches: touches,
      targetTouches: touches,
      changedTouches: changedTouches
    };
  }

  /**
   * 模拟真人点击（包含完整事件链）
   * 确保事件序列完整：mousemove -> mouseover -> mouseenter -> (mousemove) -> mousedown -> mouseup -> click
   */
  async function humanClick(x, y, options = {}) {
    const { doubleClick = false, moveFirst = true, withTouch = false } = options;

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

    // 如果需要 touch 事件（移动端网站）
    if (withTouch) {
      const touch = createTouch(clickedPos.x, clickedPos.y);
      const touchStartInit = createTouchEventInit('touchstart', [touch], [touch]);
      element.dispatchEvent(new TouchEvent('touchstart', touchStartInit));

      await sleep(random(30, 80));

      const touchEndInit = createTouchEventInit('touchend', [], [touch]);
      element.dispatchEvent(new TouchEvent('touchend', touchEndInit));

      await sleep(random(10, 30));
    }

    // ==================== 完整事件链 ====================
    // 1. pointerover -> pointerenter -> mouseover -> mouseenter
    dispatchTrustedEvent(element, createPointerEvent('pointerover', clickedPos.x, clickedPos.y));
    dispatchTrustedEvent(element, createPointerEvent('pointerenter', clickedPos.x, clickedPos.y));
    dispatchTrustedEvent(element, createMouseEvent('mouseover', clickedPos.x, clickedPos.y));
    dispatchTrustedEvent(element, createMouseEvent('mouseenter', clickedPos.x, clickedPos.y));

    await sleep(random(20, 60));

    // 2. 在元素上小范围移动（模拟真实行为）
    const microMoveX = clickedPos.x + random(-2, 2);
    const microMoveY = clickedPos.y + random(-2, 2);
    dispatchTrustedEvent(element, createMouseEvent('mousemove', microMoveX, microMoveY));

    await sleep(random(10, 30));

    // 3. pointerdown -> mousedown
    dispatchTrustedEvent(element, createPointerEvent('pointerdown', clickedPos.x, clickedPos.y));
    dispatchTrustedEvent(element, createMouseEvent('mousedown', clickedPos.x, clickedPos.y, {
      button: 0,
      buttons: 1
    }));

    // 按下延迟（真实按压时间，更广泛的范围）
    // 大多数人点击按压时间在 60-120ms，但也有快速点击和慢速点击
    const pressDuration = gaussian(85, 25); // 均值 85ms，标准差 25ms
    await sleep(Math.max(40, Math.min(200, pressDuration)));

    // 4. pointerup -> mouseup -> click
    dispatchTrustedEvent(element, createPointerEvent('pointerup', clickedPos.x, clickedPos.y));
    dispatchTrustedEvent(element, createMouseEvent('mouseup', clickedPos.x, clickedPos.y, {
      button: 0,
      buttons: 0
    }));

    await sleep(random(5, 15));

    // 5. click 事件 - 添加 sourceCapabilities
    const clickEvent = createMouseEvent('click', clickedPos.x, clickedPos.y, {
      button: 0
    });
    // 添加 sourceCapabilities（InputDeviceCapabilities）
    try {
      Object.defineProperty(clickEvent, 'sourceCapabilities', {
        value: getInputDeviceCapabilities(),
        writable: false,
        configurable: true,
        enumerable: true
      });
    } catch (e) {}

    dispatchTrustedEvent(element, createPointerEvent('click', clickedPos.x, clickedPos.y));
    dispatchTrustedEvent(element, clickEvent);

    // 双击
    if (doubleClick) {
      await sleep(random(80, 200));

      const doublePos = addJitter(clickedPos.x, clickedPos.y, 3);

      // 完整双击序列
      dispatchTrustedEvent(element, createPointerEvent('pointerdown', doublePos.x, doublePos.y));
      dispatchTrustedEvent(element, createMouseEvent('mousedown', doublePos.x, doublePos.y, { button: 0, buttons: 1 }));
      await sleep(random(50, 100));
      dispatchTrustedEvent(element, createPointerEvent('pointerup', doublePos.x, doublePos.y));
      dispatchTrustedEvent(element, createMouseEvent('mouseup', doublePos.x, doublePos.y, { button: 0, buttons: 0 }));
      dispatchTrustedEvent(element, createPointerEvent('click', doublePos.x, doublePos.y));
      dispatchTrustedEvent(element, createMouseEvent('click', doublePos.x, doublePos.y, { button: 0 }));
      dispatchTrustedEvent(element, createPointerEvent('dblclick', doublePos.x, doublePos.y));
      dispatchTrustedEvent(element, createMouseEvent('dblclick', doublePos.x, doublePos.y, { button: 0 }));
    }

    // 6. 点击后移开（mouseleave/pointerleave）
    await sleep(random(50, 150));
    dispatchTrustedEvent(element, createMouseEvent('mouseleave', clickedPos.x, clickedPos.y));
    dispatchTrustedEvent(element, createPointerEvent('pointerleave', clickedPos.x, clickedPos.y));

    // 点击后延迟
    await thinkTime(150, 400);

    // 记录操作并可能执行微操作
    behaviorNoise.recordAction();
    await behaviorNoise.randomMicroAction();

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
      const wheelEvent = createTrustedEvent('wheel', {
        bubbles: true,
        cancelable: true,
        deltaY: actualDelta,
        deltaMode: 0,  // pixels
        view: window,
      }, 'Wheel');
      window.dispatchEvent(wheelEvent);

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

  // ==================== 代码执行（绑过 CSP）====================

  /**
   * 安全序列化，处理 Set/Map/循环引用
   */
  function safeStringify(obj) {
    try {
      return JSON.stringify(obj, (key, value) => {
        if (value instanceof Set) return Array.from(value);
        if (value instanceof Map) return Object.fromEntries(value);
        if (typeof value === 'function') return value.toString();
        return value;
      });
    } catch (e) {
      return JSON.stringify({ error: 'Cannot serialize result: ' + e.message });
    }
  }

  /**
   * 在页面上下文中执行 JavaScript 代码
   * 通过创建 script 元素注入，绑过 CSP 限制
   * 使用 DOM 属性传递结果，避免 postMessage 问题
   */
  function execCode(code) {
    return new Promise((resolve) => {
      const requestId = 'xhs_exec_' + Date.now() + '_' + Math.random().toString(36).slice(2);
      const attrName = 'data-' + requestId;

      // 创建 script 元素注入代码
      const script = document.createElement('script');
      // 注意：把 safeStringify 内联到注入的脚本中
      script.textContent = `
        (function() {
          function safeStringify(obj) {
            try {
              return JSON.stringify(obj, (key, value) => {
                if (value instanceof Set) return Array.from(value);
                if (value instanceof Map) return Object.fromEntries(value);
                return value;
              });
            } catch(e) {
              return JSON.stringify({ error: 'Serialize error: ' + e.message });
            }
          }
          try {
            const result = ${code};
            document.documentElement.setAttribute('${attrName}', safeStringify({ success: true, data: result }));
          } catch(e) {
            document.documentElement.setAttribute('${attrName}', safeStringify({ success: false, error: e.message }));
          }
        })();
      `;
      document.documentElement.appendChild(script);
      script.remove();

      // 轮询检查结果
      let attempts = 0;
      const maxAttempts = 50; // 5 秒
      const checkResult = () => {
        attempts++;
        const attrValue = document.documentElement.getAttribute(attrName);
        if (attrValue !== null) {
          document.documentElement.removeAttribute(attrName);
          try {
            const parsed = JSON.parse(attrValue);
            resolve(parsed);
          } catch (e) {
            resolve({ success: false, error: 'Parse error: ' + e.message });
          }
        } else if (attempts < maxAttempts) {
          setTimeout(checkResult, 100);
        } else {
          resolve({ success: false, error: 'Timeout after ' + attempts + ' attempts' });
        }
      };
      setTimeout(checkResult, 50);
    });
  }

  // ==================== 消息监听 ====================

  // 监听来自 background 的消息
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

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

          case 'execCode':
            result = await execCode(message.code);
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

})();
