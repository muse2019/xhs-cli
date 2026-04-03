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
    // 50-150ms 每个字符，偶尔更长
    const base = 50 + Math.random() * 100;
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
