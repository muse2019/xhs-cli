/**
 * 浏览器页面操作核心模块
 *
 * 封装 Playwright，提供类似 opencli 的操作接口
 * 内置反检测和真人行为模拟
 */

import { chromium, type Browser, type Page as PlaywrightPage, type BrowserContext } from 'playwright';
import { generateStealthJs, generateNetworkInterceptorJs } from '../stealth/stealth-script.js';
import { HumanBehavior } from '../stealth/human-behavior.js';
import { RandomDelay, sleep } from '../stealth/random-delay.js';

export interface PageOptions {
  /** 是否无头模式 */
  headless?: boolean;
  /** 是否启用反检测 */
  enableStealth?: boolean;
  /** 是否启用真人行为模拟 */
  enableHumanBehavior?: boolean;
  /** 用户数据目录（持久化登录） */
  userDataDir?: string;
  /** 代理设置 */
  proxy?: {
    server: string;
    username?: string;
    password?: string;
  };
  /** User-Agent */
  userAgent?: string;
  /** 视口大小 */
  viewport?: { width: number; height: number };
}

export interface ScreenshotOptions {
  path?: string;
  fullPage?: boolean;
}

export interface ElementInfo {
  ref: string;
  tag: string;
  text: string;
  attributes: Record<string, string>;
  bounds: { x: number; y: number; width: number; height: number };
}

/**
 * 增强版 Page 类
 */
export class Page {
  private page: PlaywrightPage;
  private context: BrowserContext;
  private browser: Browser;
  private human: HumanBehavior;
  private options: PageOptions;
  private elementCounter = 0;

  constructor(
    page: PlaywrightPage,
    context: BrowserContext,
    browser: Browser,
    options: PageOptions
  ) {
    this.page = page;
    this.context = context;
    this.browser = browser;
    this.options = options;
    this.human = new HumanBehavior(page, {
      enableMouseTrajectory: options.enableHumanBehavior !== false,
      enableRandomDelay: options.enableHumanBehavior !== false,
      enableTypingSimulation: options.enableHumanBehavior !== false,
      enableScrollSimulation: options.enableHumanBehavior !== false,
    });
  }

  /**
   * 创建新的 Page 实例
   */
  static async create(options: PageOptions = {}): Promise<Page> {
    const launchOptions: any = {
      headless: options.headless ?? false,
      args: [
        '--disable-blink-features=AutomationControlled',
        '--disable-infobars',
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
      ],
      ignoreDefaultArgs: ['--enable-automation'],
    };

    // 持久化上下文
    if (options.userDataDir) {
      const context = await chromium.launchPersistentContext(options.userDataDir, {
        ...launchOptions,
        userAgent: options.userAgent,
        viewport: options.viewport ?? { width: 1920, height: 1080 },
        locale: 'zh-CN',
        timezoneId: 'Asia/Shanghai',
      });

      const page = context.pages()[0] || await context.newPage();
      const instance = new Page(page, context, context.browser()!, options);

      if (options.enableStealth !== false) {
        await instance.injectStealth();
      }

      return instance;
    }

    // 普通模式
    const browser = await chromium.launch(launchOptions);

    // 生成动态 User-Agent，使用当前主流 Chrome 版本
    const chromeVersions = ['122.0.0.0', '123.0.0.0', '124.0.0.0', '125.0.0.0'];
    const randomVersion = chromeVersions[Math.floor(Math.random() * chromeVersions.length)];
    const defaultUA = `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${randomVersion} Safari/537.36`;

    const contextOptions: any = {
      userAgent: options.userAgent ?? defaultUA,
      viewport: options.viewport ?? { width: 1920, height: 1080 },
      locale: 'zh-CN',
      timezoneId: 'Asia/Shanghai',
    };

    if (options.proxy) {
      contextOptions.proxy = options.proxy;
    }

    const context = await browser.newContext(contextOptions);
    const page = await context.newPage();
    const instance = new Page(page, context, browser, options);

    if (options.enableStealth !== false) {
      await instance.injectStealth();
    }

    return instance;
  }

  /**
   * 注入反检测脚本
   */
  private async injectStealth(): Promise<void> {
    await this.context.addInitScript(generateStealthJs());
    await this.context.addInitScript(generateNetworkInterceptorJs());
  }

  /**
   * 导航到 URL
   */
  async goto(url: string, options?: { waitUntil?: 'load' | 'domcontentloaded' | 'networkidle' }): Promise<void> {
    await this.page.goto(url, {
      waitUntil: options?.waitUntil ?? 'domcontentloaded',
      timeout: 30000,
    });

    // 等待页面稳定
    await this.waitForDomStable();

    // 注入元素引用
    await this.injectElementRefs();

    // 更新鼠标位置 - 使用随机化初始位置，避免固定 (0,0) 被检测
    const viewportSize = this.page.viewportSize() || { width: 1920, height: 1080 };
    this.human.updateLastPosition(
      Math.floor(Math.random() * viewportSize.width * 0.5),
      Math.floor(Math.random() * viewportSize.height * 0.5)
    );
  }

  /**
   * 等待 DOM 稳定
   */
  private async waitForDomStable(): Promise<void> {
    // 随机等待 300-800ms，避免固定时间被检测
    await sleep(300 + Math.random() * 500);
    await this.page.waitForLoadState('domcontentloaded');
  }

  /**
   * 注入元素引用标记
   */
  private async injectElementRefs(): Promise<void> {
    await this.page.evaluate(() => {
      const interactiveSelectors = [
        'a', 'button', 'input', 'select', 'textarea',
        '[role="button"]', '[role="link"]', '[role="checkbox"]',
        '[tabindex]:not([tabindex="-1"])',
        '[contenteditable="true"]'
      ];

      const elements = document.querySelectorAll(interactiveSelectors.join(', '));
      let counter = 0;

      elements.forEach((el) => {
        const rect = el.getBoundingClientRect();
        // 只标记可见元素
        if (rect.width > 0 && rect.height > 0) {
          el.setAttribute('data-xhs-ref', String(counter));
          counter++;
        }
      });

      (window as any).__xhs_element_count = counter;
    });
  }

  /**
   * 获取页面状态
   */
  async getState(): Promise<{
    url: string;
    title: string;
    elements: ElementInfo[];
  }> {
    const url = this.page.url();
    const title = await this.page.title();

    const elements = await this.page.evaluate(() => {
      const results: any[] = [];
      const elements = document.querySelectorAll('[data-xhs-ref]');

      elements.forEach((el) => {
        const rect = el.getBoundingClientRect();
        results.push({
          ref: el.getAttribute('data-xhs-ref'),
          tag: el.tagName.toLowerCase(),
          text: (el.textContent || '').trim().slice(0, 100),
          attributes: Object.fromEntries(
            Array.from(el.attributes).map(a => [a.name, a.value])
          ),
          bounds: {
            x: Math.round(rect.x),
            y: Math.round(rect.y),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
          },
        });
      });

      return results;
    });

    return { url, title, elements };
  }

  /**
   * 点击元素
   */
  async click(ref: string): Promise<void> {
    const selector = `[data-xhs-ref="${ref}"]`;
    const element = await this.page.$(selector);

    if (!element) {
      throw new Error(`Element not found: ${ref}`);
    }

    // 获取元素位置
    const bounds = await element.boundingBox();
    if (!bounds) {
      throw new Error(`Element not visible: ${ref}`);
    }

    // 使用真人点击
    const x = bounds.x + bounds.width / 2;
    const y = bounds.y + bounds.height / 2;
    await this.human.humanClick(x, y);
  }

  /**
   * 输入文本
   */
  async type(ref: string, text: string): Promise<void> {
    const selector = `[data-xhs-ref="${ref}"]`;
    const element = await this.page.$(selector);

    if (!element) {
      throw new Error(`Element not found: ${ref}`);
    }

    // 先点击聚焦
    await this.click(ref);
    await sleep(200 + Math.random() * 300);

    // 使用真人输入
    await this.human.humanType(text);
  }

  /**
   * 执行 JavaScript
   */
  async evaluate<R>(fn: () => R): Promise<R>;
  async evaluate<R, A>(fn: (arg: A) => R, arg: A): Promise<R>;
  async evaluate<R, A>(fn: (arg?: A) => R, arg?: A): Promise<R> {
    return await this.page.evaluate(fn, arg as A);
  }

  /**
   * 等待选择器
   */
  async waitForSelector(selector: string, timeout: number = 10000): Promise<void> {
    await this.page.waitForSelector(selector, { timeout });
  }

  /**
   * 等待文本出现
   */
  async waitForText(text: string, timeout: number = 10000): Promise<void> {
    await this.page.waitForFunction(
      (t) => document.body.innerText.includes(t),
      text,
      { timeout }
    );
  }

  /**
   * 等待指定时间
   */
  async wait(seconds: number): Promise<void> {
    await sleep(seconds * 1000);
  }

  /**
   * 滚动页面
   */
  async scroll(direction: 'up' | 'down', amount: number = 300): Promise<void> {
    await this.human.humanScroll(direction, amount);
  }

  /**
   * 截图
   */
  async screenshot(options: ScreenshotOptions = {}): Promise<Buffer> {
    if (options.path) {
      await this.page.screenshot({
        path: options.path,
        fullPage: options.fullPage ?? false,
      });
      return Buffer.from('');
    }

    return await this.page.screenshot({
      fullPage: options.fullPage ?? false,
    });
  }

  /**
   * 获取捕获的网络请求
   */
  async getNetworkRequests(): Promise<any[]> {
    return await this.page.evaluate(() => {
      return (window as any).__xhs_net || [];
    });
  }

  /**
   * 获取当前 URL
   */
  getUrl(): string {
    return this.page.url();
  }

  /**
   * 获取页面标题
   */
  async getTitle(): Promise<string> {
    return await this.page.title();
  }

  /**
   * 获取 HumanBehavior 实例
   */
  getHuman(): HumanBehavior {
    return this.human;
  }

  /**
   * 获取原生 Playwright Page
   */
  getPlaywrightPage(): PlaywrightPage {
    return this.page;
  }

  /**
   * 获取 BrowserContext
   */
  getContext(): BrowserContext {
    return this.context;
  }

  /**
   * 获取 Cookie
   */
  async getCookies(): Promise<Array<{ name: string; value: string; domain: string }>> {
    const cookies = await this.context.cookies();
    return cookies.map(c => ({
      name: c.name,
      value: c.value,
      domain: c.domain,
    }));
  }

  /**
   * 设置 Cookie
   */
  async setCookies(cookies: Array<{ name: string; value: string; domain?: string }>): Promise<void> {
    await this.context.addCookies(cookies.map(c => ({
      name: c.name,
      value: c.value,
      domain: c.domain || '.xiaohongshu.com',
      path: '/',
    })));
  }

  /**
   * 关闭页面
   */
  async close(): Promise<void> {
    await this.page.close();
  }

  /**
   * 关闭浏览器
   */
  async closeBrowser(): Promise<void> {
    await this.context.close();
    await this.browser.close();
  }
}
