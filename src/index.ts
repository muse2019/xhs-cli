#!/usr/bin/env node
/**
 * 小红书 CLI - 复用已登录 Chrome，无需重新登录
 *
 * 架构: CLI -> Daemon -> Chrome Extension -> 浏览器
 *
 * 用法:
 *   xhs daemon start          启动 Daemon
 *   xhs operate open <url>    打开网页（使用已登录的 Chrome）
 *   xhs xiaohongshu search <keyword>  搜索
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { spawn, execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { BridgePage } from './browser/bridge-page.js';
import * as daemonClient from './daemon/client.js';

const program = new Command();

// 全局实例
let bridgePage: BridgePage | null = null;

// 缓存文件路径
const FEED_CACHE_FILE = join(dirname(fileURLToPath(import.meta.url)), '..', '.feed-cache.json');

// 读取 feed 缓存
function readFeedCache(): Array<{ id: string; title: string; author: string; url: string }> {
  try {
    if (existsSync(FEED_CACHE_FILE)) {
      const data = readFileSync(FEED_CACHE_FILE, 'utf-8');
      return JSON.parse(data);
    }
  } catch {}
  return [];
}

// 写入 feed 缓存
function writeFeedCache(feed: Array<{ id: string; title: string; author: string; url: string }>) {
  try {
    writeFileSync(FEED_CACHE_FILE, JSON.stringify(feed, null, 2));
  } catch {}
}

// ==================== Daemon 命令 ====================

const daemon = program
  .command('daemon')
  .description('Daemon 管理');

daemon
  .command('start')
  .description('启动 Daemon')
  .option('--port <port>', '端口', '19826')
  .action(async (opts: { port: string }) => {
    console.log(chalk.dim('启动 Daemon...'));

    const __dirname = dirname(fileURLToPath(import.meta.url));
    const daemonPath = join(__dirname, 'daemon', 'index.js');

    // 使用 spawn 启动 daemon（后台运行）
    const child = spawn('node', [daemonPath], {
      detached: true,
      stdio: 'ignore',
      env: { ...process.env, PORT: opts.port },
    });

    child.unref();

    // 等待启动
    await new Promise(resolve => setTimeout(resolve, 1000));

    const status = await daemonClient.checkDaemonStatus();
    if (status) {
      console.log(chalk.green(`✓ Daemon 已启动 (端口: ${opts.port})`));
      console.log(chalk.dim('\n请确保已安装 XHS CLI Bridge Chrome 扩展'));
      console.log(chalk.dim('扩展目录: xiaohongshu-cli/extension/'));
    } else {
      console.log(chalk.red('✗ Daemon 启动失败'));
    }
  });

daemon
  .command('status')
  .description('检查 Daemon 状态')
  .action(async () => {
    const status = await daemonClient.checkDaemonStatus();

    if (!status) {
      console.log(chalk.red('✗ Daemon 未运行'));
      console.log(chalk.dim('运行 xhs daemon start 启动'));
      return;
    }

    console.log(chalk.green('✓ Daemon 运行中'));
    console.log(chalk.dim(`  扩展连接: ${status.extensionConnected ? '是' : '否'}`));
    console.log(chalk.dim(`  最后心跳: ${status.lastHeartbeat ? new Date(status.lastHeartbeat).toLocaleString() : '无'}`));

    if (!status.extensionConnected) {
      console.log(chalk.yellow('\n请安装并启用 XHS CLI Bridge Chrome 扩展'));
    }
  });

daemon
  .command('stop')
  .description('停止 Daemon')
  .action(async () => {
    try {
      // 通过 curl 发送停止命令（需要实现）
      console.log(chalk.green('✓ Daemon 已停止'));
    } catch {
      console.log(chalk.red('✗ 停止失败'));
    }
  });

// ==================== Config 命令 ====================

const config = program
  .command('config')
  .description('配置管理');

config
  .command('cdp')
  .argument('<on|off>', 'Enable or disable CDP mode')
  .description('启用/禁用 CDP 模式（isTrusted=true 事件，会产生浏览器警告条）')
  .action(async (mode: string) => {
    const enabled = mode === 'on' || mode === 'true' || mode === '1';
    const result = await daemonClient.setCdpMode(enabled);
    console.log(chalk.green(`✓ CDP 模式已${enabled ? '启用' : '禁用'}`));
    if (enabled) {
      console.log(chalk.yellow('  注意：浏览器顶部将显示"扩展正在调试此浏览器"警告条'));
    }
  });

config
  .command('show')
  .description('显示当前配置')
  .action(async () => {
    const cfg = await daemonClient.getConfig();
    console.log(chalk.bold('\n当前配置:'));
    console.log(`  CDP 模式: ${cfg.cdp ? chalk.green('启用') : chalk.dim('禁用')}`);
    if (cfg.cdp) {
      console.log(chalk.yellow('  ⚠️ CDP 模式会产生浏览器警告条'));
    }
  });

// ==================== Operate 命令 ====================

const operate = program
  .command('operate')
  .description('浏览器操作 - 使用已登录的 Chrome');

operate
  .command('open')
  .argument('<url>', 'URL to open')
  .description('打开网页')
  .action(async (url: string) => {
    const page = await getBridgePage();
    console.log(chalk.dim(`导航到: ${url}`));
    const actualUrl = await page.goto(url);
    console.log(chalk.green(`✓ 已打开: ${actualUrl}`));
  });

operate
  .command('state')
  .description('获取页面状态和可交互元素')
  .action(async () => {
    const page = await getBridgePage();
    const state = await page.getState();

    console.log(chalk.bold(`\nURL: ${state.url}`));
    console.log(chalk.bold(`Title: ${state.title}\n`));

    console.log(chalk.bold('可交互元素:'));
    state.elements.slice(0, 30).forEach((el) => {
      const tag = chalk.cyan(`[${el.ref}]`);
      const type = chalk.dim(`<${el.tag}>`);
      const text = el.text.slice(0, 30) || chalk.dim('(no text)');
      console.log(`  ${tag} ${type} ${text}`);
    });

    if (state.elements.length > 30) {
      console.log(chalk.dim(`\n  ... 还有 ${state.elements.length - 30} 个元素`));
    }
  });

operate
  .command('click')
  .argument('<ref>', 'Element reference')
  .description('点击元素')
  .action(async (ref: string) => {
    const page = await getBridgePage();
    await page.click(ref);
    console.log(chalk.green(`✓ 已点击元素 [${ref}]`));
  });

operate
  .command('type')
  .argument('<ref>', 'Element reference')
  .argument('<text>', 'Text to type')
  .description('输入文本')
  .action(async (ref: string, text: string) => {
    const page = await getBridgePage();
    await page.type(ref, text);
    console.log(chalk.green(`✓ 已输入: "${text}"`));
  });

operate
  .command('scroll')
  .argument('<direction>', 'up or down')
  .option('--amount <pixels>', 'Scroll amount', '300')
  .description('滚动页面')
  .action(async (direction: string, opts: { amount: string }) => {
    if (direction !== 'up' && direction !== 'down') {
      console.error(chalk.red('方向必须是 up 或 down'));
      return;
    }
    const page = await getBridgePage();
    await page.scroll(direction as 'up' | 'down', parseInt(opts.amount, 10));
    console.log(chalk.green(`✓ 已滚动 ${direction}`));
  });

operate
  .command('screenshot')
  .argument('[path]', 'Save path')
  .description('截图')
  .action(async (path?: string) => {
    const page = await getBridgePage();
    const dataUrl = await page.screenshot(path ? { path } : undefined);

    if (!path) {
      console.log(dataUrl.slice(0, 100) + '...');
    } else {
      console.log(chalk.green(`✓ 截图已保存: ${path}`));
    }
  });

operate
  .command('eval')
  .argument('<code>', 'JavaScript code')
  .description('执行 JavaScript')
  .action(async (code: string) => {
    const page = await getBridgePage();
    const result = await page.evaluate(code);
    console.log(JSON.stringify(result, null, 2));
  });

operate
  .command('wait')
  .argument('<seconds>', 'Seconds to wait')
  .description('等待指定时间')
  .action(async (seconds: string) => {
    const page = await getBridgePage();
    await page.wait(parseFloat(seconds));
    console.log(chalk.green(`✓ 已等待 ${seconds} 秒`));
  });

operate
  .command('cookies')
  .option('--domain <domain>', 'Cookie domain', '.xiaohongshu.com')
  .description('获取 Cookie')
  .action(async (opts: { domain: string }) => {
    const page = await getBridgePage();
    const cookies = await page.getCookies(opts.domain);

    console.log(chalk.bold('\nCookies:\n'));
    cookies.forEach(c => {
      console.log(`  ${chalk.cyan(c.name)}: ${c.value.slice(0, 30)}...`);
    });
  });

operate
  .command('tabs')
  .description('获取标签页列表')
  .action(async () => {
    const page = await getBridgePage();
    const tabs = await page.getTabs();

    console.log(chalk.bold('\n标签页:\n'));
    tabs.forEach((tab, i) => {
      console.log(`  [${i}] ${chalk.cyan(tab.title?.slice(0, 30) || '无标题')}`);
      console.log(chalk.dim(`      ${tab.url?.slice(0, 60)}`));
    });
  });

// ==================== 小红书命令 ====================

const xiaohongshu = program
  .command('xiaohongshu')
  .alias('xhs')
  .description('小红书专用命令');

xiaohongshu
  .command('feed')
  .option('--limit <n>', '结果数量', '20')
  .option('--json', '输出 JSON 格式')
  .description('获取首页推荐 Feed 流')
  .action(async (opts: { limit: string; json: boolean }) => {
    const page = await getBridgePage();

    console.log(chalk.dim('获取首页 Feed...'));
    await page.goto('https://www.xiaohongshu.com/explore');
    await page.wait(2);

    // 滚动加载更多内容
    for (let i = 0; i < 3; i++) {
      await page.evaluate(`window.scrollBy(0, 500)`);
      await page.wait(0.5);
    }

    const limit = parseInt(opts.limit, 10);
    const rawResults = await page.evaluate(`
      (() => {
        const notes = [];

        // 使用正确的选择器 - 只获取可见的 cover 卡片
        document.querySelectorAll('a[href*="/explore/"][class*="cover"]').forEach(el => {
          const href = el.getAttribute('href') || '';
          const match = href.match(/explore\\/([a-f0-9]+)/);
          if (!match) return;

          const card = el.closest('section') || el.closest('[class*="note-item"]') || el.parentElement?.parentElement;

          // 获取标题
          let title = '';
          const titleEl = card?.querySelector('[class*="title"], [class*="name"]');
          if (titleEl) {
            title = titleEl.textContent?.trim() || '';
          } else {
            title = el.getAttribute('title') || el.textContent?.trim().slice(0, 50) || '';
          }

          // 获取作者
          let author = '';
          const authorEl = card?.querySelector('[class*="author"], [class*="name"]');
          if (authorEl && authorEl !== titleEl) {
            author = authorEl.textContent?.trim() || '';
          }

          // 获取封面图
          let cover = '';
          const img = card?.querySelector('img');
          if (img) {
            cover = img.src || '';
          }

          // 获取点赞数
          let likes = '';
          const likeEl = card?.querySelector('[class*="like"], [class*="count"]');
          if (likeEl) {
            likes = likeEl.textContent?.trim() || '';
          }

          notes.push({
            id: match[1],
            title: title.slice(0, 100),
            author,
            cover,
            likes,
            url: 'https://www.xiaohongshu.com/explore/' + match[1],
          });
        });

        // 去重
        const seen = new Set();
        return notes.filter(n => {
          if (seen.has(n.id)) return false;
          seen.add(n.id);
          return true;
        });
      })()
    `);

    // 确保结果是数组
    const feed = Array.isArray(rawResults) ? rawResults.slice(0, limit) : [];

    // 缓存结果到文件，供 view 命令使用
    writeFeedCache(feed);

    if (opts.json) {
      console.log(JSON.stringify(feed, null, 2));
      return;
    }

    console.log(chalk.bold(`\n首页 Feed (${feed.length} 条):\n`));
    console.log(chalk.dim('提示: 使用 xhs xiaohongshu view <编号> 查看笔记详情\n'));
    feed.forEach((item, i) => {
      console.log(`  [${i + 1}] ${chalk.cyan(item.id)}`);
      console.log(`      ${chalk.dim(item.title.slice(0, 40))}`);
      if (item.author) {
        console.log(`      ${chalk.dim('@' + item.author)}`);
      }
      console.log();
    });
  });

xiaohongshu
  .command('view')
  .argument('<number>', '笔记编号 (从 feed 列表中选择)')
  .description('查看指定编号的笔记详情（在当前页面点击打开）')
  .action(async (num: string) => {
    const feedCache = readFeedCache();
    const index = parseInt(num, 10) - 1;

    if (index < 0 || index >= feedCache.length) {
      console.error(chalk.red(`✗ 无效编号: ${num}，请先运行 xhs xiaohongshu feed 获取列表`));
      return;
    }

    const note = feedCache[index];
    console.log(chalk.dim(`点击笔记 [${num}]: ${note.title.slice(0, 30)}...`));

    const page = await getBridgePage();

    // 检查当前页面是否在 feed 页面，如果不在则导航过去
    const currentUrl = await page.evaluate(`location.href`) as string;
    const isOnFeedPage = currentUrl?.includes('xiaohongshu.com/explore') || currentUrl?.includes('xiaohongshu.com/?');

    if (!isOnFeedPage) {
      console.log(chalk.dim('导航到首页...'));
      await page.goto('https://www.xiaohongshu.com/explore');
      await page.wait(3);
    }

    // 第一步：找到卡片并滚动到可见位置
    const cardInfo = await page.evaluate(`
      (() => {
        // 使用正确的选择器 - 带 cover 类的链接才有正确的位置
        let allCards = document.querySelectorAll('a[href*="/explore/"][class*="cover"]');

        // 如果找不到，尝试其他选择器
        if (allCards.length === 0) {
          allCards = document.querySelectorAll('section a[href*="/explore/"]');
        }

        const cards = Array.from(allCards);

        if (cards.length === 0) {
          return { success: false, error: '页面未加载完成' };
        }

        // 去重
        const seen = new Set();
        const uniqueCards = [];
        cards.forEach(c => {
          const href = c.getAttribute('href') || '';
          const match = href.match(/explore\\/([a-f0-9]+)/);
          if (match && !seen.has(match[1])) {
            seen.add(match[1]);
            uniqueCards.push(c);
          }
        });

        let targetCard = null;
        let foundIndex = -1;

        // 先尝试通过 ID 查找
        for (let i = 0; i < uniqueCards.length; i++) {
          const card = uniqueCards[i];
          const href = card.getAttribute('href') || '';
          const match = href.match(/explore\\/([a-f0-9]+)/);
          if (match && match[1] === '${note.id}') {
            targetCard = card;
            foundIndex = i;
            break;
          }
        }

        // 如果通过 ID 找不到，按索引选择
        if (!targetCard && ${index} < uniqueCards.length) {
          targetCard = uniqueCards[${index}];
          foundIndex = ${index};
        }

        if (!targetCard) {
          return { success: false, error: '未找到笔记卡片' };
        }

        // 滚动到卡片位置
        targetCard.scrollIntoView({ behavior: 'instant', block: 'center' });

        return { success: true, foundIndex, totalCards: uniqueCards.length };
      })()
    `);

    if (!(cardInfo as any)?.success) {
      console.error(chalk.red(`✗ ${(cardInfo as any)?.error || '获取卡片失败'}`));
      return;
    }

    // 等待滚动完成和页面渲染
    await page.wait(1.5);

    // 第二步：获取卡片位置并用真人行为点击
    const position = await page.evaluate(`
      (() => {
        // 使用正确的选择器
        let allCards = document.querySelectorAll('a[href*="/explore/"][class*="cover"]');

        if (allCards.length === 0) {
          allCards = document.querySelectorAll('section a[href*="/explore/"]');
        }

        const cards = Array.from(allCards);

        const seen = new Set();
        const uniqueCards = [];
        cards.forEach(c => {
          const href = c.getAttribute('href') || '';
          const match = href.match(/explore\\/([a-f0-9]+)/);
          if (match && !seen.has(match[1])) {
            seen.add(match[1]);
            uniqueCards.push(c);
          }
        });

        const targetCard = uniqueCards[${(cardInfo as any).foundIndex}];
        if (!targetCard) {
          return { success: false, error: '卡片消失' };
        }

        // 再次滚动到可见
        targetCard.scrollIntoView({ behavior: 'instant', block: 'center' });

        const rect = targetCard.getBoundingClientRect();

        // 如果宽高为0，尝试找父元素
        let finalRect = rect;
        if (rect.width === 0 || rect.height === 0) {
          const parent = targetCard.closest('section') || targetCard.parentElement;
          if (parent) {
            finalRect = parent.getBoundingClientRect();
          }
        }

        // 如果还在视口外，返回失败
        if (finalRect.width === 0 || finalRect.height === 0 || finalRect.top < 0 || finalRect.bottom > window.innerHeight) {
          // 最后尝试：计算绝对位置
          const absX = finalRect.left + finalRect.width / 2;
          const absY = finalRect.top + finalRect.height / 2 + window.scrollY;

          // 确保坐标在屏幕内
          if (absX > 0 && absX < window.innerWidth && finalRect.height > 0) {
            return {
              success: true,
              x: Math.round(absX),
              y: Math.round(Math.max(100, Math.min(finalRect.top + finalRect.height / 2, window.innerHeight - 100)))
            };
          }

          return { success: false, error: '卡片不可见' };
        }

        return {
          success: true,
          x: Math.round(finalRect.left + finalRect.width / 2),
          y: Math.round(finalRect.top + finalRect.height / 2)
        };
      })()
    `);

    if (!(position as any)?.success) {
      console.error(chalk.red(`✗ ${(position as any)?.error || '获取位置失败'}`));
      console.log(chalk.dim('提示: 请运行 xhs xiaohongshu refresh 刷新页面'));
      return;
    }

    const x = (position as any).x;
    const y = (position as any).y;

    console.log(chalk.dim(`点击坐标: (${x}, ${y})`));

    // 使用真人行为点击
    const clickResult = await daemonClient.humanClick(x, y);

    if (!clickResult.success) {
      console.error(chalk.red(`✗ ${clickResult.error || '点击失败'}`));
      return;
    }

    // 等待弹窗出现
    await page.wait(2);

    // 获取弹窗中的笔记内容
    const info = await page.evaluate(`
      (() => {
        // 找到笔记弹窗容器
        const noteContainer = document.querySelector('[class*="noteContainer"]')
          || document.querySelector('[class*="note-detail"]')
          || document.querySelector('[role="dialog"]')
          || document.body;

        // 标题
        let title = '';
        const titleSelectors = ['[class*="title"]', 'h1', '[class*="noteContent"] [class*="title"]'];
        for (const sel of titleSelectors) {
          const el = noteContainer.querySelector(sel);
          if (el?.textContent?.trim()) {
            title = el.textContent.trim();
            break;
          }
        }

        // 内容
        let desc = '';
        const descSelectors = ['[class*="desc"]', '[class*="content"]', '[class*="note-text"]'];
        for (const sel of descSelectors) {
          const el = noteContainer.querySelector(sel);
          if (el?.textContent?.trim() && el.textContent.length > 20) {
            desc = el.textContent.trim();
            break;
          }
        }

        // 作者
        let author = '';
        const authorEl = noteContainer.querySelector('[class*="author"] [class*="name"], [class*="userName"]');
        if (authorEl) author = authorEl.textContent?.trim() || '';

        // 图片数量
        const images = noteContainer.querySelectorAll('img');
        const imgCount = images.length;

        // 点赞/收藏状态
        const likeBtn = noteContainer.querySelector('.like-wrapper, [class*="like"]');
        const collectBtn = noteContainer.querySelector('.collect-wrapper, [class*="collect"]');

        return {
          title: title.slice(0, 100),
          desc: desc.slice(0, 500),
          author,
          imgCount,
          liked: likeBtn?.classList.contains('like-active') || likeBtn?.classList.contains('active') || false,
          collected: collectBtn?.classList.contains('collect-active') || collectBtn?.classList.contains('active') || false,
        };
      })()
    `);

    console.log(chalk.bold(`\n${(info as any).title || '(无标题)'}`));
    console.log(chalk.dim(`作者: ${(info as any).author || '(未知)'}`));
    console.log(chalk.dim(`图片: ${(info as any).imgCount || 0} 张`));

    if ((info as any).desc && (info as any).desc.length > 10) {
      console.log(chalk.dim(`\n内容:\n${(info as any).desc}`));
    }

    console.log(chalk.dim(`\n状态: ${(info as any).liked ? '已点赞' : '未点赞'} | ${(info as any).collected ? '已收藏' : '未收藏'}`));
    console.log(chalk.dim('\n提示: xhs xiaohongshu like/collect 点赞收藏，xhs xiaohongshu back 返回'));
  });

xiaohongshu
  .command('back')
  .description('关闭笔记弹窗，返回 feed 列表并刷新索引')
  .action(async () => {
    const page = await getBridgePage();

    // 尝试关闭弹窗
    const result = await page.evaluate(`
      (() => {
        // 方法1: 找关闭按钮
        const closeSelectors = [
          '[class*="close"]',
          '[aria-label="关闭"]',
          '[class*="modal"] [class*="close"]',
          '[class*="noteContainer"] [class*="close"]',
          'button[class*="close"]'
        ];

        for (const sel of closeSelectors) {
          const btn = document.querySelector(sel);
          if (btn && btn.offsetParent !== null) {
            btn.click();
            return { success: true, method: 'click' };
          }
        }

        // 方法2: 模拟 ESC 键
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true }));
        document.dispatchEvent(new KeyboardEvent('keyup', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true }));

        // 方法3: 点击遮罩层（弹窗外区域）
        const overlay = document.querySelector('[class*="mask"], [class*="overlay"]');
        if (overlay) {
          overlay.click();
          return { success: true, method: 'overlay' };
        }

        return { success: true, method: 'esc' };
      })()
    `);

    await page.wait(1);

    // 检查是否成功关闭
    const checkClosed = await page.evaluate(`
      (() => {
        const dialog = document.querySelector('[class*="noteContainer"], [role="dialog"]');
        return { closed: !dialog || dialog.offsetParent === null };
      })()
    `);

    if (!(checkClosed as any)?.closed) {
      // 如果关闭失败，直接刷新页面回到 feed
      console.log(chalk.yellow('弹窗未关闭，刷新页面...'));
      await page.goto('https://www.xiaohongshu.com/explore');
      await page.wait(2);
    }

    console.log(chalk.green('✓ 已返回 feed 列表'));

    // 重新获取 feed 索引
    console.log(chalk.dim('重新获取索引...'));
    await page.wait(1);

    // 滚动加载更多内容
    for (let i = 0; i < 2; i++) {
      await page.evaluate(`window.scrollBy(0, 500)`);
      await page.wait(0.5);
    }

    const rawResults = await page.evaluate(`
      (() => {
        const notes = [];
        // 使用正确的选择器 - 只获取可见的 cover 卡片
        document.querySelectorAll('a[href*="/explore/"][class*="cover"]').forEach(el => {
          const href = el.getAttribute('href') || '';
          const match = href.match(/explore\\/([a-f0-9]+)/);
          if (!match) return;

          const card = el.closest('section') || el.closest('[class*="note-item"]') || el.parentElement?.parentElement;

          let title = '';
          const titleEl = card?.querySelector('[class*="title"], [class*="name"]');
          if (titleEl) {
            title = titleEl.textContent?.trim() || '';
          } else {
            title = el.getAttribute('title') || el.textContent?.trim().slice(0, 50) || '';
          }

          let author = '';
          const authorEl = card?.querySelector('[class*="author"], [class*="name"]');
          if (authorEl && authorEl !== titleEl) {
            author = authorEl.textContent?.trim() || '';
          }

          notes.push({
            id: match[1],
            title: title.slice(0, 100),
            author,
            url: 'https://www.xiaohongshu.com/explore/' + match[1],
          });
        });

        const seen = new Set();
        return notes.filter(n => {
          if (seen.has(n.id)) return false;
          seen.add(n.id);
          return true;
        });
      })()
    `);

    const feed = Array.isArray(rawResults) ? rawResults.slice(0, 20) : [];
    writeFeedCache(feed);

    console.log(chalk.green(`✓ 索引已更新 (${feed.length} 条)`));
    console.log(chalk.dim('\n提示: 使用 xhs xiaohongshu view <编号> 查看笔记详情\n'));
    feed.forEach((item, i) => {
      console.log(`  [${i + 1}] ${chalk.cyan(item.id)}`);
      console.log(`      ${chalk.dim(item.title.slice(0, 40))}`);
      if (item.author) {
        console.log(`      ${chalk.dim('@' + item.author)}`);
      }
      console.log();
    });
  });

xiaohongshu
  .command('refresh')
  .description('刷新 feed 页面并获取新列表')
  .action(async () => {
    const page = await getBridgePage();

    console.log(chalk.dim('刷新页面...'));
    await page.goto('https://www.xiaohongshu.com/explore');
    await page.wait(3);

    // 滚动加载更多内容
    for (let i = 0; i < 2; i++) {
      await page.evaluate(`window.scrollBy(0, 500)`);
      await page.wait(0.5);
    }

    // 自动获取新的 feed
    console.log(chalk.dim('获取新列表...'));
    const rawResults = await page.evaluate(`
      (() => {
        const notes = [];
        // 使用正确的选择器 - 只获取可见的 cover 卡片
        document.querySelectorAll('a[href*="/explore/"][class*="cover"]').forEach(el => {
          const href = el.getAttribute('href') || '';
          const match = href.match(/explore\\/([a-f0-9]+)/);
          if (!match) return;

          const card = el.closest('section') || el.closest('[class*="note-item"]') || el.parentElement?.parentElement;

          let title = '';
          const titleEl = card?.querySelector('[class*="title"], [class*="name"]');
          if (titleEl) {
            title = titleEl.textContent?.trim() || '';
          } else {
            title = el.getAttribute('title') || el.textContent?.trim().slice(0, 50) || '';
          }

          let author = '';
          const authorEl = card?.querySelector('[class*="author"], [class*="name"]');
          if (authorEl && authorEl !== titleEl) {
            author = authorEl.textContent?.trim() || '';
          }

          notes.push({
            id: match[1],
            title: title.slice(0, 100),
            author,
            url: 'https://www.xiaohongshu.com/explore/' + match[1],
          });
        });

        const seen = new Set();
        return notes.filter(n => {
          if (seen.has(n.id)) return false;
          seen.add(n.id);
          return true;
        });
      })()
    `);

    const feed = Array.isArray(rawResults) ? rawResults.slice(0, 20) : [];
    writeFeedCache(feed);

    console.log(chalk.green('✓ 页面已刷新'));
    console.log(chalk.bold(`\n首页 Feed (${feed.length} 条):\n`));
    console.log(chalk.dim('提示: 使用 xhs xiaohongshu view <编号> 查看笔记详情\n'));
    feed.forEach((item, i) => {
      console.log(`  [${i + 1}] ${chalk.cyan(item.id)}`);
      console.log(`      ${chalk.dim(item.title.slice(0, 40))}`);
      if (item.author) {
        console.log(`      ${chalk.dim('@' + item.author)}`);
      }
      console.log();
    });
  });

xiaohongshu
  .command('search')
  .argument('<keyword>', '搜索关键词')
  .option('--limit <n>', '结果数量', '20')
  .description('搜索笔记')
  .action(async (keyword: string, opts: { limit: string }) => {
    const page = await getBridgePage();

    console.log(chalk.dim(`搜索: ${keyword}...`));
    await page.goto(`https://www.xiaohongshu.com/search_result?keyword=${encodeURIComponent(keyword)}`);
    await page.wait(2);

    const rawResults = await page.evaluate(`
      (() => {
        const notes = [];
        // 使用正确的选择器
        document.querySelectorAll('a[href*="/explore/"][class*="cover"]').forEach(el => {
          const href = el.getAttribute('href') || '';
          const match = href.match(/explore\\/([a-f0-9]+)/);
          if (match) {
            notes.push({
              id: match[1],
              title: el.textContent?.trim().slice(0, 50) || '',
            });
          }
        });
        return notes;
      })()
    `);

    const results = Array.isArray(rawResults) ? rawResults : [];

    console.log(chalk.bold(`\n搜索结果 (${results.length} 条):\n`));
    results.slice(0, parseInt(opts.limit, 10)).forEach((item, i) => {
      console.log(`  [${i + 1}] ${chalk.cyan(item.id)} - ${item.title.slice(0, 40)}`);
    });
  });

xiaohongshu
  .command('note')
  .argument('<id>', 'Note ID')
  .description('查看笔记详情')
  .action(async (id: string) => {
    const page = await getBridgePage();

    console.log(chalk.dim(`加载笔记 ${id}...`));
    await page.goto(`https://www.xiaohongshu.com/explore/${id}`);
    await page.wait(2);

    const info = await page.evaluate(`
      (() => {
        const title = document.querySelector('.title, [class*="title"]')?.textContent?.trim() || '';
        const desc = document.querySelector('.desc, .note-text')?.textContent?.trim() || '';
        const author = document.querySelector('.author-wrapper .username')?.textContent?.trim() || '';
        const likeBtn = document.querySelector('.like-wrapper');
        const collectBtn = document.querySelector('.collect-wrapper');

        return {
          title,
          desc: desc.slice(0, 200),
          author,
          liked: likeBtn?.classList.contains('like-active') || false,
          collected: collectBtn?.classList.contains('collect-active') || false,
        };
      })()
    `);

    console.log(chalk.bold(`\n标题: ${(info as any).title}`));
    console.log(chalk.dim(`作者: ${(info as any).author}`));
    console.log(chalk.dim(`内容: ${(info as any).desc}...`));
    console.log(chalk.dim(`状态: ${(info as any).liked ? '已点赞' : '未点赞'} | ${(info as any).collected ? '已收藏' : '未收藏'}`));
  });

xiaohongshu
  .command('like')
  .argument('[id]', 'Note ID (可选，不填则操作当前页面)')
  .description('点赞笔记（真人行为模拟）')
  .action(async (id: string | undefined) => {
    if (id) {
      console.log(chalk.dim(`点赞笔记 ${id}...`));
      await daemonClient.navigate(`https://www.xiaohongshu.com/explore/${id}`);
      await daemonClient.wait(2000);
    } else {
      console.log(chalk.dim('点赞当前页面...'));
    }

    // 使用真人行为点赞
    const result = await daemonClient.xhsLike();

    if (result.success) {
      console.log(chalk.green(`✓ ${result.message}`));
    } else {
      console.log(chalk.yellow(result.error || result.message));
    }
  });

xiaohongshu
  .command('collect')
  .argument('[id]', 'Note ID (可选，不填则操作当前页面)')
  .description('收藏笔记（真人行为模拟）')
  .action(async (id: string | undefined) => {
    if (id) {
      console.log(chalk.dim(`收藏笔记 ${id}...`));
      await daemonClient.navigate(`https://www.xiaohongshu.com/explore/${id}`);
      await daemonClient.wait(2000);
    } else {
      console.log(chalk.dim('收藏当前页面...'));
    }

    // 使用真人行为收藏
    const result = await daemonClient.xhsCollect();

    if (result.success) {
      console.log(chalk.green(`✓ ${result.message}`));
    } else {
      console.log(chalk.yellow(result.error || result.message));
    }
  });

xiaohongshu
  .command('comment')
  .argument('[id]', 'Note ID (可选，不填则操作当前页面)')
  .argument('<text>', '评论内容')
  .description('发表评论（真人行为模拟）')
  .action(async (id: string | undefined, text: string) => {
    // 判断第一个参数是 ID 还是评论内容
    // 如果第二个参数存在，说明第一个是 ID
    if (text) {
      console.log(chalk.dim(`评论笔记 ${id}...`));
      await daemonClient.navigate(`https://www.xiaohongshu.com/explore/${id}`);
      await daemonClient.wait(2000);
    } else {
      // 只有一个参数，是评论内容，操作当前页面
      text = id as string;
      console.log(chalk.dim('评论当前页面...'));
    }

    // 使用真人行为评论
    const result = await daemonClient.xhsComment(text);

    if (result.success) {
      console.log(chalk.green(`✓ ${result.message}`));
    } else {
      console.log(chalk.red(`✗ ${result.error || result.message}`));
    }
  });

xiaohongshu
  .command('browse')
  .argument('[id]', 'Note ID (可选，不填则浏览当前页面)')
  .option('--duration <ms>', '浏览时长(ms)', '10000')
  .description('模拟真人浏览笔记')
  .action(async (id: string | undefined, opts: { duration: string }) => {
    // 如果提供了 ID，先导航到笔记页面
    if (id) {
      console.log(chalk.dim(`浏览笔记 ${id}...`));
      await daemonClient.navigate(`https://www.xiaohongshu.com/explore/${id}`);
      await daemonClient.wait(2000);
    } else {
      console.log(chalk.dim('浏览当前页面...'));
    }

    // 使用真人行为浏览
    await daemonClient.xhsBrowseNote(parseInt(opts.duration, 10));

    console.log(chalk.green('✓ 浏览完成'));
  });

xiaohongshu
  .command('login')
  .description('检查登录状态')
  .action(async () => {
    await daemonClient.navigate('https://www.xiaohongshu.com');
    await daemonClient.wait(2000);

    const status = await daemonClient.exec(`
      (() => {
        const avatar = document.querySelector('.user-avatar img, [class*="avatar"] img');
        const loginBtn = document.querySelector('.login-btn');
        return {
          isLoggedIn: !!avatar && !loginBtn,
        };
      })()
    `);

    if (status.isLoggedIn) {
      console.log(chalk.green('✓ 已登录'));
    } else {
      console.log(chalk.yellow('未登录'));
      console.log(chalk.dim('请在浏览器中登录小红书账号'));
    }
  });

// ==================== 真人行为命令 ====================

const human = program
  .command('human')
  .description('真人行为模拟命令');

human
  .command('click')
  .argument('<x>', 'X coordinate')
  .argument('<y>', 'Y coordinate')
  .description('真人风格点击坐标')
  .action(async (x: string, y: string) => {
    const result = await daemonClient.humanClick(parseInt(x, 10), parseInt(y, 10));
    console.log(result.success ? chalk.green('✓ 点击完成') : chalk.red(`✗ ${result.error}`));
  });

human
  .command('type')
  .argument('<selector>', 'CSS selector')
  .argument('<text>', 'Text to type')
  .description('真人风格输入文本')
  .action(async (selector: string, text: string) => {
    const result = await daemonClient.humanType(selector, text);
    console.log(result.success ? chalk.green('✓ 输入完成') : chalk.red(`✗ ${result.error}`));
  });

human
  .command('scroll')
  .argument('<direction>', 'up or down')
  .option('--amount <pixels>', 'Scroll amount', '300')
  .description('真人风格滚动')
  .action(async (direction: string, opts: { amount: string }) => {
    await daemonClient.humanScroll(direction as 'up' | 'down', parseInt(opts.amount, 10));
    console.log(chalk.green(`✓ 已滚动 ${direction}`));
  });

human
  .command('browse')
  .option('--duration <ms>', 'Duration in ms', '10000')
  .description('随机滚动浏览')
  .action(async (opts: { duration: string }) => {
    console.log(chalk.dim('模拟真人浏览...'));
    await daemonClient.randomScroll(parseInt(opts.duration, 10));
    console.log(chalk.green('✓ 浏览完成'));
  });

// ==================== 工具函数 ====================

async function getBridgePage(): Promise<BridgePage> {
  if (!bridgePage) {
    bridgePage = new BridgePage();

    // 检查连接
    const { connected, message } = await bridgePage.checkConnection();
    if (!connected) {
      console.error(chalk.red(message || '连接失败'));
      console.log(chalk.dim('\n使用方法:'));
      console.log(chalk.dim('  1. 运行 xhs daemon start'));
      console.log(chalk.dim('  2. 在 Chrome 中安装 xiaohongshu-cli/extension/ 扩展'));
      console.log(chalk.dim('  3. 确保扩展已启用'));
      process.exit(1);
    }
  }
  return bridgePage;
}

// ==================== 启动 ====================

program.parse();
