/**
 * 小红书适配器
 *
 * 实现小红书专用功能：
 * - 笔记详情获取
 * - 点赞/收藏
 * - 评论
 * - 首页推荐
 * - 搜索
 * - 发布笔记
 *
 * 所有操作都带有反爬虫防御
 */

import type { Page } from '../browser/index.js';
import { sleep, RandomDelay } from '../stealth/random-delay.js';

// ==================== 类型定义 ====================

export interface NoteInfo {
  id: string;
  title: string;
  desc: string;
  author: {
    id: string;
    name: string;
    avatar?: string;
  };
  stats: {
    likes: number;
    collects: number;
    comments: number;
  };
  images: string[];
  video?: string;
  tags: string[];
  liked: boolean;
  collected: boolean;
}

export interface FeedItem {
  id: string;
  title: string;
  cover: string;
  author: string;
  likes: number;
}

export interface SearchResult {
  notes: FeedItem[];
  users: Array<{ id: string; name: string; avatar: string }>;
}

export interface PublishOptions {
  title: string;
  content: string;
  images: string[];  // 本地图片路径
  tags?: string[];
  location?: string;
}

export interface LoginStatus {
  isLoggedIn: boolean;
  userId?: string;
  username?: string;
  avatar?: string;
}

// ==================== 小红书适配器类 ====================

export class XiaohongshuAdapter {
  private page: Page;
  private baseUrl = 'https://www.xiaohongshu.com';
  private loginStatus: LoginStatus | null = null;

  constructor(page: Page) {
    this.page = page;
  }

  // ==================== 登录状态 ====================

  /**
   * 检查登录状态
   *
   * 登录状态获取方式：
   * 1. 检查页面是否有用户头像（登录后才显示）
   * 2. 检查 cookie 中的 a1 和 web_session
   * 3. 检查 localStorage 中的用户信息
   */
  async checkLoginStatus(): Promise<LoginStatus> {
    const status = await this.page.evaluate(() => {
      // 方法1: 检查用户头像元素
      const avatarImg = document.querySelector('.user-avatar img, [class*="avatar"] img') as HTMLImageElement;
      const userLink = document.querySelector('a[href*="/user/profile/"]');

      // 方法2: 检查登录按钮是否存在（未登录时显示）
      const loginBtn = document.querySelector('.login-btn, [class*="login-button"]');

      // 方法3: 从页面 JS 状态获取
      let userInfo = null;
      try {
        // 小红书会在 window.__INITIAL_STATE__ 中存储用户信息
        const state = (window as any).__INITIAL_STATE__;
        if (state?.user?.userBasicInfo) {
          userInfo = {
            userId: state.user.userBasicInfo.userId,
            username: state.user.userBasicInfo.nickname,
            avatar: state.user.userBasicInfo.image,
          };
        }
      } catch {}

      const isLoggedIn = !!(avatarImg || userLink || userInfo) && !loginBtn;

      return {
        isLoggedIn,
        ...userInfo,
      };
    });

    this.loginStatus = status;
    return status;
  }

  /**
   * 获取登录 Cookie
   * 用于持久化登录状态
   */
  async getLoginCookies(): Promise<Record<string, string>> {
    const playwrightPage = this.page.getPlaywrightPage();
    const context = playwrightPage.context();

    const cookies = await context.cookies();
    const result: Record<string, string> = {};

    // 小红书关键 cookie
    const keyCookies = ['a1', 'web_session', 'webId', 'websectiga'];

    for (const cookie of cookies) {
      if (keyCookies.includes(cookie.name) || cookie.name.startsWith('xhs')) {
        result[cookie.name] = cookie.value;
      }
    }

    return result;
  }

  /**
   * 等待用户登录
   * 打开登录页面，等待用户完成登录
   */
  async waitForLogin(timeoutMs: number = 60000): Promise<boolean> {
    // 检查是否已登录
    const currentStatus = await this.checkLoginStatus();
    if (currentStatus.isLoggedIn) {
      return true;
    }

    // 打开首页，触发登录弹窗或跳转
    await this.page.goto(this.baseUrl);
    await sleep(2000);

    // 点击登录按钮（如果需要）
    await this.page.evaluate(() => {
      const loginBtn = document.querySelector('.login-btn, [class*="login-button"]') as HTMLElement;
      if (loginBtn) loginBtn.click();
    });

    console.log('请在浏览器中完成登录...');
    console.log(`等待时间: ${timeoutMs / 1000} 秒`);

    // 轮询检查登录状态
    const startTime = Date.now();
    while (Date.now() - startTime < timeoutMs) {
      await sleep(2000);
      const status = await this.checkLoginStatus();
      if (status.isLoggedIn) {
        console.log('登录成功！');
        this.loginStatus = status;
        return true;
      }
    }

    console.log('登录超时');
    return false;
  }

  // ==================== 页面导航 ====================

  /**
   * 打开小红书首页
   */
  async openHome(): Promise<void> {
    await this.page.goto(this.baseUrl);
    await this.simulateBrowsing();
  }

  /**
   * 打开笔记详情页
   */
  async openNote(noteId: string): Promise<void> {
    const url = `${this.baseUrl}/explore/${noteId}`;
    await this.page.goto(url);
    await sleep(RandomDelay.pageLoadDelay());
  }

  /**
   * 打开搜索页面
   */
  async openSearch(keyword: string): Promise<void> {
    const encodedKeyword = encodeURIComponent(keyword);
    const url = `${this.baseUrl}/search_result?keyword=${encodedKeyword}`;
    await this.page.goto(url);
    await sleep(RandomDelay.pageLoadDelay());
  }

  // ==================== 搜索功能 ====================

  /**
   * 搜索笔记
   */
  async search(keyword: string, options?: {
    type?: 'note' | 'user';
    limit?: number;
  }): Promise<SearchResult> {
    await this.openSearch(keyword);
    await sleep(1500 + Math.random() * 1000);

    // 等待搜索结果加载
    await this.page.waitForSelector('[class*="search-result"], .feeds-page, .note-item', 10000);

    // 切换到笔记/用户 Tab
    if (options?.type === 'user') {
      await this.page.evaluate(() => {
        const userTab = document.querySelector('[class*="tab"]:nth-child(2), [data-type="user"]') as HTMLElement;
        if (userTab) userTab.click();
      });
      await sleep(1500);
    }

    // 滚动加载更多
    const limit = options?.limit || 20;
    await this.loadMore(Math.ceil(limit / 10));

    const result = await this.page.evaluate(() => {
      const notes: FeedItem[] = [];
      const users: Array<{ id: string; name: string; avatar: string }> = [];

      // 笔记结果
      document.querySelectorAll('a[href*="/explore/"], [class*="note-item"]').forEach((el) => {
        const link = el.closest('a') || el as HTMLAnchorElement;
        const href = link.getAttribute('href') || '';
        const match = href.match(/explore\/([a-f0-9]+)/);

        if (match) {
          const img = el.querySelector('img');
          const titleEl = el.querySelector('[class*="title"], .title');
          notes.push({
            id: match[1],
            title: titleEl?.textContent?.trim() || '',
            cover: img?.src || '',
            author: '',
            likes: 0,
          });
        }
      });

      // 用户结果
      document.querySelectorAll('[class*="user-item"], [class*="author-wrapper"]').forEach((el) => {
        const avatar = el.querySelector('img')?.src || '';
        const name = el.querySelector('[class*="name"], .username')?.textContent?.trim() || '';
        const link = el.querySelector('a[href*="/user/profile/"]');
        const userId = link?.getAttribute('href')?.match(/profile\/([^/]+)/)?.[1] || '';

        if (name && userId) {
          users.push({ id: userId, name, avatar });
        }
      });

      return { notes, users };
    });

    return {
      notes: result.notes.slice(0, limit),
      users: result.users.slice(0, limit),
    };
  }

  /**
   * 在搜索结果中筛选
   */
  async searchWithFilter(
    keyword: string,
    filter: {
      sortBy?: 'general' | 'newest' | 'hottest';
      type?: 'all' | 'video' | 'image';
    }
  ): Promise<SearchResult> {
    await this.openSearch(keyword);
    await sleep(1500);

    // 点击筛选
    if (filter.sortBy) {
      const sortMap = {
        'general': 1,
        'newest': 2,
        'hottest': 3,
      };
      await this.page.evaluate((index) => {
        const tabs = document.querySelectorAll('[class*="sort-item"], [class*="filter-tab"]');
        (tabs[index] as HTMLElement)?.click();
      }, sortMap[filter.sortBy] - 1);
      await sleep(1000);
    }

    if (filter.type && filter.type !== 'all') {
      await this.page.evaluate((type) => {
        const filterBtn = document.querySelector(`[data-type="${type}"], [class*="filter-${type}"]`) as HTMLElement;
        if (filterBtn) filterBtn.click();
      }, filter.type);
      await sleep(1000);
    }

    return this.search(keyword, { limit: 20 });
  }

  // ==================== 评论功能 ====================

  /**
   * 发表评论
   */
  async comment(text: string): Promise<{ success: boolean; message: string }> {
    // 检查登录状态
    const status = await this.checkLoginStatus();
    if (!status.isLoggedIn) {
      return { success: false, message: '请先登录' };
    }

    await this.page.getHuman().randomMouseMove();
    await sleep(RandomDelay.thinkTime());

    // 点击评论按钮打开评论区
    const commentBtnFound = await this.page.evaluate(() => {
      const chatBtn = document.querySelector('.chat-wrapper, [class*="comment-btn"]') as HTMLElement;
      if (chatBtn) {
        chatBtn.click();
        return true;
      }
      return false;
    });

    if (commentBtnFound) {
      await sleep(800 + Math.random() * 500);
    }

    // 找到评论输入框
    const inputResult = await this.page.evaluate(() => {
      // 多种可能的选择器
      const selectors = [
        '#content-textarea',
        '[contenteditable="true"]',
        'textarea[placeholder*="评论"]',
        '[class*="comment-input"]',
        '[class*="reply-input"]',
      ];

      for (const selector of selectors) {
        const el = document.querySelector(selector);
        if (el) {
          el.setAttribute('data-xhs-comment-input', 'true');
          return { found: true, tag: el.tagName };
        }
      }
      return { found: false };
    });

    if (!inputResult.found) {
      return { success: false, message: '未找到评论输入框' };
    }

    // 点击输入框聚焦
    await this.page.evaluate(() => {
      const input = document.querySelector('[data-xhs-comment-input]') as HTMLElement;
      if (input) input.focus();
    });

    await sleep(300 + Math.random() * 200);

    // 输入评论内容（带真人行为）
    const human = this.page.getHuman();
    await human.humanType(text);

    await sleep(500 + Math.random() * 500);

    // 点击发送按钮
    const sendResult = await this.page.evaluate((commentText) => {
      const selectors = [
        'button.btn.submit',
        '[class*="submit-btn"]',
        '[class*="send-btn"]',
        'button[type="submit"]',
      ];

      for (const selector of selectors) {
        const btn = document.querySelector(selector) as HTMLElement;
        if (btn && !btn.disabled) {
          btn.click();
          return { success: true, message: `评论已发送: ${commentText}` };
        }
      }
      return { success: false, message: '未找到发送按钮' };
    }, text);

    await sleep(RandomDelay.actionInterval());
    return sendResult;
  }

  /**
   * 回复评论
   */
  async replyComment(commentIndex: number, text: string): Promise<{ success: boolean; message: string }> {
    const status = await this.checkLoginStatus();
    if (!status.isLoggedIn) {
      return { success: false, message: '请先登录' };
    }

    // 点击回复按钮
    await this.page.evaluate((index) => {
      const replyBtns = document.querySelectorAll('[class*="reply-btn"], [class*="reply"]');
      (replyBtns[index] as HTMLElement)?.click();
    }, commentIndex);

    await sleep(500 + Math.random() * 300);

    // 输入回复内容
    const human = this.page.getHuman();
    await human.humanType(text);

    await sleep(500);

    // 发送
    const result = await this.page.evaluate((replyText) => {
      const sendBtn = document.querySelector('[class*="submit-btn"], button[type="submit"]') as HTMLElement;
      if (sendBtn) {
        sendBtn.click();
        return { success: true, message: `回复已发送: ${replyText}` };
      }
      return { success: false, message: '发送失败' };
    }, text);

    await sleep(RandomDelay.actionInterval());
    return result;
  }

  /**
   * 获取评论列表
   */
  async getComments(limit: number = 20): Promise<Array<{
    id: string;
    user: string;
    content: string;
    likes: number;
    time: string;
  }>> {
    await this.page.evaluate(() => {
      const chatBtn = document.querySelector('.chat-wrapper, [class*="comment-btn"]') as HTMLElement;
      if (chatBtn) chatBtn.click();
    });

    await sleep(1000);

    // 滚动加载更多评论
    for (let i = 0; i < Math.ceil(limit / 10); i++) {
      await this.page.getHuman().humanScroll('down', 200);
      await sleep(500);
    }

    return await this.page.evaluate(() => {
      const comments: any[] = [];
      document.querySelectorAll('[class*="comment-item"], [class*="comment-wrapper"]').forEach((el, i) => {
        const user = el.querySelector('[class*="user-name"], [class*="author"]')?.textContent?.trim() || '';
        const content = el.querySelector('[class*="content"], [class*="text"]')?.textContent?.trim() || '';
        const likes = el.querySelector('[class*="like-count"], [class*="count"]')?.textContent?.trim() || '0';
        const time = el.querySelector('[class*="time"], [class*="date"]')?.textContent?.trim() || '';

        comments.push({
          id: String(i),
          user,
          content,
          likes: parseInt(likes) || 0,
          time,
        });
      });
      return comments;
    });
  }

  // ==================== 发布功能 ====================

  /**
   * 发布笔记
   *
   * @param options 发布选项
   * @param options.title 标题
   * @param options.content 正文
   * @param options.images 本地图片路径数组（最多9张）
   * @param options.tags 标签
   * @param options.location 位置
   */
  async publishNote(options: PublishOptions): Promise<{ success: boolean; message: string; noteId?: string }> {
    // 检查登录
    const status = await this.checkLoginStatus();
    if (!status.isLoggedIn) {
      return { success: false, message: '请先登录' };
    }

    if (!options.images || options.images.length === 0) {
      return { success: false, message: '至少需要上传一张图片' };
    }

    if (options.images.length > 9) {
      return { success: false, message: '最多支持9张图片' };
    }

    try {
      // 1. 打开创作者中心
      await this.page.goto('https://creator.xiaohongshu.com/publish/publish');
      await sleep(2000 + Math.random() * 1000);

      // 2. 上传图片
      console.log(`上传 ${options.images.length} 张图片...`);

      const playwrightPage = this.page.getPlaywrightPage();
      const fileInput = await playwrightPage.$('input[type="file"]');

      if (!fileInput) {
        return { success: false, message: '未找到文件上传按钮' };
      }

      // 设置文件
      await fileInput.setInputFiles(options.images);
      await sleep(3000 + Math.random() * 2000); // 等待上传

      // 3. 填写标题
      console.log('填写标题...');
      await this.page.evaluate((title) => {
        const titleInput = document.querySelector('input[placeholder*="标题"], [class*="title-input"]') as HTMLInputElement;
        if (titleInput) {
          titleInput.value = title;
          titleInput.dispatchEvent(new Event('input', { bubbles: true }));
        }
      }, options.title);

      await sleep(500 + Math.random() * 500);

      // 4. 填写正文
      console.log('填写正文...');
      await this.page.evaluate(() => {
        const contentInput = document.querySelector('[contenteditable="true"], textarea[placeholder*="正文"]');
        if (contentInput) {
          contentInput.setAttribute('data-xhs-content-input', 'true');
        }
      });

      const human = this.page.getHuman();
      await human.humanType(options.content);

      await sleep(500 + Math.random() * 500);

      // 5. 添加标签
      if (options.tags && options.tags.length > 0) {
        console.log(`添加 ${options.tags.length} 个标签...`);
        for (const tag of options.tags) {
          await this.page.evaluate((t) => {
            const tagInput = document.querySelector('input[placeholder*="标签"], [class*="tag-input"]') as HTMLInputElement;
            if (tagInput) {
              tagInput.value = '#' + t;
              tagInput.dispatchEvent(new Event('input', { bubbles: true }));
            }
          }, tag);
          await sleep(500);

          // 点击第一个建议
          await this.page.evaluate(() => {
            const suggestion = document.querySelector('[class*="tag-suggestion"], [class*="tag-item"]') as HTMLElement;
            if (suggestion) suggestion.click();
          });
          await sleep(300);
        }
      }

      // 6. 添加位置
      if (options.location) {
        await this.page.evaluate((loc) => {
          const locationBtn = document.querySelector('[class*="location-btn"], [class*="add-location"]') as HTMLElement;
          if (locationBtn) locationBtn.click();
        }, options.location);
        await sleep(500);

        await this.page.evaluate((loc) => {
          const searchInput = document.querySelector('input[placeholder*="位置"]') as HTMLInputElement;
          if (searchInput) {
            searchInput.value = loc;
            searchInput.dispatchEvent(new Event('input', { bubbles: true }));
          }
        }, options.location);
        await sleep(1000);

        await this.page.evaluate(() => {
          const firstResult = document.querySelector('[class*="location-item"], [class*="location-result"]') as HTMLElement;
          if (firstResult) firstResult.click();
        });
        await sleep(500);
      }

      // 7. 发布
      console.log('发布笔记...');
      await this.page.evaluate(() => {
        const publishBtn = document.querySelector('[class*="publish-btn"], button[class*="submit"]') as HTMLElement;
        if (publishBtn) publishBtn.click();
      });

      await sleep(3000);

      // 8. 检查发布结果
      const result = await this.page.evaluate(() => {
        // 检查是否发布成功
        const successIndicator = document.querySelector('[class*="success"], [class*="published"]');
        const errorMessage = document.querySelector('[class*="error"], [class*="failed"]');

        if (successIndicator) {
          // 尝试获取笔记 ID
          const urlMatch = window.location.href.match(/explore\/([a-f0-9]+)/);
          return {
            success: true,
            message: '发布成功',
            noteId: urlMatch?.[1] || '',
          };
        }

        if (errorMessage) {
          return {
            success: false,
            message: errorMessage.textContent || '发布失败',
          };
        }

        // 默认认为成功（页面可能已跳转）
        return {
          success: true,
          message: '发布请求已提交',
        };
      });

      await sleep(RandomDelay.actionInterval());
      return result;

    } catch (error) {
      return {
        success: false,
        message: `发布出错: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * 发布视频笔记
   */
  async publishVideo(options: {
    title: string;
    content: string;
    videoPath: string;
    coverPath?: string;
    tags?: string[];
  }): Promise<{ success: boolean; message: string }> {
    const status = await this.checkLoginStatus();
    if (!status.isLoggedIn) {
      return { success: false, message: '请先登录' };
    }

    try {
      // 打开发布页面
      await this.page.goto('https://creator.xiaohongshu.com/publish/publish');
      await sleep(2000);

      // 切换到视频 Tab
      await this.page.evaluate(() => {
        const videoTab = document.querySelector('[class*="video-tab"], [data-type="video"]') as HTMLElement;
        if (videoTab) videoTab.click();
      });
      await sleep(1000);

      // 上传视频
      console.log('上传视频...');
      const playwrightPage = this.page.getPlaywrightPage();
      const fileInput = await playwrightPage.$('input[type="file"]');

      if (!fileInput) {
        return { success: false, message: '未找到文件上传按钮' };
      }

      await fileInput.setInputFiles(options.videoPath);

      // 等待视频上传（视频较大，需要更长时间）
      console.log('视频上传中，请耐心等待...');
      await sleep(10000 + Math.random() * 5000);

      // 填写标题和内容
      await this.page.evaluate((title) => {
        const titleInput = document.querySelector('input[placeholder*="标题"]') as HTMLInputElement;
        if (titleInput) {
          titleInput.value = title;
          titleInput.dispatchEvent(new Event('input', { bubbles: true }));
        }
      }, options.title);

      // 填写正文...
      // 类似图片发布流程

      // 发布
      await this.page.evaluate(() => {
        const publishBtn = document.querySelector('[class*="publish-btn"]') as HTMLElement;
        if (publishBtn) publishBtn.click();
      });

      await sleep(3000);

      return { success: true, message: '视频发布请求已提交' };

    } catch (error) {
      return {
        success: false,
        message: `发布出错: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  // ==================== 笔记操作 ====================

  /**
   * 获取笔记信息
   */
  async getNoteInfo(): Promise<NoteInfo | null> {
    const info = await this.page.evaluate(() => {
      // 标题
      const titleEl = document.querySelector('.title, [class*="title"]');
      const title = titleEl?.textContent?.trim() || '';

      // 描述
      const descEl = document.querySelector('.desc, .note-text, [class*="desc"]');
      const desc = descEl?.textContent?.trim() || '';

      // 作者
      const authorEl = document.querySelector('.author-wrapper .username, [class*="author-name"]');
      const authorName = authorEl?.textContent?.trim() || '';
      const authorId = '';

      // 统计数据
      const likeBtn = document.querySelector('.like-wrapper');
      const collectBtn = document.querySelector('.collect-wrapper');
      const chatBtn = document.querySelector('.chat-wrapper');

      const parseCount = (text: string): number => {
        text = text.trim();
        if (text.endsWith('w') || text.endsWith('万')) {
          return Math.floor(parseFloat(text) * 10000);
        }
        return parseInt(text) || 0;
      };

      // 图片列表
      const images: string[] = [];
      document.querySelectorAll('.swiper-slide img, [class*="carousel"] img').forEach((img) => {
        const src = (img as HTMLImageElement).src;
        if (src && !images.includes(src)) {
          images.push(src);
        }
      });

      // 标签
      const tags: string[] = [];
      document.querySelectorAll('.tag, [class*="tag"] a').forEach((tag) => {
        const text = tag.textContent?.trim();
        if (text && !tags.includes(text)) {
          tags.push(text);
        }
      });

      return {
        title,
        desc,
        author: {
          id: authorId,
          name: authorName,
        },
        stats: {
          likes: parseCount(likeBtn?.textContent || '0'),
          collects: parseCount(collectBtn?.textContent || '0'),
          comments: parseCount(chatBtn?.textContent || '0'),
        },
        images,
        tags,
        liked: likeBtn?.classList.contains('like-active') || false,
        collected: collectBtn?.classList.contains('collect-active') || false,
      };
    });

    return info ? { id: '', ...info } : null;
  }

  /**
   * 点赞笔记
   */
  async like(): Promise<{ success: boolean; message: string }> {
    await this.page.getHuman().randomMouseMove();
    await sleep(RandomDelay.thinkTime());

    const result = await this.page.evaluate(() => {
      const btn = document.querySelector('.like-wrapper') as HTMLElement;
      if (!btn) return { success: false, message: '未找到点赞按钮' };

      const isLiked = btn.classList.contains('like-active');
      if (isLiked) return { success: false, message: '已经点赞过了' };

      btn.click();
      return { success: true, message: '点赞成功' };
    });

    await sleep(RandomDelay.actionInterval());
    return result;
  }

  /**
   * 取消点赞
   */
  async unlike(): Promise<{ success: boolean; message: string }> {
    await this.page.getHuman().randomMouseMove();
    await sleep(RandomDelay.thinkTime());

    const result = await this.page.evaluate(() => {
      const btn = document.querySelector('.like-wrapper') as HTMLElement;
      if (!btn) return { success: false, message: '未找到点赞按钮' };

      const isLiked = btn.classList.contains('like-active');
      if (!isLiked) return { success: false, message: '还未点赞' };

      btn.click();
      return { success: true, message: '取消点赞成功' };
    });

    await sleep(RandomDelay.actionInterval());
    return result;
  }

  /**
   * 收藏笔记
   */
  async collect(): Promise<{ success: boolean; message: string }> {
    await this.page.getHuman().randomMouseMove();
    await sleep(RandomDelay.thinkTime());

    const result = await this.page.evaluate(() => {
      const btn = document.querySelector('.collect-wrapper') as HTMLElement;
      if (!btn) return { success: false, message: '未找到收藏按钮' };

      const isCollected = btn.classList.contains('collect-active');
      if (isCollected) return { success: false, message: '已经收藏过了' };

      btn.click();
      return { success: true, message: '收藏成功' };
    });

    await sleep(RandomDelay.actionInterval());
    return result;
  }

  // ==================== 辅助功能 ====================

  /**
   * 模拟浏览行为
   */
  async simulateBrowsing(durationMs: number = 5000): Promise<void> {
    const human = this.page.getHuman();
    await human.randomScroll(durationMs);
    if (Math.random() > 0.5) {
      await human.randomMouseMove();
    }
  }

  /**
   * 滚动加载更多
   */
  async loadMore(times: number = 3): Promise<void> {
    for (let i = 0; i < times; i++) {
      await this.page.getHuman().humanScroll('down', 300 + Math.random() * 200);
      await sleep(1000 + Math.random() * 1000);
    }
  }

  /**
   * 获取首页推荐列表
   */
  async getFeed(limit: number = 10): Promise<FeedItem[]> {
    await this.openHome();
    await this.loadMore(Math.ceil(limit / 20));

    const items = await this.page.evaluate(() => {
      const results: FeedItem[] = [];
      const cards = document.querySelectorAll('a[href*="/explore/"]');

      cards.forEach((card) => {
        const href = card.getAttribute('href') || '';
        const match = href.match(/explore\/([a-f0-9]+)/);

        if (match) {
          const img = card.querySelector('img');
          results.push({
            id: match[1],
            title: card.getAttribute('title') || card.textContent?.trim().slice(0, 50) || '',
            cover: img?.src || '',
            author: '',
            likes: 0,
          });
        }
      });

      return results;
    });

    return items.slice(0, limit);
  }

  /**
   * 批量操作（带反爬虫间隔）
   */
  async batchAction<T>(
    items: T[],
    action: (item: T, index: number) => Promise<void>
  ): Promise<void> {
    await this.page.getHuman().batchAction(items, action);
  }
}
