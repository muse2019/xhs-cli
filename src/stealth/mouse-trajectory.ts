/**
 * 鼠标轨迹模拟 - 使用贝塞尔曲线模拟真人移动
 */

export interface Point {
  x: number;
  y: number;
}

export class MouseTrajectory {
  /**
   * 生成贝塞尔曲线轨迹点
   * @param start 起点
   * @param end 终点
   * @param steps 步数（越大越平滑但越慢，默认随机15-25）
   */
  static generateBezierPath(start: Point, end: Point, steps?: number): Point[] {
    // 默认步数随机化，避免固定模式
    const actualSteps = steps ?? (15 + Math.floor(Math.random() * 11));
    // 随机生成两个控制点，使轨迹更自然
    const controlPoint1: Point = {
      x: start.x + (end.x - start.x) * (0.2 + Math.random() * 0.3) + (Math.random() - 0.5) * 100,
      y: start.y + (end.y - start.y) * (0.2 + Math.random() * 0.3) + (Math.random() - 0.5) * 100,
    };

    const controlPoint2: Point = {
      x: start.x + (end.x - start.x) * (0.6 + Math.random() * 0.2) + (Math.random() - 0.5) * 100,
      y: start.y + (end.y - start.y) * (0.6 + Math.random() * 0.2) + (Math.random() - 0.5) * 100,
    };

    const points: Point[] = [];

    for (let i = 0; i <= actualSteps; i++) {
      const t = i / actualSteps;
      const point = this.cubicBezier(t, start, controlPoint1, controlPoint2, end);

      // 添加轻微随机抖动
      if (i > 0 && i < actualSteps) {
        point.x += (Math.random() - 0.5) * 2;
        point.y += (Math.random() - 0.5) * 2;
      }

      points.push(point);
    }

    return points;
  }

  /**
   * 三次贝塞尔曲线计算
   */
  private static cubicBezier(
    t: number,
    p0: Point,
    p1: Point,
    p2: Point,
    p3: Point
  ): Point {
    const t2 = t * t;
    const t3 = t2 * t;
    const mt = 1 - t;
    const mt2 = mt * mt;
    const mt3 = mt2 * mt;

    return {
      x: mt3 * p0.x + 3 * mt2 * t * p1.x + 3 * mt * t2 * p2.x + t3 * p3.x,
      y: mt3 * p0.y + 3 * mt2 * t * p1.y + 3 * mt * t2 * p2.y + t3 * p3.y,
    };
  }

  /**
   * 生成带时间戳的轨迹
   * 用于模拟真实鼠标移动速度变化
   * @param durationMs 持续时间（默认随机200-400ms）
   */
  static generateTimedPath(
    start: Point,
    end: Point,
    durationMs?: number
  ): Array<{ point: Point; delayMs: number }> {
    // 默认持续时间随机化，避免固定模式
    const actualDuration = durationMs ?? (200 + Math.random() * 200);
    const steps = Math.max(10, Math.floor(actualDuration / 15));
    const points = this.generateBezierPath(start, end, steps);

    // 模拟真人移动速度：开始慢、中间快、结束慢
    const result: Array<{ point: Point; delayMs: number }> = [];

    for (let i = 0; i < points.length; i++) {
      // 使用正弦函数模拟速度变化
      const progress = i / (points.length - 1);
      const speedFactor = Math.sin(progress * Math.PI); // 中间最快

      // 基础延迟 8-35ms，根据速度调整（范围更宽更自然）
      const baseDelay = 8 + (1 - speedFactor) * 27;
      const randomDelay = Math.random() * 6;

      result.push({
        point: points[i],
        delayMs: Math.round(baseDelay + randomDelay),
      });
    }

    return result;
  }

  /**
   * 生成随机曲线轨迹（用于页面滚动等）
   * @param randomness 随机程度（默认随机0.2-0.5）
   */
  static generateRandomCurve(
    start: Point,
    end: Point,
    randomness?: number
  ): Point[] {
    // 默认随机程度随机化
    const actualRandomness = randomness ?? (0.2 + Math.random() * 0.3);
    const points: Point[] = [];
    const steps = 15 + Math.floor(Math.random() * 10);

    for (let i = 0; i <= steps; i++) {
      const t = i / steps;

      // 基础线性插值
      let x = start.x + (end.x - start.x) * t;
      let y = start.y + (end.y - start.y) * t;

      // 添加正弦波动
      const wave = Math.sin(t * Math.PI * 2) * actualRandomness * (end.x - start.x) * 0.1;
      y += wave;

      // 添加随机抖动
      x += (Math.random() - 0.5) * 3;
      y += (Math.random() - 0.5) * 3;

      points.push({ x: Math.round(x), y: Math.round(y) });
    }

    return points;
  }
}
