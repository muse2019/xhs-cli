/**
 * 真人行为模拟模块
 *
 * 封装 Playwright 的 Page，添加真人行为模拟
 */

import type { Page as PlaywrightPage, Mouse, Keyboard } from 'playwright';
import { MouseTrajectory, type Point } from './mouse-trajectory.js';
import { RandomDelay, sleep } from './random-delay.js';

export interface HumanBehaviorOptions {
  /** 是否启用鼠标轨迹模拟 */
  enableMouseTrajectory?: boolean;
  /** 是否启用随机延迟 */
  enableRandomDelay?: boolean;
  /** 是否启用打字模拟 */
  enableTypingSimulation?: boolean;
  /** 是否启用滚动模拟 */
  enableScrollSimulation?: boolean;
}

export class HumanBehavior {
  private page: PlaywrightPage;
  private mouse: Mouse;
  private keyboard: Keyboard;
  private options: HumanBehaviorOptions;
  private lastPosition: Point = { x: 0, y: 0 };

  constructor(page: PlaywrightPage, options: HumanBehaviorOptions = {}) {
    this.page = page;
    this.mouse = page.mouse;
    this.keyboard = page.keyboard;
    this.options = {
      enableMouseTrajectory: true,
      enableRandomDelay: true,
      enableTypingSimulation: true,
      enableScrollSimulation: true,
      ...options,
    };
  }

  /**
   * 真人风格的鼠标移动
   */
  async humanMove(x: number, y: number): Promise<void> {
    if (!this.options.enableMouseTrajectory) {
      await this.mouse.move(x, y);
      this.lastPosition = { x, y };
      return;
    }

    const path = MouseTrajectory.generateTimedPath(
      this.lastPosition,
      { x, y },
      200 + Math.random() * 200
    );

    for (const { point, delayMs } of path) {
      await this.mouse.move(point.x, point.y);
      await sleep(delayMs);
    }

    this.lastPosition = { x, y };
  }

  /**
   * 真人风格的点击
   */
  async humanClick(x: number, y: number, options?: { doubleClick?: boolean }): Promise<void> {
    // 先移动到目标位置
    await this.humanMove(x, y);

    // 悬停一会儿
    if (this.options.enableRandomDelay) {
      await sleep(RandomDelay.thinkTime());
    }

    // 点击
    await this.mouse.down();
    await sleep(50 + Math.random() * 50); // 按下持续时间
    await this.mouse.up();

    // 双击
    if (options?.doubleClick) {
      await sleep(100 + Math.random() * 50);
      await this.mouse.down();
      await sleep(50 + Math.random() * 50);
      await this.mouse.up();
    }

    // 点击后短暂停留
    if (this.options.enableRandomDelay) {
      await sleep(RandomDelay.actionInterval());
    }
  }

  /**
   * 真人风格的输入
   */
  async humanType(text: string, options?: { delay?: number }): Promise<void> {
    if (!this.options.enableTypingSimulation) {
      await this.keyboard.type(text, { delay: options?.delay ?? 50 });
      return;
    }

    for (const char of text) {
      await this.keyboard.type(char);
      await sleep(RandomDelay.typingDelay());

      // 偶尔停顿
      if (Math.random() < 0.02) {
        await sleep(300 + Math.random() * 500);
      }
    }
  }

  /**
   * 真人风格的滚动
   */
  async humanScroll(direction: 'up' | 'down', distance: number = 300): Promise<void> {
    if (!this.options.enableScrollSimulation) {
      await this.page.mouse.wheel(0, direction === 'down' ? distance : -distance);
      return;
    }

    // 分多次滚动
    const steps = 3 + Math.floor(Math.random() * 3);
    const stepDistance = distance / steps;

    for (let i = 0; i < steps; i++) {
      const delta = direction === 'down' ? stepDistance : -stepDistance;
      // 添加随机波动
      const actualDelta = delta * (0.8 + Math.random() * 0.4);

      await this.page.mouse.wheel(0, actualDelta);
      await sleep(RandomDelay.scrollDelay());
    }
  }

  /**
   * 随机页面滚动 - 模拟浏览行为
   */
  async randomScroll(durationMs: number = 3000): Promise<void> {
    const startTime = Date.now();

    while (Date.now() - startTime < durationMs) {
      const direction = Math.random() > 0.3 ? 'down' : 'up';
      const distance = 100 + Math.random() * 300;

      await this.humanScroll(direction, distance);
      await sleep(500 + Math.random() * 1500);
    }
  }

  /**
   * 模拟阅读页面
   */
  async simulateReading(textLength: number): Promise<void> {
    const readTime = RandomDelay.readTime(textLength);

    // 在阅读过程中偶尔滚动
    const scrollCount = Math.floor(readTime / 5000);

    for (let i = 0; i < scrollCount; i++) {
      await sleep(3000 + Math.random() * 2000);

      // 50% 概率滚动一点
      if (Math.random() > 0.5) {
        await this.humanScroll('down', 50 + Math.random() * 100);
      }
    }
  }

  /**
   * 随机移动鼠标 - 模拟真人无意识移动
   */
  async randomMouseMove(): Promise<void> {
    const viewport = this.page.viewportSize();
    if (!viewport) return;

    const x = Math.floor(Math.random() * viewport.width);
    const y = Math.floor(Math.random() * viewport.height);

    await this.humanMove(x, y);
  }

  /**
   * 执行一个完整的"真人操作"序列
   */
  async performHumanAction(action: () => Promise<void>): Promise<void> {
    // 先随机移动
    if (Math.random() > 0.7) {
      await this.randomMouseMove();
    }

    // 思考
    if (this.options.enableRandomDelay) {
      await sleep(RandomDelay.thinkTime());
    }

    // 执行动作
    await action();

    // 动作后停留
    if (this.options.enableRandomDelay) {
      await sleep(RandomDelay.actionInterval());
    }
  }

  /**
   * 批量操作 - 带有反爬虫间隔
   */
  async batchAction<T>(
    items: T[],
    action: (item: T, index: number) => Promise<void>
  ): Promise<void> {
    for (let i = 0; i < items.length; i++) {
      await action(items[i], i);

      if (i < items.length - 1) {
        const delay = RandomDelay.batchInterval(i, items.length);
        await sleep(delay);
      }
    }
  }

  /**
   * 随机化当前鼠标位置
   */
  updateLastPosition(x: number, y: number): void {
    this.lastPosition = { x, y };
  }

  /**
   * 获取当前鼠标位置
   */
  getLastPosition(): Point {
    return { ...this.lastPosition };
  }
}
