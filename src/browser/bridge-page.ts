/**
 * Bridge Page - 通过 Daemon + Extension 操作浏览器
 *
 * 复用已登录的 Chrome，不需要重新登录
 */

import * as client from '../daemon/client.js';
import { sleep } from '../stealth/random-delay.js';

export interface ElementInfo {
  ref: string;
  tag: string;
  text: string;
  attributes: Record<string, string>;
}

/**
 * Bridge Page - 通过 Chrome Extension 操作浏览器
 */
export class BridgePage {
  private activeTabId: number | null = null;

  /**
   * 检查连接状态
   */
  async checkConnection(): Promise<{ connected: boolean; message?: string }> {
    const status = await client.checkDaemonStatus();

    if (!status) {
      return {
        connected: false,
        message: 'Daemon 未运行。请运行: xhs daemon start',
      };
    }

    if (!status.extensionConnected) {
      return {
        connected: false,
        message: 'Chrome Extension 未连接。请确保已安装并启用 XHS CLI Bridge 扩展。',
      };
    }

    return { connected: true };
  }

  /**
   * 导航到 URL
   */
  async goto(url: string): Promise<string> {
    const result = await client.navigate(url, this.activeTabId || undefined);
    this.activeTabId = result.tabId;

    // 等待页面稳定
    await sleep(1000);

    return result.url;
  }

  /**
   * 生成元素的稳定选择器（不修改 DOM）
   * 使用 CSS 路径 + 特征哈希
   */
  private async getElementSelectors(): Promise<void> {
    // 不再注入属性，改用实时计算
  }

  /**
   * 获取页面状态（不修改 DOM）
   */
  async getState(): Promise<{
    url: string;
    title: string;
    elements: ElementInfo[];
  }> {
    const result = await client.exec(`
      (() => {
        const url = location.href;
        const title = document.title;
        const elements = [];

        const selectors = [
          'a', 'button', 'input', 'select', 'textarea',
          '[role="button"]', '[role="link"]',
          '[tabindex]:not([tabindex="-1"])',
          '[contenteditable="true"]'
        ];

        const allElements = document.querySelectorAll(selectors.join(', '));
        let counter = 0;

        allElements.forEach(el => {
          const rect = el.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            // 生成稳定的 CSS 路径作为 ref
            const path = [];
            let current = el;
            while (current && current !== document.body) {
              let selector = current.tagName.toLowerCase();
              if (current.id) {
                selector += '#' + current.id;
                path.unshift(selector);
                break;
              }
              const parent = current.parentElement;
              if (parent) {
                const siblings = Array.from(parent.children).filter(c => c.tagName === current.tagName);
                if (siblings.length > 1) {
                  const index = siblings.indexOf(current) + 1;
                  selector += ':nth-of-type(' + index + ')';
                }
              }
              path.unshift(selector);
              current = parent;
            }

            elements.push({
              ref: path.join(' > '),
              tag: el.tagName.toLowerCase(),
              text: (el.textContent || '').trim().slice(0, 100),
              attributes: Object.fromEntries(
                Array.from(el.attributes)
                  .filter(a => !a.name.startsWith('data-xhs')) // 过滤掉可能存在的标记
                  .map(a => [a.name, a.value])
              ),
            });
            counter++;
          }
        });

        return { url, title, elements };
      })()
    `);

    // 确保 result 是有效对象
    if (result && typeof result === 'object' && 'url' in result) {
      return result as { url: string; title: string; elements: ElementInfo[] };
    }

    return { url: '', title: '', elements: [] };
  }

  /**
   * 点击元素（使用 CSS 选择器）
   */
  async click(ref: string): Promise<void> {
    await client.exec(`
      (() => {
        const el = document.querySelector(${JSON.stringify(ref)});
        if (!el) throw new Error('Element not found: ' + ${JSON.stringify(ref)});
        el.scrollIntoView({ behavior: 'instant', block: 'center' });
        el.click();
      })()
    `);
  }

  /**
   * 输入文本
   */
  async type(ref: string, text: string): Promise<void> {
    await client.exec(`
      (() => {
        const el = document.querySelector(${JSON.stringify(ref)});
        if (!el) throw new Error('Element not found: ' + ${JSON.stringify(ref)});

        el.focus();

        if (el.isContentEditable) {
          document.execCommand('insertText', false, ${JSON.stringify(text)});
        } else {
          const nativeSetter = Object.getOwnPropertyDescriptor(
            el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype,
            'value'
          )?.set;
          if (nativeSetter) {
            nativeSetter.call(el, ${JSON.stringify(text)});
          } else {
            el.value = ${JSON.stringify(text)};
          }
          el.dispatchEvent(new Event('input', { bubbles: true }));
        }
      })()
    `);
  }

  /**
   * 执行 JavaScript
   */
  async evaluate<R>(code: string): Promise<R> {
    return await client.exec(code);
  }

  /**
   * 滚动
   */
  async scroll(direction: 'up' | 'down', amount: number = 300): Promise<void> {
    await client.scroll(direction, amount);
  }

  /**
   * 截图
   */
  async screenshot(options?: { path?: string }): Promise<string> {
    const dataUrl = await client.screenshot(this.activeTabId || undefined);

    if (options?.path) {
      // 保存到文件
      const fs = await import('fs');
      const base64 = dataUrl.split(',')[1];
      await fs.promises.writeFile(options.path, Buffer.from(base64, 'base64'));
    }

    return dataUrl;
  }

  /**
   * 等待
   */
  async wait(seconds: number): Promise<void> {
    await sleep(seconds * 1000);
  }

  /**
   * 获取 Cookie
   */
  async getCookies(domain?: string): Promise<Array<{ name: string; value: string }>> {
    return await client.getCookies(domain);
  }

  /**
   * 获取当前 URL
   */
  async getUrl(): Promise<string> {
    return await client.exec('location.href');
  }

  /**
   * 获取标签页列表
   */
  async getTabs(): Promise<Array<{ id: number; url: string; title: string }>> {
    return await client.listTabs();
  }

  /**
   * 选择标签页
   */
  async selectTab(index: number): Promise<void> {
    await client.selectTab(index);
  }
}
