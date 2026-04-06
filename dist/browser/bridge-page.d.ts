/**
 * Bridge Page - 通过 Daemon + Extension 操作浏览器
 *
 * 复用已登录的 Chrome，不需要重新登录
 */
export interface ElementInfo {
    ref: string;
    tag: string;
    text: string;
    attributes: Record<string, string>;
}
/**
 * Bridge Page - 通过 Chrome Extension 操作浏览器
 */
export declare class BridgePage {
    private activeTabId;
    /**
     * 检查连接状态
     */
    checkConnection(): Promise<{
        connected: boolean;
        message?: string;
    }>;
    /**
     * 导航到 URL
     */
    goto(url: string): Promise<string>;
    /**
     * 生成元素的稳定选择器（不修改 DOM）
     * 使用 CSS 路径 + 特征哈希
     */
    private getElementSelectors;
    /**
     * 获取页面状态（不修改 DOM）
     */
    getState(): Promise<{
        url: string;
        title: string;
        elements: ElementInfo[];
    }>;
    /**
     * 点击元素（使用 CSS 选择器）
     */
    click(ref: string): Promise<void>;
    /**
     * 输入文本
     */
    type(ref: string, text: string): Promise<void>;
    /**
     * 执行 JavaScript
     */
    evaluate<R>(code: string): Promise<R>;
    /**
     * 滚动
     */
    scroll(direction: 'up' | 'down', amount?: number): Promise<void>;
    /**
     * 截图
     */
    screenshot(options?: {
        path?: string;
    }): Promise<string>;
    /**
     * 等待（自动添加随机性，避免固定等待时间被检测）
     * @param seconds - 基础等待秒数
     * @param randomize - 是否添加随机性（默认 true）
     */
    wait(seconds: number, randomize?: boolean): Promise<void>;
    /**
     * 获取 Cookie
     */
    getCookies(domain?: string): Promise<Array<{
        name: string;
        value: string;
    }>>;
    /**
     * 获取当前 URL
     */
    getUrl(): Promise<string>;
    /**
     * 获取标签页列表
     */
    getTabs(): Promise<Array<{
        id: number;
        url: string;
        title: string;
    }>>;
    /**
     * 选择标签页
     */
    selectTab(index: number): Promise<void>;
}
