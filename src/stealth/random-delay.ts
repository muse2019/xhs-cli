/**
 * 随机延迟模块 - 模拟真人操作时间
 */

export class RandomDelay {
  /**
   * 基础随机延迟
   */
  static random(minMs: number, maxMs: number): number {
    return minMs + Math.random() * (maxMs - minMs);
  }

  /**
   * 思考时间 - 点击前的犹豫
   */
  static thinkTime(): number {
    // 200-1000ms，偏向较短时间
    const base = 200 + Math.random() * 800;
    // 10% 概率有较长思考
    if (Math.random() < 0.1) {
      return base + 500 + Math.random() * 1000;
    }
    return base;
  }

  /**
   * 阅读时间 - 根据字数估算
   */
  static readTime(wordCount: number): number {
    // 平均阅读速度 200-300 字/分钟
    const wpm = 200 + Math.random() * 100;
    const minutes = wordCount / wpm;
    // 最少 500ms
    return Math.max(500, minutes * 60000);
  }

  /**
   * 打字延迟 - 模拟真实打字速度
   */
  static typingDelay(): number {
    // 30-200ms 每个字符，偶尔更长
    const base = 30 + Math.random() * 170;
    // 5% 概率停顿
    if (Math.random() < 0.05) {
      return base + 200 + Math.random() * 300;
    }
    return base;
  }

  /**
   * 页面滚动延迟
   */
  static scrollDelay(): number {
    return 100 + Math.random() * 300;
  }

  /**
   * 页面加载等待
   */
  static pageLoadDelay(): number {
    return 1000 + Math.random() * 2000;
  }

  /**
   * 操作间隔 - 两次操作之间
   */
  static actionInterval(): number {
    return 300 + Math.random() * 700;
  }

  /**
   * 高斯分布延迟 - 更自然的分布
   */
  static gaussian(mean: number, stdDev: number): number {
    // Box-Muller 变换
    const u1 = Math.random();
    const u2 = Math.random();
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return Math.max(0, mean + z * stdDev);
  }

  /**
   * 模拟人类不规律的等待
   * 有时会"走神"更久
   */
  static humanWait(baseMs: number): number {
    const result = baseMs + this.gaussian(0, baseMs * 0.3);
    // 5% 概率"走神"
    if (Math.random() < 0.05) {
      return result + 1000 + Math.random() * 2000;
    }
    return Math.max(100, result);
  }

  /**
   * 批量操作间隔 - 防止被封
   */
  static batchInterval(index: number, total: number): number {
    // 基础间隔
    let delay = 2000 + Math.random() * 3000;

    // 每隔几个操作加长等待
    if (index > 0 && index % 5 === 0) {
      delay += 5000 + Math.random() * 5000;
    }

    // 接近结束时加快
    if (total - index <= 3) {
      delay *= 0.7;
    }

    return delay;
  }
}

/**
 * 请求冷却器 - 防止请求过于频繁被检测
 */
export class RequestCooldown {
  private static lastRequestTime: number = 0;
  private static requestCount: number = 0;
  private static readonly MIN_INTERVAL_MS = 800;  // 最小请求间隔
  private static readonly MAX_INTERVAL_MS = 3000; // 最大请求间隔
  private static readonly BURST_THRESHOLD = 5;    // 突发阈值
  private static readonly COOLDOWN_MULTIPLIER = 2; // 冷却倍数

  /**
   * 等待冷却后才能继续请求
   */
  static async waitForCooldown(): Promise<void> {
    const now = Date.now();
    const elapsed = now - this.lastRequestTime;

    // 计算需要等待的时间
    let requiredDelay = this.MIN_INTERVAL_MS + Math.random() * (this.MAX_INTERVAL_MS - this.MIN_INTERVAL_MS);

    // 如果请求次数超过阈值，增加冷却时间
    if (this.requestCount >= this.BURST_THRESHOLD) {
      requiredDelay *= this.COOLDOWN_MULTIPLIER;
      // 随机重置计数器
      if (Math.random() < 0.3) {
        this.requestCount = 0;
      }
    }

    // 如果距离上次请求时间不足，等待剩余时间
    if (elapsed < requiredDelay) {
      const waitTime = requiredDelay - elapsed + Math.random() * 200;
      await sleep(waitTime);
    }

    this.lastRequestTime = Date.now();
    this.requestCount++;
  }

  /**
   * 重置冷却状态（用于新会话）
   */
  static reset(): void {
    this.lastRequestTime = 0;
    this.requestCount = 0;
  }

  /**
   * 获取当前请求统计
   */
  static getStats(): { requestCount: number; lastRequestTime: number } {
    return {
      requestCount: this.requestCount,
      lastRequestTime: this.lastRequestTime,
    };
  }
}

/**
 * 行为节流器 - 限制单位时间内的操作次数
 */
export class BehaviorThrottler {
  private static operationHistory: number[] = [];
  private static readonly WINDOW_MS = 60000; // 1分钟窗口
  private static readonly MAX_OPERATIONS = 30; // 每分钟最大操作数

  /**
   * 检查是否应该节流
   */
  static shouldThrottle(): boolean {
    const now = Date.now();

    // 清理过期记录
    this.operationHistory = this.operationHistory.filter(t => now - t < this.WINDOW_MS);

    return this.operationHistory.length >= this.MAX_OPERATIONS;
  }

  /**
   * 记录一次操作
   */
  static recordOperation(): void {
    this.operationHistory.push(Date.now());
  }

  /**
   * 等待直到可以继续操作
   */
  static async waitIfNeeded(): Promise<void> {
    if (this.shouldThrottle()) {
      // 计算需要等待的时间
      const oldestOp = this.operationHistory[0];
      const waitTime = this.WINDOW_MS - (Date.now() - oldestOp) + Math.random() * 5000;

      if (waitTime > 0) {
        await sleep(waitTime);
      }
    }
    this.recordOperation();
  }

  /**
   * 重置
   */
  static reset(): void {
    this.operationHistory = [];
  }
}

/**
 * 延迟函数
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 随机延迟函数
 */
export async function randomSleep(minMs: number, maxMs: number): Promise<void> {
  await sleep(RandomDelay.random(minMs, maxMs));
}
