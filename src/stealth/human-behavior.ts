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

  // 会话疲劳追踪
  private sessionStartTime: number = Date.now();
  private operationCount: number = 0;
  private static readonly FATIGUE_THRESHOLD_MS = 5 * 60 * 1000; // 5分钟后开始疲劳
  private static readonly MAX_FATIGUE_FACTOR = 2.5; // 最大延迟倍数

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
   * 计算当前疲劳因子
   * 随着操作次数和时间的增加，延迟会逐渐变大
   */
  private getFatigueFactor(): number {
    const sessionDuration = Date.now() - this.sessionStartTime;
    const timeFactor = Math.min(
      1,
      sessionDuration / HumanBehavior.FATIGUE_THRESHOLD_MS
    );
    const operationFactor = Math.min(1, this.operationCount / 50); // 50次操作后达到最大疲劳
    const combinedFactor = (timeFactor + operationFactor) / 2;
    return 1 + combinedFactor * (HumanBehavior.MAX_FATIGUE_FACTOR - 1);
  }

  /**
   * 记录一次操作并返回疲劳因子
   */
  private recordOperation(): number {
    this.operationCount++;
    return this.getFatigueFactor();
  }

  /**
   * 真人风格的鼠标移动
   */
  async humanMove(x: number, y: number): Promise<void> {
    const fatigueFactor = this.recordOperation();

    if (!this.options.enableMouseTrajectory) {
      await this.mouse.move(x, y);
      this.lastPosition = { x, y };
      return;
    }

    // 计算移动距离来调整时间
    const distance = Math.sqrt(
      Math.pow(x - this.lastPosition.x, 2) + Math.pow(y - this.lastPosition.y, 2)
    );

    // 基于距离和时间随机化移动时间，范围更宽（100-600ms基础）
    const baseTime = 100 + Math.random() * 500;
    // 长距离移动需要更多时间
    const distanceBonus = Math.min(200, distance * 0.3);
    const moveTime = (baseTime + distanceBonus) * fatigueFactor;

    const path = MouseTrajectory.generateTimedPath(
      this.lastPosition,
      { x, y },
      moveTime
    );

    for (const { point, delayMs } of path) {
      await this.mouse.move(point.x, point.y);
      // 应用疲劳因子到延迟
      await sleep(delayMs * fatigueFactor);
    }

    this.lastPosition = { x, y };
  }

  /**
   * 真人风格的点击
   */
  async humanClick(x: number, y: number, options?: { doubleClick?: boolean }): Promise<void> {
    const fatigueFactor = this.getFatigueFactor();

    // 先移动到目标位置
    await this.humanMove(x, y);

    // 悬停一会儿 - 应用疲劳因子
    if (this.options.enableRandomDelay) {
      await sleep(RandomDelay.thinkTime() * fatigueFactor);
    }

    // 点击 - 按下持续时间也有随机性
    await this.mouse.down();
    await sleep((40 + Math.random() * 80) * fatigueFactor);
    await this.mouse.up();

    // 双击
    if (options?.doubleClick) {
      await sleep((80 + Math.random() * 100) * fatigueFactor);
      await this.mouse.down();
      await sleep((40 + Math.random() * 80) * fatigueFactor);
      await this.mouse.up();
    }

    // 点击后短暂停留
    if (this.options.enableRandomDelay) {
      await sleep(RandomDelay.actionInterval() * fatigueFactor);
    }
  }

  /**
   * 真人风格的输入
   */
  async humanType(text: string, options?: { delay?: number }): Promise<void> {
    const fatigueFactor = this.getFatigueFactor();

    if (!this.options.enableTypingSimulation) {
      await this.keyboard.type(text, { delay: options?.delay ?? 50 });
      return;
    }

    for (const char of text) {
      await this.keyboard.type(char);
      // 打字延迟应用疲劳因子
      await sleep(RandomDelay.typingDelay() * fatigueFactor);

      // 偶尔停顿 - 疲劳时停顿概率更高
      const pauseChance = 0.02 + (fatigueFactor - 1) * 0.02;
      if (Math.random() < pauseChance) {
        await sleep((300 + Math.random() * 500) * fatigueFactor);
      }
    }

    this.recordOperation();
  }

  /**
   * 真人风格的滚动
   * @param distance 滚动距离（默认随机200-400px）
   */
  async humanScroll(direction: 'up' | 'down', distance?: number): Promise<void> {
    // 默认距离随机化
    const actualDistance = distance ?? (150 + Math.random() * 300);
    const fatigueFactor = this.getFatigueFactor();

    if (!this.options.enableScrollSimulation) {
      await this.page.mouse.wheel(0, direction === 'down' ? actualDistance : -actualDistance);
      return;
    }

    // 分多次滚动 - 步数更随机（1-6步，偶尔更多）
    const baseSteps = 1 + Math.floor(Math.random() * 5);
    // 10% 概率有更多小步
    const steps = Math.random() < 0.1 ? baseSteps + 3 : baseSteps;
    const stepDistance = actualDistance / steps;

    for (let i = 0; i < steps; i++) {
      const delta = direction === 'down' ? stepDistance : -stepDistance;
      // 添加更大的随机波动（0.4-1.6倍），使每步滚动量更不均匀
      const actualDelta = delta * (0.4 + Math.random() * 1.2);

      await this.page.mouse.wheel(0, actualDelta);
      // 滚动延迟应用疲劳因子，添加额外随机性
      const baseDelay = RandomDelay.scrollDelay() * fatigueFactor;
      const jitter = Math.random() * 100 - 50; // ±50ms 抖动
      await sleep(Math.max(50, baseDelay + jitter));
    }

    this.recordOperation();
  }

  /**
   * 随机页面滚动 - 模拟浏览行为
   * @param durationMs 持续时间（默认随机2000-5000ms）
   */
  async randomScroll(durationMs?: number): Promise<void> {
    // 默认持续时间随机化
    const actualDuration = durationMs ?? (2000 + Math.random() * 3000);
    const fatigueFactor = this.getFatigueFactor();
    const startTime = Date.now();

    while (Date.now() - startTime < actualDuration) {
      const direction = Math.random() > 0.3 ? 'down' : 'up';
      const distance = 100 + Math.random() * 300;

      await this.humanScroll(direction, distance);
      // 等待时间应用疲劳因子
      await sleep((500 + Math.random() * 1500) * fatigueFactor);
    }
  }

  /**
   * 模拟阅读页面
   */
  async simulateReading(textLength: number): Promise<void> {
    const fatigueFactor = this.getFatigueFactor();
    const readTime = RandomDelay.readTime(textLength);

    // 在阅读过程中偶尔滚动
    const scrollCount = Math.floor(readTime / 5000);

    for (let i = 0; i < scrollCount; i++) {
      await sleep((3000 + Math.random() * 2000) * fatigueFactor);

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
    const fatigueFactor = this.getFatigueFactor();

    // 先随机移动
    if (Math.random() > 0.7) {
      await this.randomMouseMove();
    }

    // 思考 - 应用疲劳因子
    if (this.options.enableRandomDelay) {
      await sleep(RandomDelay.thinkTime() * fatigueFactor);
    }

    // 执行动作
    await action();

    // 动作后停留
    if (this.options.enableRandomDelay) {
      await sleep(RandomDelay.actionInterval() * fatigueFactor);
    }

    this.recordOperation();
  }

  /**
   * 批量操作 - 带有反爬虫间隔
   */
  async batchAction<T>(
    items: T[],
    action: (item: T, index: number) => Promise<void>
  ): Promise<void> {
    for (let i = 0; i < items.length; i++) {
      const fatigueFactor = this.getFatigueFactor();

      await action(items[i], i);

      if (i < items.length - 1) {
        // 批量间隔应用疲劳因子
        const delay = RandomDelay.batchInterval(i, items.length) * fatigueFactor;
        await sleep(delay);
      }

      this.recordOperation();
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

  /**
   * 重置会话疲劳状态
   * 在开始新的操作会话时调用
   */
  resetFatigue(): void {
    this.sessionStartTime = Date.now();
    this.operationCount = 0;
  }

  /**
   * 获取当前疲劳状态信息
   */
  getFatigueStatus(): { operationCount: number; sessionDurationMs: number; fatigueFactor: number } {
    return {
      operationCount: this.operationCount,
      sessionDurationMs: Date.now() - this.sessionStartTime,
      fatigueFactor: this.getFatigueFactor(),
    };
  }
}
