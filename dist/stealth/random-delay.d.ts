/**
 * 随机延迟模块 - 模拟真人操作时间
 */
export declare class RandomDelay {
    /**
     * 基础随机延迟
     */
    static random(minMs: number, maxMs: number): number;
    /**
     * 思考时间 - 点击前的犹豫
     */
    static thinkTime(): number;
    /**
     * 阅读时间 - 根据字数估算
     */
    static readTime(wordCount: number): number;
    /**
     * 打字延迟 - 模拟真实打字速度
     */
    static typingDelay(): number;
    /**
     * 页面滚动延迟
     */
    static scrollDelay(): number;
    /**
     * 页面加载等待
     */
    static pageLoadDelay(): number;
    /**
     * 操作间隔 - 两次操作之间
     */
    static actionInterval(): number;
    /**
     * 高斯分布延迟 - 更自然的分布
     */
    static gaussian(mean: number, stdDev: number): number;
    /**
     * 模拟人类不规律的等待
     * 有时会"走神"更久
     */
    static humanWait(baseMs: number): number;
    /**
     * 批量操作间隔 - 防止被封
     */
    static batchInterval(index: number, total: number): number;
}
/**
 * 请求冷却器 - 防止请求过于频繁被检测
 */
export declare class RequestCooldown {
    private static lastRequestTime;
    private static requestCount;
    private static readonly MIN_INTERVAL_MS;
    private static readonly MAX_INTERVAL_MS;
    private static readonly BURST_THRESHOLD;
    private static readonly COOLDOWN_MULTIPLIER;
    /**
     * 等待冷却后才能继续请求
     */
    static waitForCooldown(): Promise<void>;
    /**
     * 重置冷却状态（用于新会话）
     */
    static reset(): void;
    /**
     * 获取当前请求统计
     */
    static getStats(): {
        requestCount: number;
        lastRequestTime: number;
    };
}
/**
 * 行为节流器 - 限制单位时间内的操作次数
 */
export declare class BehaviorThrottler {
    private static operationHistory;
    private static readonly WINDOW_MS;
    private static readonly MAX_OPERATIONS;
    /**
     * 检查是否应该节流
     */
    static shouldThrottle(): boolean;
    /**
     * 记录一次操作
     */
    static recordOperation(): void;
    /**
     * 等待直到可以继续操作
     */
    static waitIfNeeded(): Promise<void>;
    /**
     * 重置
     */
    static reset(): void;
}
/**
 * 延迟函数
 */
export declare function sleep(ms: number): Promise<void>;
/**
 * 随机延迟函数
 */
export declare function randomSleep(minMs: number, maxMs: number): Promise<void>;
