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
        const getParameterProxyHandler = {
          apply: function(target, thisArg, args) {
            const param = args[0];
            // UNMASKED_VENDOR_WEBGL
            if (param === 37445) {
              return 'Intel Inc.';
            }
            // UNMASKED_RENDERER_WEBGL
            if (param === 37446) {
              return 'Intel Iris OpenGL Engine';
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
