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
      window.chrome = {
        runtime: {
          onConnect: { addListener: () => {}, removeListener: () => {} },
          onMessage: { addListener: () => {}, removeListener: () => {} },
        },
        loadTimes: () => ({}),
        csi: () => ({}),
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
    const getParameterProxyHandler = {
      apply: function(target, thisArg, args) {
        const param = args[0];
        if (param === 37445) return 'Intel Inc.';  // UNMASKED_VENDOR_WEBGL
        if (param === 37446) return 'Intel Iris OpenGL Engine';  // UNMASKED_RENDERER_WEBGL
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

  console.log('[XHS Stealth] Anti-detection applied');
})();
