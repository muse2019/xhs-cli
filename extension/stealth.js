/**
 * Stealth Script - 注入反检测代码
 *
 * 在页面加载前（document_start）注入，隐藏自动化痕迹
 */

(function() {
  'use strict';

  // ========== 隐蔽的重复注入检测 ==========
  // 使用不可枚举的 Symbol 作为标记，比普通属性更难检测
  const stealthKey = Symbol.for('_s' + Math.random().toString(36).slice(2, 8));

  // 检查是否已注入（通过闭包变量，不暴露到 window）
  const hasInjected = (() => {
    try {
      // 尝试从 document 读取隐藏标记
      const marker = document.currentScript?.getAttribute('data-' + stealthKey.toString().slice(1, 8));
      if (marker) return true;

      // 备用检测：检查特定原型修改
      const testProp = '_st' + Date.now().toString(36);
      const descriptor = Object.getOwnPropertyDescriptor(EventTarget.prototype, testProp);
      if (descriptor) return true;

      return false;
    } catch {
      return false;
    }
  })();

  if (hasInjected) return;

  // 设置隐藏标记（使用多个隐蔽位置）
  try {
    // 方法1：在原型上设置不可枚举标记
    const markerProp = '_st' + Math.random().toString(36).slice(2, 6);
    Object.defineProperty(EventTarget.prototype, markerProp, {
      value: true,
      enumerable: false,
      configurable: true,
      writable: false
    });
  } catch {}

  // ========== 1. navigator.webdriver 伪装 ==========
  try {
    Object.defineProperty(navigator, 'webdriver', {
      get: () => false,
      configurable: true,
    });
  } catch {}

  // ========== 2. window.chrome 假对象 ==========
  try {
    if (!window.chrome) {
      // 生成随机的扩展 ID（26个字符，a-p）
      const generateFakeId = () => {
        const chars = 'abcdefghijklmnop';
        let id = '';
        for (let i = 0; i < 32; i++) {
          id += chars[Math.floor(Math.random() * chars.length)];
        }
        return id;
      };

      window.chrome = {
        runtime: {
          id: generateFakeId(),
          onConnect: { addListener: () => {}, removeListener: () => {} },
          onMessage: { addListener: () => {}, removeListener: () => {} },
          connect: function() { return { onDisconnect: { addListener: () => {} }, onMessage: { addListener: () => {} }, postMessage: () => {} }; },
          sendMessage: function() {},
        },
        loadTimes: function() {
          return {
            commitLoadTime: Date.now() / 1000 - Math.random() * 2,
            connectionInfo: 'http/1.1',
            finishDocumentLoadTime: Date.now() / 1000 - Math.random(),
            finishLoadTime: Date.now() / 1000,
            firstPaintAfterLoadTime: 0,
            firstPaintTime: Date.now() / 1000 - 1,
            navigationType: 'Other',
            npnNegotiatedProtocol: 'unknown',
            requestTime: Date.now() / 1000 - 2,
            startLoadTime: Date.now() / 1000 - 1.5,
            wasAlternateProtocolAvailable: false,
            wasFetchedViaSpdy: false,
            wasNpnNegotiated: false,
          };
        },
        csi: function() {
          return {
            onloadT: Date.now(),
            pageT: Date.now() - performance.timing.navigationStart,
            startE: performance.timing.navigationStart,
            tran: 15,
          };
        },
        app: {
          isInstalled: false,
          InstallState: { DISABLED: 0, INSTALLED: 1, NOT_INSTALLED: 2 },
          RunningState: { CANNOT_RUN: 0, READY_TO_RUN: 1, RUNNING: 2 },
          getDetails: function() { return null; },
          getIsInstalled: function() { return false; },
          runningState: function() { return 'cannot_run'; },
        },
      };
    }
  } catch {}

  // ========== 3. navigator.plugins 伪装 ==========
  try {
    if (!navigator.plugins || navigator.plugins.length === 0) {
      const fakePlugins = [
        { name: 'PDF Viewer', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
        { name: 'Chrome PDF Viewer', filename: 'internal-pdf-viewer', description: '' },
        { name: 'Chromium PDF Viewer', filename: 'internal-pdf-viewer', description: '' },
        { name: 'Microsoft Edge PDF Viewer', filename: 'internal-pdf-viewer', description: '' },
        { name: 'WebKit built-in PDF', filename: 'internal-pdf-viewer', description: '' },
      ];
      fakePlugins.item = (i) => fakePlugins[i] || null;
      fakePlugins.namedItem = (n) => fakePlugins.find(p => p.name === n) || null;
      fakePlugins.refresh = () => {};
      Object.defineProperty(navigator, 'plugins', {
        get: () => fakePlugins,
        configurable: true,
      });
    }
  } catch {}

  // ========== 4. navigator.languages 伪装 ==========
  try {
    if (!navigator.languages || navigator.languages.length === 0) {
      Object.defineProperty(navigator, 'languages', {
        get: () => ['zh-CN', 'zh', 'en-US', 'en'],
        configurable: true,
      });
    }
  } catch {}

  // ========== 5. Permissions API 修复 ==========
  try {
    const origQuery = window.Permissions?.prototype?.query;
    if (origQuery) {
      window.Permissions.prototype.query = function (parameters) {
        if (parameters?.name === 'notifications') {
          return Promise.resolve({ state: Notification.permission, onchange: null });
        }
        return origQuery.call(this, parameters);
      };
    }
  } catch {}

  // ========== 6. 清除自动化痕迹 ==========
  try {
    delete window.__playwright;
    delete window.__puppeteer;
    for (const prop of Object.getOwnPropertyNames(window)) {
      if (prop.startsWith('cdc_') || prop.startsWith('__cdc_')) {
        try { delete window[prop]; } catch {}
      }
    }
  } catch {}

  // ========== 7. CDP 堆栈清理 ==========
  try {
    const origDescriptor = Object.getOwnPropertyDescriptor(Error.prototype, 'stack');
    const cdpPatterns = [
      'puppeteer_evaluation_script',
      'pptr:',
      'debugger://',
      '__playwright',
      '__puppeteer',
    ];
    if (origDescriptor && origDescriptor.get) {
      Object.defineProperty(Error.prototype, 'stack', {
        get: function () {
          const raw = origDescriptor.get.call(this);
          if (typeof raw !== 'string') return raw;
          return raw.split('\n').filter(line =>
            !cdpPatterns.some(p => line.includes(p))
          ).join('\n');
        },
        configurable: true,
      });
    }
  } catch {}

  // ========== 8. toString 伪装基础设施 ==========
  const origToString = Function.prototype.toString;
  const disguised = new WeakMap();
  try {
    Object.defineProperty(Function.prototype, 'toString', {
      value: function() {
        const override = disguised.get(this);
        return override !== undefined ? override : origToString.call(this);
      },
      writable: true,
      configurable: true,
    });
  } catch {}

  const disguise = (fn, name) => {
    disguised.set(fn, 'function ' + name + '() { [native code] }');
    try {
      Object.defineProperty(fn, 'name', { value: name, configurable: true });
    } catch {}
    return fn;
  };

  // ========== 9. debugger 语句过滤 ==========
  try {
    const OrigFunction = Function;
    const debuggerRe = /(?:^|(?<=[;{}\n\r]))\s*debugger\s*;?/g;
    const cleanDebugger = (src) => typeof src === 'string' ? src.replace(debuggerRe, '') : src;

    const PatchedFunction = function(...args) {
      if (args.length > 0) {
        args[args.length - 1] = cleanDebugger(args[args.length - 1]);
      }
      if (new.target) {
        return Reflect.construct(OrigFunction, args, new.target);
      }
      return OrigFunction.apply(this, args);
    };
    PatchedFunction.prototype = OrigFunction.prototype;
    Object.setPrototypeOf(PatchedFunction, OrigFunction);
    disguise(PatchedFunction, 'Function');
    try { window.Function = PatchedFunction; } catch {}

    const origEval = window.eval;
    const patchedEval = function(code) {
      return origEval.call(this, cleanDebugger(code));
    };
    disguise(patchedEval, 'eval');
    try { window.eval = patchedEval; } catch {}
  } catch {}

  // ========== 10. console 方法伪装 ==========
  try {
    const consoleMethods = ['log', 'warn', 'error', 'info', 'debug', 'table', 'trace', 'dir', 'group', 'groupEnd', 'groupCollapsed', 'clear', 'count', 'assert', 'profile', 'profileEnd', 'time', 'timeEnd', 'timeStamp'];
    for (const m of consoleMethods) {
      if (typeof console[m] !== 'function') continue;
      const origMethod = console[m];
      const nativeStr = 'function ' + m + '() { [native code] }';
      try {
        const currentStr = origToString.call(origMethod);
        if (currentStr === nativeStr) continue;
      } catch {}
      const wrapper = function() { return origMethod.apply(console, arguments); };
      Object.defineProperty(wrapper, 'length', { value: origMethod.length || 0, configurable: true });
      disguise(wrapper, m);
      try { console[m] = wrapper; } catch {}
    }
  } catch {}

  // ========== 11. window 尺寸修复 ==========
  try {
    const normalWidthDelta = window.outerWidth - window.innerWidth;
    const normalHeightDelta = window.outerHeight - window.innerHeight;
    if (normalWidthDelta > 100 || normalHeightDelta > 200) {
      Object.defineProperty(window, 'outerWidth', {
        get: () => window.innerWidth,
        configurable: true,
      });
      const heightOffset = Math.max(40, Math.min(120, normalHeightDelta));
      Object.defineProperty(window, 'outerHeight', {
        get: () => window.innerHeight + heightOffset,
        configurable: true,
      });
    }
  } catch {}

  // ========== 12. Performance API 清理 ==========
  try {
    const origGetEntries = Performance.prototype.getEntries;
    const origGetByType = Performance.prototype.getEntriesByType;
    const origGetByName = Performance.prototype.getEntriesByName;
    const suspiciousPatterns = ['debugger', 'devtools', '__puppeteer', '__playwright', 'pptr:'];
    const filterEntries = (entries) => {
      if (!Array.isArray(entries)) return entries;
      return entries.filter(e => {
        const name = e.name || '';
        return !suspiciousPatterns.some(p => name.includes(p));
      });
    };
    Performance.prototype.getEntries = function() {
      return filterEntries(origGetEntries.call(this));
    };
    Performance.prototype.getEntriesByType = function(type) {
      return filterEntries(origGetByType.call(this, type));
    };
    Performance.prototype.getEntriesByName = function(name, type) {
      return filterEntries(origGetByName.call(this, name, type));
    };
  } catch {}

  // ========== 13. iframe chrome 一致性 ==========
  try {
    const origHTMLIFrame = HTMLIFrameElement.prototype;
    const origContentWindow = Object.getOwnPropertyDescriptor(origHTMLIFrame, 'contentWindow');
    if (origContentWindow && origContentWindow.get) {
      Object.defineProperty(origHTMLIFrame, 'contentWindow', {
        get: function() {
          const w = origContentWindow.get.call(this);
          if (w) {
            try {
              if (!w.chrome) {
                Object.defineProperty(w, 'chrome', {
                  value: window.chrome,
                  writable: true,
                  configurable: true,
                });
              }
            } catch {}
          }
          return w;
        },
        configurable: true,
      });
    }
  } catch {}

  // ========== 14. WebGL 指纹伪装 ==========
  try {
    // 多样化的 GPU 指纹池，避免固定值被识别
    const gpuProfiles = [
      { vendor: 'Intel Inc.', renderer: 'Intel Iris OpenGL Engine' },
      { vendor: 'Intel Inc.', renderer: 'Intel(R) UHD Graphics 620' },
      { vendor: 'Intel Inc.', renderer: 'Intel(R) Iris(R) Xe Graphics' },
      { vendor: 'NVIDIA Corporation', renderer: 'NVIDIA GeForce GTX 1060/PCIe/SSE2' },
      { vendor: 'NVIDIA Corporation', renderer: 'NVIDIA GeForce RTX 3060/PCIe/SSE2' },
      { vendor: 'AMD', renderer: 'AMD Radeon RX 580 Series' },
      { vendor: 'AMD', renderer: 'AMD Radeon(TM) Graphics' },
    ];
    const selectedGpu = gpuProfiles[Math.floor(Math.random() * gpuProfiles.length)];

    const getParameterProxyHandler = {
      apply: function(target, thisArg, args) {
        const param = args[0];
        if (param === 37445) return selectedGpu.vendor;  // UNMASKED_VENDOR_WEBGL
        if (param === 37446) return selectedGpu.renderer;  // UNMASKED_RENDERER_WEBGL
        return Reflect.apply(target, thisArg, args);
      }
    };

    WebGLRenderingContext.prototype.getParameter = new Proxy(
      WebGLRenderingContext.prototype.getParameter,
      getParameterProxyHandler
    );

    if (typeof WebGL2RenderingContext !== 'undefined') {
      WebGL2RenderingContext.prototype.getParameter = new Proxy(
        WebGL2RenderingContext.prototype.getParameter,
        getParameterProxyHandler
      );
    }
  } catch {}

  // ========== 15. Canvas 指纹噪声 ==========
  try {
    const origGetContext = HTMLCanvasElement.prototype.getContext;
    const noise = () => Math.random() * 0.0001;

    HTMLCanvasElement.prototype.getContext = function(type, attributes) {
      const context = origGetContext.call(this, type, attributes);
      if (!context) return context;

      if (type === '2d') {
        const origGetImageData = context.getImageData;
        context.getImageData = function(x, y, w, h) {
          const data = origGetImageData.call(this, x, y, w, h);
          // 添加微弱噪声
          for (let i = 0; i < data.data.length; i += 4) {
            data.data[i] = Math.max(0, Math.min(255, data.data[i] + (noise() > 0.5 ? 1 : -1)));
          }
          return data;
        };
        disguise(context.getImageData, 'getImageData');
      }

      return context;
    };
    disguise(HTMLCanvasElement.prototype.getContext, 'getContext');
  } catch {}

  // ========== 16. Audio 指纹噪声 ==========
  try {
    const origCreateAnalyser = AudioContext.prototype.createAnalyser;
    AudioContext.prototype.createAnalyser = function() {
      const analyser = origCreateAnalyser.call(this);
      const origGetFloatFrequencyData = analyser.getFloatFrequencyData;
      analyser.getFloatFrequencyData = function(array) {
        origGetFloatFrequencyData.call(this, array);
        for (let i = 0; i < array.length; i++) {
          array[i] += (Math.random() - 0.5) * 0.0001;
        }
      };
      disguise(analyser.getFloatFrequencyData, 'getFloatFrequencyData');
      return analyser;
    };
    disguise(AudioContext.prototype.createAnalyser, 'createAnalyser');
  } catch {}

  // ========== 17. DevTools 检测防护 ==========

  // 防止通过 debugger 语句检测
  // 网站用 performance.now() 测量 debugger 执行时间
  try {
    const origNow = performance.now.bind(performance);
    let lastNow = origNow();
    let callCount = 0;

    // 重写 performance.now，返回的时间不能突变
    performance.now = function() {
      const realNow = origNow();
      callCount++;

      // 防止时间倒流
      if (realNow < lastNow) {
        return lastNow;
      }

      // 如果两次调用之间时间跳跃太大（可能是 debugger 暂停），平滑处理
      const delta = realNow - lastNow;
      if (delta > 100 && callCount < 1000) {
        // 返回一个合理的增量
        lastNow = lastNow + Math.min(delta, 50);
        return lastNow;
      }

      lastNow = realNow;
      return realNow;
    };
    disguise(performance.now, 'now');
  } catch {}

  // 防止通过 console.log 的 getter 检测 DevTools
  try {
    const devtoolsDetector = /./;
    let detectorOpened = false;

    Object.defineProperty(devtoolsDetector, 'toString', {
      get: function() {
        // 不设置 opened 标记
        return function() { return ''; };
      }
    });

    // 阻止常见的 DevTools 检测模式
    const origLog = console.log;
    console.log = function(...args) {
      // 检查是否有检测器
      for (const arg of args) {
        if (arg && typeof arg === 'object' && 'opened' in arg) {
          // 伪造 opened 为 false
          Object.defineProperty(arg, 'opened', {
            value: false,
            configurable: true
          });
        }
      }
      return origLog.apply(console, args);
    };
    disguise(console.log, 'log');
  } catch {}

  // 防止通过 window 尺寸检测 DevTools
  // DevTools 打开时 window.outerWidth 会变化
  try {
    const cachedOuterWidth = window.outerWidth || window.innerWidth;
    const cachedOuterHeight = window.outerHeight || window.innerHeight + 100;

    Object.defineProperty(window, 'outerWidth', {
      get: function() {
        // 如果 DevTools 实际关闭，返回真实值
        const realOuter = window.outerWidth;
        // 返回与 innerWidth 的合理差值
        return Math.max(realOuter, window.innerWidth);
      },
      configurable: true
    });

    Object.defineProperty(window, 'outerHeight', {
      get: function() {
        const realOuter = window.outerHeight;
        // DevTools 打开时 outerHeight 会变小
        // 我们返回一个合理的值
        const minExpected = window.innerHeight + 50;
        return Math.max(realOuter, minExpected);
      },
      configurable: true
    });
  } catch {}

  // 防止通过 Function 构造函数检测
  try {
    const origFunction = Function;
    const fnToString = origFunction.prototype.toString;

    // 检测 body 是否包含可疑代码
    origFunction.prototype.toString = function() {
      const str = fnToString.call(this);
      // 如果函数体内包含检测代码，返回正常的函数体
      if (str.includes('debugger') && str.includes('constructor')) {
        return 'function() { [native code] }';
      }
      return str;
    };
  } catch {}

  // ========== 18. 防止时间戳指纹 ==========
  try {
    // Date.now() 和 performance.now() 返回值添加微弱随机性
    const origDateNow = Date.now.bind(Date);
    let timeOffset = Math.random() * 0.5 - 0.25;  // -0.25 到 0.25 ms

    Date.now = function() {
      return Math.floor(origDateNow() + timeOffset);
    };
    disguise(Date.now, 'now');
  } catch {}

  // ========== 19. WebRTC IP 泄露保护 ==========
  try {
    // 阻止 WebRTC 泄露本地 IP
    const rtcConfig = {
      iceServers: []
    };

    // 修改 RTCPeerConnection
    const OrigRTCPeerConnection = window.RTCPeerConnection;
    if (OrigRTCPeerConnection) {
      window.RTCPeerConnection = function(config, constraints) {
        // 移除可能导致 IP 泄露的配置
        const safeConfig = {
          ...config,
          iceServers: [],
          iceCandidatePoolSize: 0
        };
        return new OrigRTCPeerConnection(safeConfig, constraints);
      };
      // 复制原型和静态属性
      window.RTCPeerConnection.prototype = OrigRTCPeerConnection.prototype;
      Object.setPrototypeOf(window.RTCPeerConnection, OrigRTCPeerConnection);
      disguise(window.RTCPeerConnection, 'RTCPeerConnection');
    }

    // 阻止通过 webkitRTCPeerConnection 泄露
    if (window.webkitRTCPeerConnection) {
      window.webkitRTCPeerConnection = window.RTCPeerConnection;
    }

    // 阻止获取本地 IP 的方法
    const origCreateDataChannel = RTCPeerConnection.prototype.createDataChannel;
    RTCPeerConnection.prototype.createDataChannel = function() {
      const channel = origCreateDataChannel.apply(this, arguments);
      // 阻止 ICE 候选泄露
      return channel;
    };
    disguise(RTCPeerConnection.prototype.createDataChannel, 'createDataChannel');
  } catch {}

  // ========== 20. Font 指纹保护 ==========
  try {
    // 随机化字体测量结果
    const origMeasureText = CanvasRenderingContext2D.prototype.measureText;
    CanvasRenderingContext2D.prototype.measureText = function(text) {
      const result = origMeasureText.call(this, text);
      // 添加微弱随机性
      const noise = (Math.random() - 0.5) * 0.1;
      const origWidth = result.width;

      Object.defineProperty(result, 'width', {
        get: function() {
          return origWidth + noise;
        },
        configurable: true
      });

      return result;
    };
    disguise(CanvasRenderingContext2D.prototype.measureText, 'measureText');

    // 伪装字体列表
    const fakeFonts = [
      'Arial', 'Arial Black', 'Comic Sans MS', 'Courier New', 'Georgia',
      'Impact', 'Lucida Console', 'Lucida Sans Unicode', 'Palatino Linotype',
      'Tahoma', 'Times New Roman', 'Trebuchet MS', 'Verdana', 'Microsoft YaHei',
      'SimSun', 'SimHei', 'PingFang SC', 'Heiti SC', 'Songti SC'
    ];

    // 拦截 font 检测脚本常用的方法
    const origGetComputedStyle = window.getComputedStyle;
    window.getComputedStyle = function(element, pseudoElt) {
      const style = origGetComputedStyle.call(window, element, pseudoElt);

      // 如果正在检测字体，返回常见字体
      const origFontFamily = Object.getOwnPropertyDescriptor(CSSStyleDeclaration.prototype, 'fontFamily');
      if (origFontFamily && origFontFamily.get) {
        Object.defineProperty(style, 'fontFamily', {
          get: function() {
            const realFont = origFontFamily.get.call(this);
            // 如果是检测元素，返回伪装的字体
            if (element.id && element.id.includes('font')) {
              return fakeFonts.join(', ');
            }
            return realFont;
          },
          configurable: true
        });
      }

      return style;
    };
    disguise(window.getComputedStyle, 'getComputedStyle');
  } catch {}

  // ========== 21. 屏幕信息伪装 ==========
  try {
    // 常见的屏幕分辨率池 - 使用多样化的分辨率避免指纹固定
    const screenProfiles = [
      { width: 1920, height: 1080, availHeight: 1040 },
      { width: 2560, height: 1440, availHeight: 1400 },
      { width: 1366, height: 768, availHeight: 728 },
      { width: 1536, height: 864, availHeight: 824 },
      { width: 1440, height: 900, availHeight: 860 },
      { width: 2560, height: 1080, availHeight: 1040 },
      { width: 3840, height: 2160, availHeight: 2120 },
    ];
    const selectedScreen = screenProfiles[Math.floor(Math.random() * screenProfiles.length)];

    const commonScreen = {
      width: selectedScreen.width,
      height: selectedScreen.height,
      availWidth: selectedScreen.width,
      availHeight: selectedScreen.availHeight,
      colorDepth: 24,
      pixelDepth: 24
    };

    // 添加微小随机性使指纹不唯一（±1-2像素波动）
    const screenNoise = {
      width: Math.floor(Math.random() * 3) - 1,
      height: Math.floor(Math.random() * 3) - 1,
      availHeight: Math.floor(Math.random() * 5) - 2
    };

    for (const prop of ['width', 'height', 'availWidth', 'availHeight', 'colorDepth', 'pixelDepth']) {
      try {
        Object.defineProperty(screen, prop, {
          get: function() {
            const base = commonScreen[prop] || 1920;
            return base + (screenNoise[prop] || 0);
          },
          configurable: true
        });
      } catch {}
    }

    // devicePixelRatio 也是指纹 - 使用多样化的值
    try {
      const pixelRatios = [1, 1.25, 1.5, 1.75, 2];
      const selectedRatio = pixelRatios[Math.floor(Math.random() * pixelRatios.length)];
      Object.defineProperty(window, 'devicePixelRatio', {
        get: function() {
          return selectedRatio;
        },
        configurable: true
      });
    } catch {}
  } catch {}

  // ========== 22. 硬件信息伪装 ==========
  try {
    // CPU 核心数
    const commonCores = [4, 8, 16];
    const fakeCores = commonCores[Math.floor(Math.random() * commonCores.length)];
    Object.defineProperty(navigator, 'hardwareConcurrency', {
      get: function() {
        return fakeCores;
      },
      configurable: true
    });

    // 设备内存
    const commonMemory = [4, 8, 16];
    const fakeMemory = commonMemory[Math.floor(Math.random() * commonMemory.length)];
    if ('deviceMemory' in navigator) {
      try {
        Object.defineProperty(navigator, 'deviceMemory', {
          get: function() {
            return fakeMemory;
          },
          configurable: true
        });
      } catch {}
    }

    // 电池状态
    if (navigator.getBattery) {
      navigator.getBattery = function() {
        return Promise.resolve({
          charging: true,
          chargingTime: 0,
          dischargingTime: Infinity,
          level: 1
        });
      };
      disguise(navigator.getBattery, 'getBattery');
    }
  } catch {}

  // ========== 23. Touch 支持伪装 ==========
  try {
    // 伪装支持触摸（但不一定在用）
    Object.defineProperty(navigator, 'maxTouchPoints', {
      get: function() {
        return 5;  // 常见的触摸点数量
      },
      configurable: true
    });

    // 添加 TouchEvent 构造函数
    if (typeof TouchEvent === 'undefined') {
      window.TouchEvent = function TouchEvent(type, eventInitDict) {
        return new Event(type, eventInitDict);
      };
    }

    // 添加 Touch 构造函数
    if (typeof Touch === 'undefined') {
      window.Touch = function Touch(touchInitDict) {
        Object.assign(this, touchInitDict);
      };
    }

    // 伪装 ontouchstart 等事件
    const touchEvents = ['touchstart', 'touchmove', 'touchend', 'touchcancel'];
    touchEvents.forEach(event => {
      try {
        Object.defineProperty(document, 'on' + event, {
          get: function() { return null; },
          set: function() {},
          configurable: true
        });
      } catch {}
    });
  } catch {}

  // ========== 24. Network Information API 伪装 ==========
  try {
    if (navigator.connection) {
      const _origConnection = navigator.connection;
      const fakeConnection = {
        effectiveType: ['4g', '3g', 'wifi'][Math.floor(Math.random() * 3)],
        downlink: 1.5 + Math.random() * 8.5, // 1.5-10 Mbps
        rtt: 50 + Math.floor(Math.random() * 150), // 50-200ms
        saveData: false,
        type: 'unknown',
        onchange: null,
        addEventListener: function() {},
        removeEventListener: function() {},
        dispatchEvent: function() { return true; }
      };
      Object.defineProperty(navigator, 'connection', {
        get: function() { return fakeConnection; },
        configurable: true
      });
    }
  } catch {}

  // ========== 25. requestAnimationFrame 帧率伪装 ==========
  try {
    const _origRAF = window.requestAnimationFrame;
    const _rafTimestamps = [];
    let _lastRAFTime = 0;

    window.requestAnimationFrame = function(callback) {
      return _origRAF.call(window, function(timestamp) {
        // 记录时间戳用于帧率分析
        _rafTimestamps.push(timestamp);
        if (_rafTimestamps.length > 10) {
          _rafTimestamps.shift();
        }

        // 添加微小的时间抖动（模拟真实帧率波动）
        const jitter = (Math.random() - 0.5) * 0.5; // ±0.25ms
        const adjustedTimestamp = timestamp + jitter;

        callback(adjustedTimestamp);
      });
    };
    disguise(window.requestAnimationFrame, 'requestAnimationFrame');
  } catch {}

  // ========== 26. Notification.permission 深度伪装 ==========
  try {
    // 确保权限查询结果一致
    const _origPermission = Notification.permission;
    Object.defineProperty(Notification, 'permission', {
      get: function() {
        // 随机返回 'default' 或 'granted'，但保持一致性
        return _origPermission;
      },
      configurable: true
    });

    // 伪装 requestPermission
    const _origRequestPermission = Notification.requestPermission;
    Notification.requestPermission = function() {
      // 模拟用户交互延迟
      return new Promise(function(resolve) {
        setTimeout(function() {
          resolve(Notification.permission);
        }, 100 + Math.random() * 200);
      });
    };
    disguise(Notification.requestPermission, 'requestPermission');
  } catch {}

  // ========== 27. 行为模式伪装 ==========
  try {
    // 记录用户交互历史，用于生成更自然的行为模式
    const interactionHistory = {
      lastClick: 0,
      lastScroll: 0,
      lastKeystroke: 0,
      clickCount: 0,
      scrollCount: 0,
      keystrokeCount: 0
    };

    // 监听真实的用户交互（如果有的话）
    ['click', 'scroll', 'keydown'].forEach(eventType => {
      document.addEventListener(eventType, function() {
        const now = Date.now();
        if (eventType === 'click') {
          interactionHistory.lastClick = now;
          interactionHistory.clickCount++;
        } else if (eventType === 'scroll') {
          interactionHistory.lastScroll = now;
          interactionHistory.scrollCount++;
        } else if (eventType === 'keydown') {
          interactionHistory.lastKeystroke = now;
          interactionHistory.keystrokeCount++;
        }
      }, true);
    });

    // 存储到全局，供其他脚本使用
    window.__xhs_interaction = interactionHistory;
  } catch {}

  // ========== 28. 时区和语言一致性检查 ==========
  try {
    // 确保时区和语言设置一致
    const timezoneOffset = new Date().getTimezoneOffset();
    const expectedOffset = -480; // UTC+8 (中国时区)

    if (timezoneOffset !== expectedOffset) {
      // 如果时区不匹配，伪装 getTimezoneOffset
      Date.prototype.getTimezoneOffset = function() {
        return expectedOffset;
      };
      disguise(Date.prototype.getTimezoneOffset, 'getTimezoneOffset');
    }
  } catch {}

  // ========== 29. 媒体设备伪装 ==========
  try {
    // 伪装媒体设备列表
    if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
      const origEnumerateDevices = navigator.mediaDevices.enumerateDevices;
      navigator.mediaDevices.enumerateDevices = function() {
        return origEnumerateDevices.call(this).then(function(devices) {
          // 返回典型的设备列表
          if (devices.length === 0) {
            return [
              { deviceId: 'default', kind: 'audioinput', label: '', groupId: 'default' },
              { deviceId: 'default', kind: 'audiooutput', label: '', groupId: 'default' },
              { deviceId: 'default', kind: 'videoinput', label: '', groupId: 'default' }
            ];
          }
          return devices;
        });
      };
      disguise(navigator.mediaDevices.enumerateDevices, 'enumerateDevices');
    }
  } catch {}

  // ========== 30. Clipboard API 一致性 ==========
  try {
    // 确保 clipboard API 表现正常
    if (navigator.clipboard) {
      const origReadText = navigator.clipboard.readText;
      const origWriteText = navigator.clipboard.writeText;

      // 包装以保持 toString 一致
      if (origReadText) {
        navigator.clipboard.readText = function() {
          return origReadText.call(this);
        };
        disguise(navigator.clipboard.readText, 'readText');
      }

      if (origWriteText) {
        navigator.clipboard.writeText = function(text) {
          return origWriteText.call(this, text);
        };
        disguise(navigator.clipboard.writeText, 'writeText');
      }
    }
  } catch {}

  // ========== 37. 控制台日志清理 ==========
  // 移除可能暴露检测痕迹的日志
  // 注意：实际运行时不输出任何日志

  // ========== 38. SpeechSynthesis API 伪装 ==========
  try {
    if (window.speechSynthesis) {
      const origGetVoices = speechSynthesis.getVoices;
      speechSynthesis.getVoices = function() {
        const voices = origGetVoices.call(this) || [];
        // 如果没有声音，返回常见的声音列表
        if (voices.length === 0) {
          return [
            { voiceURI: 'Google US English', name: 'Google US English', lang: 'en-US', localService: false, default: true },
            { voiceURI: 'Google 普通话（中国大陆）', name: 'Google 普通话（中国大陆）', lang: 'zh-CN', localService: false, default: false },
            { voiceURI: 'Microsoft Huihui - Chinese (Simplified, PRC)', name: 'Microsoft Huihui', lang: 'zh-CN', localService: true, default: false },
          ];
        }
        return voices;
      };
      disguise(speechSynthesis.getVoices, 'getVoices');
    }
  } catch {}

  // ========== 39. Battery API 更细粒度伪装 ==========
  try {
    if (navigator.getBattery) {
      const origGetBattery = navigator.getBattery;
      navigator.getBattery = function() {
        return Promise.resolve({
          charging: Math.random() > 0.3, // 70% 概率在充电
          chargingTime: Math.random() > 0.5 ? 0 : Infinity,
          dischargingTime: Infinity,
          level: 0.5 + Math.random() * 0.5, // 50%-100% 电量
          addEventListener: function() {},
          removeEventListener: function() {},
          dispatchEvent: function() { return true; },
          onchargingchange: null,
          onchargingtimechange: null,
          ondischargingtimechange: null,
          onlevelchange: null,
        });
      };
      disguise(navigator.getBattery, 'getBattery');
    }
  } catch {}

  // ========== 40. 增强的 iframe 一致性 ==========
  try {
    const origContentWindow = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, 'contentWindow');
    if (origContentWindow && origContentWindow.get) {
      Object.defineProperty(HTMLIFrameElement.prototype, 'contentWindow', {
        get: function() {
          const w = origContentWindow.get.call(this);
          if (w) {
            try {
              // 确保 iframe 内的 chrome 对象一致
              if (!w.chrome && window.chrome) {
                Object.defineProperty(w, 'chrome', {
                  value: window.chrome,
                  writable: true,
                  configurable: true,
                });
              }
              // 确保 navigator.webdriver 一致
              if (w.navigator && Object.getOwnPropertyDescriptor(w.navigator, 'webdriver')) {
                Object.defineProperty(w.navigator, 'webdriver', {
                  get: function() { return false; },
                  configurable: true,
                });
              }
            } catch {}
          }
          return w;
        },
        configurable: true,
      });
    }
  } catch {}

  // ========== 41. Function.prototype.constructor 增强 ==========
  try {
    const origConstructor = Function.prototype.constructor;
    Object.defineProperty(Function.prototype, 'constructor', {
      value: function(...args) {
        // 如果尝试访问 constructor 返回 Function 本身
        if (args.length === 0 || (args.length === 1 && typeof args[0] === 'function')) {
          return origConstructor.apply(this, args);
        }
        // 正常构造函数
        return origConstructor.apply(this, args);
      },
      writable: true,
      configurable: true,
    });
    disguise(Function.prototype.constructor, 'constructor');
  } catch {}

  // ========== 42. CSS 指纹噪声 ==========
  try {
    // 某些网站通过 CSS 计算样式指纹检测
    const origGetComputedStyle = window.getComputedStyle;
    window.getComputedStyle = function(element, pseudoElt) {
      const style = origGetComputedStyle.call(window, element, pseudoElt);

      // 为某些 CSS 属性添加微小噪声
      const noisyProps = ['width', 'height', 'top', 'left', 'right', 'bottom'];
      const handler = {
        get: function(target, prop) {
          const value = Reflect.get(target, prop);
          if (typeof value === 'string' && noisyProps.includes(prop)) {
            // 对于 px 值，添加 ±0.01px 的噪声
            const match = value.match(/^([\d.]+)px$/);
            if (match) {
              const num = parseFloat(match[1]);
              const noise = (Math.random() - 0.5) * 0.02;
              return (num + noise).toFixed(2) + 'px';
            }
          }
          return value;
        }
      };

      return new Proxy(style, handler);
    };
    disguise(window.getComputedStyle, 'getComputedStyle');
  } catch {}

  // ========== 43. 错误堆栈自动清理 ==========
  try {
    const origErrorStack = Object.getOwnPropertyDescriptor(Error.prototype, 'stack');
    if (origErrorStack && origErrorStack.get) {
      Object.defineProperty(Error.prototype, 'stack', {
        get: function() {
          const stack = origErrorStack.get.call(this);
          if (typeof stack !== 'string') return stack;

          // 过滤掉可疑的模式
          const patterns = [
            /puppeteer_evaluation_script/g,
            /pptr:/g,
            /debugger:\/\/\//g,
            /__playwright/g,
            /__puppeteer/g,
            /extension:\/\//g,
            /chrome-extension:\/\//g,
            /eval at/g,
            /<anonymous>/g,
          ];

          let cleaned = stack;
          for (const pattern of patterns) {
            cleaned = cleaned.replace(pattern, '[native]');
          }

          return cleaned;
        },
        configurable: true,
      });
    }
  } catch {}

  // ========== 44. Event.timeStamp 伪装 ==========
  try {
    // 确保事件的 timeStamp 看起来正常
    const origEventConstructor = Event;
    window.Event = function(type, eventInitDict) {
      const event = new origEventConstructor(type, eventInitDict);
      // timeStamp 应该相对于页面加载时间
      try {
        const relativeTime = performance.now();
        Object.defineProperty(event, 'timeStamp', {
          value: relativeTime,
          writable: false,
          configurable: true,
        });
      } catch {}
      return event;
    };
    window.Event.prototype = origEventConstructor.prototype;
    Object.setPrototypeOf(window.Event, origEventConstructor);
  } catch {}

  // ========== 45. PerformanceTiming 增强 ==========
  try {
    // 确保 PerformanceTiming 看起来正常
    const timing = performance.timing;
    const now = Date.now();
    const loadTime = now - Math.floor(Math.random() * 5000 + 1000); // 1-6秒前加载

    // 包装 performance.now 以返回一致的时间
    const origPerfNow = performance.now.bind(performance);
    const startTime = origPerfNow();
    let lastNow = startTime;

    performance.now = function() {
      const currentNow = origPerfNow();
      // 防止时间倒流
      lastNow = Math.max(lastNow, currentNow);
      return lastNow;
    };
    disguise(performance.now, 'now');
  } catch {}

  // ========== 46. requestIdleCallback 伪装 ==========
  try {
    if (typeof window.requestIdleCallback === 'undefined') {
      window.requestIdleCallback = function(callback) {
        const start = Date.now();
        return setTimeout(function() {
          callback({
            didTimeout: false,
            timeRemaining: function() {
              return Math.max(0, 50 - (Date.now() - start));
            },
          });
        }, 1);
      };
      window.cancelIdleCallback = function(id) {
        clearTimeout(id);
      };
    }
  } catch {}

  // ========== 47. 增强 Math.random 不可预测性 ==========
  try {
    // 添加额外的熵到随机数生成
    const origRandom = Math.random;
    let _entropy = Date.now() % 1000;

    Math.random = function() {
      // 使用线性同余生成器添加额外随机性
      _entropy = (_entropy * 1103515245 + 12345) & 0x7fffffff;
      const baseRandom = origRandom.call(Math);
      // 组合原始随机数和熵
      const combined = (baseRandom + _entropy / 0x7fffffff) % 1;
      return combined;
    };
  } catch {}

  // ========== 48. WebSocket 指纹伪装 ==========
  try {
    const OrigWebSocket = window.WebSocket;
    const origSend = OrigWebSocket.prototype.send;

    // 包装 WebSocket 以隐藏特征
    window.WebSocket = function(url, protocols) {
      const ws = new OrigWebSocket(url, protocols);

      // 确保 extensions 和 protocol 属性正常
      try {
        Object.defineProperty(ws, 'extensions', {
          get: function() { return ''; },
          configurable: true,
        });
      } catch {}

      return ws;
    };
    window.WebSocket.prototype = OrigWebSocket.prototype;
    Object.setPrototypeOf(window.WebSocket, OrigWebSocket);

    // 伪装 send 方法
    OrigWebSocket.prototype.send = function(data) {
      return origSend.call(this, data);
    };
    disguise(OrigWebSocket.prototype.send, 'send');
  } catch {}

  // ========== 49. Storage 事件一致性 ==========
  try {
    // 确保 localStorage 和 sessionStorage 行为一致
    const origSetItem = Storage.prototype.setItem;
    const origRemoveItem = Storage.prototype.removeItem;

    let _lastStorageKey = '';
    let _lastStorageOldValue = '';
    let _lastStorageNewValue = '';

    Storage.prototype.setItem = function(key, value) {
      _lastStorageKey = key;
      _lastStorageOldValue = this.getItem(key);
      _lastStorageNewValue = value;
      return origSetItem.call(this, key, value);
    };
    disguise(Storage.prototype.setItem, 'setItem');

    Storage.prototype.removeItem = function(key) {
      _lastStorageKey = key;
      _lastStorageOldValue = this.getItem(key);
      _lastStorageNewValue = null;
      return origRemoveItem.call(this, key);
    };
    disguise(Storage.prototype.removeItem, 'removeItem');
  } catch {}

  // ========== 50. History API 操作痕迹 ==========
  try {
    // 确保历史操作看起来正常
    const origPushState = history.pushState;
    const origReplaceState = history.replaceState;

    history.pushState = function(state, title, url) {
      return origPushState.call(this, state, title, url);
    };
    disguise(history.pushState, 'pushState');

    history.replaceState = function(state, title, url) {
      return origReplaceState.call(this, state, title, url);
    };
    disguise(history.replaceState, 'replaceState');
  } catch {}

  // ========== 51. Service Worker 检测防护 ==========
  try {
    if (navigator.serviceWorker) {
      const origRegister = navigator.serviceWorker.register;
      navigator.serviceWorker.register = function(scriptURL, options) {
        // 正常注册，但隐藏一些特征
        return origRegister.call(this, scriptURL, options);
      };
      disguise(navigator.serviceWorker.register, 'register');
    }
  } catch {}

  // ========== 52. Gamepad API 伪装 ==========
  try {
    if (navigator.getGamepads) {
      const origGetGamepads = navigator.getGamepads;
      navigator.getGamepads = function() {
        // 返回空数组（没有连接游戏手柄）
        return [];
      };
      disguise(navigator.getGamepads, 'getGamepads');
    }
  } catch {}

  // ========== 53. USB API 伪装 ==========
  try {
    if (navigator.usb) {
      Object.defineProperty(navigator, 'usb', {
        get: function() {
          return {
            getDevices: function() { return Promise.resolve([]); },
            requestDevice: function() { return Promise.reject(new Error('No device selected')); },
          };
        },
        configurable: true,
      });
    }
  } catch {}

  // ========== 54. Bluetooth API 伪装 ==========
  try {
    if (navigator.bluetooth) {
      Object.defineProperty(navigator, 'bluetooth', {
        get: function() {
          return {
            getAvailability: function() { return Promise.resolve(false); },
            requestDevice: function() { return Promise.reject(new Error('User cancelled')); },
          };
        },
        configurable: true,
      });
    }
  } catch {}

  // ========== 55. Serial API 伪装 ==========
  try {
    if (navigator.serial) {
      Object.defineProperty(navigator, 'serial', {
        get: function() {
          return {
            getPorts: function() { return Promise.resolve([]); },
            requestPort: function() { return Promise.reject(new Error('No port selected')); },
          };
        },
        configurable: true,
      });
    }
  } catch {}

  // ========== 56. 最终清理 ==========
  try {
    // 移除所有可能暴露的痕迹
    delete window.cdc_adoQpoasnfa76pfcZLmcfl_Array;
    delete window.cdc_adoQpoasnfa76pfcZLmcfl_Promise;
    delete window.cdc_adoQpoasnfa76pfcZLmcfl_Symbol;
    delete window.cdc_adoQpoasnfa76pfcZLmcfl_JSON;
    delete window.cdc_adoQpoasnfa76pfcZLmcfl_Object;

    // 清理可能泄露的全局变量
    const leakedKeys = ['$cdc_', '$wdc_', '__nightmare', '__phantomas'];
    for (const key of leakedKeys) {
      try { delete window[key]; } catch {}
    }
  } catch {}

  // ========== 31. InputDeviceCapabilities 伪装 ==========
  try {
    if (typeof InputDeviceCapabilities !== 'undefined') {
      const origConstructor = InputDeviceCapabilities;
      window.InputDeviceCapabilities = function(init) {
        return new origConstructor(init || { fireTouchEvents: false });
      };
      window.InputDeviceCapabilities.prototype = origConstructor.prototype;
    }
  } catch {}

  // ========== 32. 事件 sourceCapabilities 一致性 ==========
  try {
    // 确保 UIEvent 有 sourceCapabilities
    const origUIEvent = UIEvent;
    const inputDeviceCap = new InputDeviceCapabilities({ fireTouchEvents: false });

    // 包装事件创建
    const wrapEvent = (EventClass) => {
      return function(type, eventInitDict) {
        const event = new EventClass(type, eventInitDict);
        try {
          Object.defineProperty(event, 'sourceCapabilities', {
            value: inputDeviceCap,
            writable: false,
            configurable: true,
            enumerable: true
          });
        } catch (e) {}
        return event;
      };
    };

    // 注意：不能直接覆盖构造函数，但可以在创建事件时添加属性
  } catch {}

  // ========== 33. MutationObserver 正常化 ==========
  try {
    // 某些网站通过 MutationObserver 检测 DOM 变化频率来判断机器人
    const origObserve = MutationObserver.prototype.observe;
    const observeCountMap = new WeakMap();

    MutationObserver.prototype.observe = function(target, options) {
      // 记录观察次数
      observeCountMap.set(this, (observeCountMap.get(this) || 0) + 1);
      return origObserve.call(this, target, options);
    };
  } catch {}

  // ========== 34. ResizeObserver 正常化 ==========
  try {
    if (typeof ResizeObserver !== 'undefined') {
      const origObserve = ResizeObserver.prototype.observe;
      ResizeObserver.prototype.observe = function(target, options) {
        return origObserve.call(this, target, options);
      };
    }
  } catch {}

  // ========== 35. User-Agent Client Hints (Sec-CH-UA) 伪装 ==========
  try {
    // NavigatorUAData 接口
    if (typeof NavigatorUAData !== 'undefined' || navigator.userAgentData) {
      const chromeVersions = ['122', '123', '124', '125'];
      const selectedVersion = chromeVersions[Math.floor(Math.random() * chromeVersions.length)];

      const fakeUAData = {
        brands: [
          { brand: 'Chromium', version: selectedVersion },
          { brand: 'Google Chrome', version: selectedVersion },
          { brand: 'Not:A-Brand', version: '99' },
          { brand: 'Not-A.Brand', version: selectedVersion },
        ],
        mobile: false,
        platform: 'Windows',
        getHighEntropyValues: function(hints) {
          return Promise.resolve({
            brands: this.brands,
            mobile: false,
            platform: 'Windows',
            platformVersion: '15.0.0',
            uaFullList: this.brands,
            model: '',
            architecture: 'x86',
            bitness: '64',
            fullVersionList: this.brands.map(b => ({
              brand: b.brand,
              version: b.version + '.0.0.0'
            })),
          });
        },
        toJSON: function() {
          return {
            brands: this.brands,
            mobile: this.mobile,
            platform: this.platform,
          };
        },
      };

      Object.defineProperty(navigator, 'userAgentData', {
        get: function() {
          return fakeUAData;
        },
        configurable: true,
      });
    }
  } catch {}

  // ========== 36. Fetch 请求头顺序伪装 ==========
  try {
    // 某些网站通过请求头顺序检测自动化
    // 真实 Chrome 的请求头顺序：
    // Accept, Accept-Language, Accept-Encoding, 等
    const origFetch = window.fetch;
    window.fetch = function(url, options = {}) {
      // 确保 headers 存在
      if (!options.headers) {
        options.headers = {};
      }

      // 添加常见请求头（如果不存在）
      const headers = options.headers;
      if (typeof headers === 'object' && !headers['Accept-Language']) {
        headers['Accept-Language'] = 'zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7';
      }
      if (typeof headers === 'object' && !headers['Accept-Encoding']) {
        headers['Accept-Encoding'] = 'gzip, deflate, br';
      }

      return origFetch.call(this, url, options);
    };
    disguise(window.fetch, 'fetch');
  } catch {}
})();
