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

    // 注入元素引用
    await this.injectElementRefs();

    return result.url;
  }

  /**
   * 注入元素引用标记
   */
  private async injectElementRefs(): Promise<void> {
    await client.exec(`
      (() => {
        const selectors = [
          'a', 'button', 'input', 'select', 'textarea',
          '[role="button"]', '[role="link"]',
          '[tabindex]:not([tabindex="-1"])',
          '[contenteditable="true"]'
        ];

        const elements = document.querySelectorAll(selectors.join(', '));
        let counter = 0;

        elements.forEach(el => {
          const rect = el.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            el.setAttribute('data-xhs-ref', String(counter));
            counter++;
          }
        });

        window.__xhs_element_count = counter;
      })()
    `);
  }

  /**
   * 获取页面状态
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

        document.querySelectorAll('[data-xhs-ref]').forEach(el => {
          const rect = el.getBoundingClientRect();
          elements.push({
            ref: el.getAttribute('data-xhs-ref'),
            tag: el.tagName.toLowerCase(),
            text: (el.textContent || '').trim().slice(0, 100),
            attributes: Object.fromEntries(
              Array.from(el.attributes).map(a => [a.name, a.value])
            ),
          });
        });

        return { url, title, elements };
      })()
    `);

    return result;
  }

  /**
   * 点击元素
   */
  async click(ref: string): Promise<void> {
    await client.exec(`
      (() => {
        const el = document.querySelector('[data-xhs-ref="${ref}"]');
        if (!el) throw new Error('Element not found: ${ref}');
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
        const el = document.querySelector('[data-xhs-ref="${ref}"]');
        if (!el) throw new Error('Element not found: ${ref}');

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
