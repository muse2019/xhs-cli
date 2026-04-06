/**
 * Stealth anti-detection script generator.
 *
 * 移植自 opencli/src/browser/stealth.ts
 * 生成注入页面的反检测 JS 代码
 */

/**
 * 生成完整的反检测脚本
 * 在页面加载前注入，隐藏自动化痕迹
 */
export function generateStealthJs(): string {
  return `
    (() => {
      // 防止重复注入
      const _gProto = EventTarget.prototype;
      const _gKey = '__xhs_stealth';
      if (_gProto[_gKey]) return 'skipped';
      try {
        Object.defineProperty(_gProto, _gKey, { value: true, enumerable: false, configurable: true });
      } catch {}

      // ========== 1. navigator.webdriver 伪装 ==========
      // 最常见的检测点，Playwright/Puppeteer 会设置为 true
      try {
        Object.defineProperty(navigator, 'webdriver', {
          get: () => false,  // 真实 Chrome 返回 false
          configurable: true,
        });
      } catch {}

      // ========== 2. window.chrome 假对象 ==========
      // 真实 Chrome 有这个对象，自动化环境可能缺失
      try {
        if (!window.chrome) {
          // 生成随机的扩展 ID（32个字符，a-p）
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
      // 自动化环境通常没有插件
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
      // 无头 Chrome 在查询 notification 权限时会报错
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
        // ChromeDriver 注入的 cdc_ 前缀属性
        for (const prop of Object.getOwnPropertyNames(window)) {
          if (prop.startsWith('cdc_') || prop.startsWith('__cdc_')) {
            try { delete window[prop]; } catch {}
          }
        }
      } catch {}

      // ========== 7. CDP 堆栈清理 ==========
      // Error.stack 会暴露 CDP 注入的脚本
      try {
        const _origDescriptor = Object.getOwnPropertyDescriptor(Error.prototype, 'stack');
        const _cdpPatterns = [
          'puppeteer_evaluation_script',
          'pptr:',
          'debugger://',
          '__playwright',
          '__puppeteer',
        ];
        if (_origDescriptor && _origDescriptor.get) {
          Object.defineProperty(Error.prototype, 'stack', {
            get: function () {
              const raw = _origDescriptor.get.call(this);
              if (typeof raw !== 'string') return raw;
              return raw.split('\\n').filter(line =>
                !_cdpPatterns.some(p => line.includes(p))
              ).join('\\n');
            },
            configurable: true,
          });
        }
      } catch {}

      // ========== 8. toString 伪装基础设施 ==========
      const _origToString = Function.prototype.toString;
      const _disguised = new WeakMap();
      try {
        Object.defineProperty(Function.prototype, 'toString', {
          value: function() {
            const override = _disguised.get(this);
            return override !== undefined ? override : _origToString.call(this);
          },
          writable: true, configurable: true,
        });
      } catch {}
      const _disguise = (fn, name) => {
        _disguised.set(fn, 'function ' + name + '() { [native code] }');
        try { Object.defineProperty(fn, 'name', { value: name, configurable: true }); } catch {}
        return fn;
      };

      // ========== 9. debugger 语句过滤 ==========
      // 网站用 debugger 检测 DevTools/CDP
      try {
        const _OrigFunction = Function;
        const _debuggerRe = /(?:^|(?<=[;{}\\n\\r]))\\s*debugger\\s*;?/g;
        const _cleanDebugger = (src) => typeof src === 'string' ? src.replace(_debuggerRe, '') : src;
        const _PatchedFunction = function(...args) {
          if (args.length > 0) {
            args[args.length - 1] = _cleanDebugger(args[args.length - 1]);
          }
          if (new.target) {
            return Reflect.construct(_OrigFunction, args, new.target);
          }
          return _OrigFunction.apply(this, args);
        };
        _PatchedFunction.prototype = _OrigFunction.prototype;
        Object.setPrototypeOf(_PatchedFunction, _OrigFunction);
        _disguise(_PatchedFunction, 'Function');
        try { window.Function = _PatchedFunction; } catch {}

        const _origEval = window.eval;
        const _patchedEval = function(code) {
          return _origEval.call(this, _cleanDebugger(code));
        };
        _disguise(_patchedEval, 'eval');
        try { window.eval = _patchedEval; } catch {}
      } catch {}

      // ========== 10. console 方法伪装 ==========
      // CDP 会替换 console 方法，导致 toString 不同
      try {
        const _consoleMethods = ['log', 'warn', 'error', 'info', 'debug', 'table', 'trace', 'dir', 'group', 'groupEnd', 'groupCollapsed', 'clear', 'count', 'assert', 'profile', 'profileEnd', 'time', 'timeEnd', 'timeStamp'];
        for (const _m of _consoleMethods) {
          if (typeof console[_m] !== 'function') continue;
          const _origMethod = console[_m];
          const _nativeStr = 'function ' + _m + '() { [native code] }';
          try {
            const _currentStr = _origToString.call(_origMethod);
            if (_currentStr === _nativeStr) continue;
          } catch {}
          const _wrapper = function() { return _origMethod.apply(console, arguments); };
          Object.defineProperty(_wrapper, 'length', { value: _origMethod.length || 0, configurable: true });
          _disguise(_wrapper, _m);
          try { console[_m] = _wrapper; } catch {}
        }
      } catch {}

      // ========== 11. window 尺寸修复 ==========
      // DevTools 打开时 outerWidth/Height 会变化
      try {
        const _normalWidthDelta = window.outerWidth - window.innerWidth;
        const _normalHeightDelta = window.outerHeight - window.innerHeight;
        if (_normalWidthDelta > 100 || _normalHeightDelta > 200) {
          Object.defineProperty(window, 'outerWidth', {
            get: () => window.innerWidth,
            configurable: true,
          });
          const _heightOffset = Math.max(40, Math.min(120, _normalHeightDelta));
          Object.defineProperty(window, 'outerHeight', {
            get: () => window.innerHeight + _heightOffset,
            configurable: true,
          });
        }
      } catch {}

      // ========== 12. Performance API 清理 ==========
      try {
        const _origGetEntries = Performance.prototype.getEntries;
        const _origGetByType = Performance.prototype.getEntriesByType;
        const _origGetByName = Performance.prototype.getEntriesByName;
        const _suspiciousPatterns = ['debugger', 'devtools', '__puppeteer', '__playwright', 'pptr:'];
        const _filterEntries = (entries) => {
          if (!Array.isArray(entries)) return entries;
          return entries.filter(e => {
            const name = e.name || '';
            return !_suspiciousPatterns.some(p => name.includes(p));
          });
        };
        Performance.prototype.getEntries = function() {
          return _filterEntries(_origGetEntries.call(this));
        };
        Performance.prototype.getEntriesByType = function(type) {
          return _filterEntries(_origGetByType.call(this, type));
        };
        Performance.prototype.getEntriesByName = function(name, type) {
          return _filterEntries(_origGetByName.call(this, name, type));
        };
      } catch {}

      // ========== 13. iframe chrome 一致性 ==========
      try {
        const _origHTMLIFrame = HTMLIFrameElement.prototype;
        const _origContentWindow = Object.getOwnPropertyDescriptor(_origHTMLIFrame, 'contentWindow');
        if (_origContentWindow && _origContentWindow.get) {
          Object.defineProperty(_origHTMLIFrame, 'contentWindow', {
            get: function() {
              const _w = _origContentWindow.get.call(this);
              if (_w) {
                try {
                  if (!_w.chrome) {
                    Object.defineProperty(_w, 'chrome', {
                      value: window.chrome,
                      writable: true,
                      configurable: true,
                    });
                  }
                } catch {}
              }
              return _w;
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
            // UNMASKED_VENDOR_WEBGL
            if (param === 37445) {
              return selectedGpu.vendor;
            }
            // UNMASKED_RENDERER_WEBGL
            if (param === 37446) {
              return selectedGpu.renderer;
            }
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
        const _origGetContext = HTMLCanvasElement.prototype.getContext;
        const _noise = () => Math.random() * 0.0001;

        HTMLCanvasElement.prototype.getContext = function(type, attributes) {
          const context = _origGetContext.call(this, type, attributes);
          if (!context) return context;

          if (type === '2d') {
            const _origGetImageData = context.getImageData;
            context.getImageData = function(x, y, w, h) {
              const data = _origGetImageData.call(this, x, y, w, h);
              // 添加微弱噪声
              for (let i = 0; i < data.data.length; i += 4) {
                data.data[i] = Math.max(0, Math.min(255, data.data[i] + (_noise() > 0.5 ? 1 : -1)));
              }
              return data;
            };
            _disguise(context.getImageData, 'getImageData');
          }

          return context;
        };
        _disguise(HTMLCanvasElement.prototype.getContext, 'getContext');
      } catch {}

      // ========== 16. Audio 指纹噪声 ==========
      try {
        const _origCreateAnalyser = AudioContext.prototype.createAnalyser;
        AudioContext.prototype.createAnalyser = function() {
          const analyser = _origCreateAnalyser.call(this);
          const _origGetFloatFrequencyData = analyser.getFloatFrequencyData;
          analyser.getFloatFrequencyData = function(array) {
            _origGetFloatFrequencyData.call(this, array);
            for (let i = 0; i < array.length; i++) {
              array[i] += (Math.random() - 0.5) * 0.0001;
            }
          };
          _disguise(analyser.getFloatFrequencyData, 'getFloatFrequencyData');
          return analyser;
        };
        _disguise(AudioContext.prototype.createAnalyser, 'createAnalyser');
      } catch {}

      // ========== 17. DevTools 检测防护 ==========
      // 防止通过 debugger 语句检测
      // 网站用 performance.now() 测量 debugger 执行时间
      try {
        const _origNow = performance.now.bind(performance);
        let _lastNow = _origNow();
        let _callCount = 0;

        // 重写 performance.now，返回的时间不能突变
        performance.now = function() {
          const realNow = _origNow();
          _callCount++;

          // 防止时间倒流
          if (realNow < _lastNow) {
            return _lastNow;
          }

          // 如果两次调用之间时间跳跃太大（可能是 debugger 暂停），平滑处理
          const delta = realNow - _lastNow;
          if (delta > 100 && _callCount < 1000) {
            // 返回一个合理的增量
            _lastNow = _lastNow + Math.min(delta, 50);
            return _lastNow;
          }

          _lastNow = realNow;
          return realNow;
        };
        _disguise(performance.now, 'now');
      } catch {}

      // 防止通过 console.log 的 getter 检测 DevTools
      try {
        const _devtoolsDetector = /./;
        let _detectorOpened = false;

        Object.defineProperty(_devtoolsDetector, 'toString', {
          get: function() {
            // 不设置 opened 标记
            return function() { return ''; };
          }
        });

        // 阻止常见的 DevTools 检测模式
        const _origLog = console.log;
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
          return _origLog.apply(console, args);
        };
        _disguise(console.log, 'log');
      } catch {}

      // 防止通过 window 尺寸检测 DevTools
      // DevTools 打开时 window.outerWidth 会变化
      try {
        const _cachedOuterWidth = window.outerWidth || window.innerWidth;
        const _cachedOuterHeight = window.outerHeight || window.innerHeight + 100;

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
        const _origFunction = Function;
        const _fnToString = _origFunction.prototype.toString;

        // 检测 body 是否包含可疑代码
        _origFunction.prototype.toString = function() {
          const str = _fnToString.call(this);
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
        const _origDateNow = Date.now.bind(Date);
        let _timeOffset = Math.random() * 0.5 - 0.25;  // -0.25 到 0.25 ms

        Date.now = function() {
          return Math.floor(_origDateNow() + _timeOffset);
        };
        _disguise(Date.now, 'now');
      } catch {}

      // ========== 19. WebRTC IP 泄露保护 ==========
      try {
        // 阻止 WebRTC 泄露本地 IP
        const _rtcConfig = {
          iceServers: []
        };

        // 修改 RTCPeerConnection
        const _OrigRTCPeerConnection = window.RTCPeerConnection;
        if (_OrigRTCPeerConnection) {
          window.RTCPeerConnection = function(config, constraints) {
            // 移除可能导致 IP 泄露的配置
            const safeConfig = {
              ...config,
              iceServers: [],
              iceCandidatePoolSize: 0
            };
            return new _OrigRTCPeerConnection(safeConfig, constraints);
          };
          // 复制原型和静态属性
          window.RTCPeerConnection.prototype = _OrigRTCPeerConnection.prototype;
          Object.setPrototypeOf(window.RTCPeerConnection, _OrigRTCPeerConnection);
          _disguise(window.RTCPeerConnection, 'RTCPeerConnection');
        }

        // 阻止通过 webkitRTCPeerConnection 泄露
        if (window.webkitRTCPeerConnection) {
          window.webkitRTCPeerConnection = window.RTCPeerConnection;
        }

        // 阻止获取本地 IP 的方法
        const _origCreateDataChannel = RTCPeerConnection.prototype.createDataChannel;
        RTCPeerConnection.prototype.createDataChannel = function() {
          const channel = _origCreateDataChannel.apply(this, arguments);
          // 阻止 ICE 候选泄露
          return channel;
        };
        _disguise(RTCPeerConnection.prototype.createDataChannel, 'createDataChannel');
      } catch {}

      // ========== 20. Font 指纹保护 ==========
      try {
        // 随机化字体测量结果
        const _origMeasureText = CanvasRenderingContext2D.prototype.measureText;
        CanvasRenderingContext2D.prototype.measureText = function(text) {
          const result = _origMeasureText.call(this, text);
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
        _disguise(CanvasRenderingContext2D.prototype.measureText, 'measureText');

        // 伪装字体列表
        const _fakeFonts = [
          'Arial', 'Arial Black', 'Comic Sans MS', 'Courier New', 'Georgia',
          'Impact', 'Lucida Console', 'Lucida Sans Unicode', 'Palatino Linotype',
          'Tahoma', 'Times New Roman', 'Trebuchet MS', 'Verdana', 'Microsoft YaHei',
          'SimSun', 'SimHei', 'PingFang SC', 'Heiti SC', 'Songti SC'
        ];

        // 拦截 font 检测脚本常用的方法
        const _origGetComputedStyle = window.getComputedStyle;
        window.getComputedStyle = function(element, pseudoElt) {
          const style = _origGetComputedStyle.call(window, element, pseudoElt);

          // 如果正在检测字体，返回常见字体
          const _origFontFamily = Object.getOwnPropertyDescriptor(CSSStyleDeclaration.prototype, 'fontFamily');
          if (_origFontFamily && _origFontFamily.get) {
            Object.defineProperty(style, 'fontFamily', {
              get: function() {
                const realFont = _origFontFamily.get.call(this);
                // 如果是检测元素，返回伪装的字体
                if (element.id && element.id.includes('font')) {
                  return _fakeFonts.join(', ');
                }
                return realFont;
              },
              configurable: true
            });
          }

          return style;
        };
        _disguise(window.getComputedStyle, 'getComputedStyle');
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

        const _commonScreen = {
          width: selectedScreen.width,
          height: selectedScreen.height,
          availWidth: selectedScreen.width,
          availHeight: selectedScreen.availHeight,
          colorDepth: 24,
          pixelDepth: 24
        };

        // 添加微小随机性使指纹不唯一
        const _screenNoise = {
          width: Math.floor(Math.random() * 3) - 1,
          height: Math.floor(Math.random() * 3) - 1,
          availHeight: Math.floor(Math.random() * 5) - 2
        };

        for (const prop of ['width', 'height', 'availWidth', 'availHeight', 'colorDepth', 'pixelDepth']) {
          try {
            Object.defineProperty(screen, prop, {
              get: function() {
                const base = _commonScreen[prop] || 1920;
                return base + (_screenNoise[prop] || 0);
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
        const _commonCores = [4, 8, 16];
        const _fakeCores = _commonCores[Math.floor(Math.random() * _commonCores.length)];
        Object.defineProperty(navigator, 'hardwareConcurrency', {
          get: function() {
            return _fakeCores;
          },
          configurable: true
        });

        // 设备内存
        const _commonMemory = [4, 8, 16];
        const _fakeMemory = _commonMemory[Math.floor(Math.random() * _commonMemory.length)];
        if ('deviceMemory' in navigator) {
          try {
            Object.defineProperty(navigator, 'deviceMemory', {
              get: function() {
                return _fakeMemory;
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
          _disguise(navigator.getBattery, 'getBattery');
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
        const _touchEvents = ['touchstart', 'touchmove', 'touchend', 'touchcancel'];
        _touchEvents.forEach(event => {
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
          const fakeConnection = {
            effectiveType: ['4g', '3g', 'wifi'][Math.floor(Math.random() * 3)],
            downlink: 1.5 + Math.random() * 8.5,
            rtt: 50 + Math.floor(Math.random() * 150),
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
        window.requestAnimationFrame = function(callback) {
          return _origRAF.call(window, function(timestamp) {
            const jitter = (Math.random() - 0.5) * 0.5;
            callback(timestamp + jitter);
          });
        };
        _disguise(window.requestAnimationFrame, 'requestAnimationFrame');
      } catch {}

      // ========== 26. Notification.permission 深度伪装 ==========
      try {
        Notification.requestPermission = function() {
          return new Promise(function(resolve) {
            setTimeout(function() {
              resolve(Notification.permission);
            }, 100 + Math.random() * 200);
          });
        };
        _disguise(Notification.requestPermission, 'requestPermission');
      } catch {}

      return 'applied';
    })()
  `;
}

/**
 * 生成网络请求拦截脚本
 * 用于捕获 fetch/XHR 请求
 */
export function generateNetworkInterceptorJs(): string {
  return `
    (function() {
      if (window.__xhs_net) return;
      window.__xhs_net = [];

      const MAX_ENTRIES = 200;
      const MAX_BODY_SIZE = 50000;

      // 拦截 fetch
      const origFetch = window.fetch;
      window.fetch = async function(...args) {
        const response = await origFetch.apply(this, args);
        try {
          const ct = response.headers.get('content-type') || '';
          if (ct.includes('json') || ct.includes('text')) {
            const clone = response.clone();
            const text = await clone.text();
            if (window.__xhs_net.length < MAX_ENTRIES && text.length <= MAX_BODY_SIZE) {
              let body = null;
              try { body = JSON.parse(text); } catch { body = text; }
              window.__xhs_net.push({
                url: response.url || (args[0] && args[0].url) || String(args[0]),
                method: (args[1] && args[1].method) || 'GET',
                status: response.status,
                size: text.length,
                contentType: ct,
                body: body
              });
            }
          }
        } catch {}
        return response;
      };

      // 拦截 XMLHttpRequest
      const origOpen = XMLHttpRequest.prototype.open;
      const origSend = XMLHttpRequest.prototype.send;
      XMLHttpRequest.prototype.open = function(method, url) {
        this._method = method;
        this._url = url;
        return origOpen.apply(this, arguments);
      };
      XMLHttpRequest.prototype.send = function() {
        const xhr = this;
        xhr.addEventListener('load', function() {
          try {
            const ct = xhr.getResponseHeader('content-type') || '';
            if ((ct.includes('json') || ct.includes('text')) && window.__xhs_net.length < MAX_ENTRIES) {
              const text = xhr.responseText;
              let body = null;
              if (text && text.length <= MAX_BODY_SIZE) {
                try { body = JSON.parse(text); } catch { body = text; }
              }
              window.__xhs_net.push({
                url: xhr._url,
                method: xhr._method || 'GET',
                status: xhr.status,
                size: text ? text.length : 0,
                contentType: ct,
                body: body
              });
            }
          } catch {}
        });
        return origSend.apply(this, arguments);
      };
    })()
  `;
}
