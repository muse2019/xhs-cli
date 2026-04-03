# 小红书 CLI (XHS CLI)

**复用已登录的 Chrome，无需重新登录！**

类似 opencli 的架构：Chrome Extension + Daemon + CLI，直接操作你已经登录的浏览器。

## 特性

- ✅ **复用已登录 Chrome** - 无需重新登录
- ✅ **真人行为模拟** - 贝塞尔曲线鼠标轨迹、随机延迟、打字模拟
- ✅ **反检测** - 基础反检测注入

## 架构

```
┌─────────────┐     HTTP      ┌─────────────┐     消息     ┌─────────────┐
│   CLI (xhs) │ ────────────> │   Daemon    │ <──────────> │  Extension  │
└─────────────┘               └─────────────┘               └─────────────┘
                                                              │
                                                              ▼
                                                        ┌─────────────┐
                                                        │   Chrome    │
                                                        │ (已登录)    │
                                                        └─────────────┘
```

## 快速开始

### 1. 安装

```bash
cd xiaohongshu-cli
npm install
npm run build
npm link
```

### 2. 安装 Chrome 扩展

1. 打开 Chrome，访问 `chrome://extensions/`
2. 开启右上角的 **开发者模式**
3. 点击 **加载已解压的扩展程序**
4. 选择 `xiaohongshu-cli/extension/` 目录

### 3. 启动 Daemon

```bash
xhs daemon start
```

### 4. 开始使用

**确保你已经在 Chrome 中登录了小红书！**

```bash
# 检查连接状态
xhs daemon status

# 检查登录状态
xhs xiaohongshu login

# 搜索
xhs xiaohongshu search "美食推荐"

# 点赞（真人行为模拟）
xhs xiaohongshu like 69a8423f000000002202cdee

# 收藏（真人行为模拟）
xhs xiaohongshu collect 69a8423f000000002202cdee

# 评论（真人行为模拟）
xhs xiaohongshu comment 69a8423f000000002202cdee "太棒了！"

# 浏览笔记（真人行为模拟）
xhs xiaohongshu browse 69a8423f000000002202cdee --duration 15000
```

---

## 命令列表

### Daemon 管理

| 命令 | 说明 |
|------|------|
| `xhs daemon start` | 启动 Daemon |
| `xhs daemon status` | 检查状态 |
| `xhs daemon stop` | 停止 Daemon |

### 浏览器操作

| 命令 | 说明 |
|------|------|
| `xhs operate open <url>` | 打开网页 |
| `xhs operate state` | 获取页面元素 |
| `xhs operate click <ref>` | 点击元素 |
| `xhs operate type <ref> <text>` | 输入文本 |
| `xhs operate scroll <dir>` | 滚动页面 |
| `xhs operate screenshot [path]` | 截图 |
| `xhs operate eval <code>` | 执行 JS |
| `xhs operate cookies` | 获取 Cookie |
| `xhs operate tabs` | 标签页列表 |

### 真人行为模拟

| 命令 | 说明 |
|------|------|
| `xhs human click <x> <y>` | 真人风格点击坐标 |
| `xhs human type <selector> <text>` | 真人风格输入 |
| `xhs human scroll <dir>` | 真人风格滚动 |
| `xhs human browse` | 随机滚动浏览 |

### 小红书专用（内置真人行为）

| 命令 | 说明 |
|------|------|
| `xhs xiaohongshu login` | 检查登录状态 |
| `xhs xiaohongshu search <keyword>` | 搜索笔记 |
| `xhs xiaohongshu note <id>` | 查看笔记详情 |
| `xhs xiaohongshu like <id>` | 点赞（真人行为） |
| `xhs xiaohongshu collect <id>` | 收藏（真人行为） |
| `xhs xiaohongshu comment <id> <text>` | 评论（真人行为） |
| `xhs xiaohongshu browse <id>` | 浏览笔记（真人行为） |

---

## 真人行为模拟

### 实现位置

真人行为模拟在 **Chrome Extension 端**（`extension/content.js`）实现：

```
extension/
├── manifest.json     # 扩展配置
├── background.js     # Service Worker
└── content.js        # 真人行为模拟 ⭐
```

### 功能列表

| 功能 | 说明 |
|------|------|
| **鼠标轨迹** | 贝塞尔曲线 + 随机抖动 |
| **点击模拟** | mousedown → mouseup → click 事件序列 |
| **打字模拟** | keydown → keypress → input → keyup + 随机延迟 |
| **滚动模拟** | 分段滚动 + 随机速度 |
| **思考时间** | 随机延迟模拟人类思考 |
| **阅读时间** | 根据文字长度计算阅读时间 |

### 鼠标轨迹算法

```javascript
// 贝塞尔曲线生成真人鼠标轨迹
function generateBezierPoints(start, end, steps) {
  // 随机生成两个控制点
  const cp1 = { x: start.x + random(), y: start.y + random() };
  const cp2 = { x: start.x + random(), y: start.y + random() };

  // 三次贝塞尔曲线
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const point = cubicBezier(t, start, cp1, cp2, end);
    // 添加随机抖动
    point.x += random(-2, 2);
    point.y += random(-2, 2);
  }
}
```

### 打字模拟

```javascript
// 真人打字 - 每个字符都有随机延迟
async function humanType(element, text) {
  for (const char of text) {
    element.dispatchEvent(new KeyboardEvent('keydown', { key: char }));
    element.dispatchEvent(new KeyboardEvent('keypress', { key: char }));
    element.value += char;
    element.dispatchEvent(new Event('input'));
    element.dispatchEvent(new KeyboardEvent('keyup', { key: char }));

    // 随机延迟 50-150ms
    await sleep(50 + Math.random() * 100);

    // 5% 概率停顿更久（模拟思考）
    if (Math.random() < 0.05) {
      await sleep(200 + Math.random() * 300);
    }
  }
}
```

---

## 与 opencli 对比

| 特性 | opencli | xhs-cli |
|------|---------|---------|
| 复用已登录 Chrome | ✅ | ✅ |
| 无需重新登录 | ✅ | ✅ |
| 真人行为模拟 | ❌ | ✅ |
| 鼠标轨迹 | ❌ | ✅ 贝塞尔曲线 |
| 随机延迟 | ❌ | ✅ |
| 打字模拟 | ❌ | ✅ |
| 反检测 | ✅ 13层 | ✅ 基础 |

---

## 常见问题

### Extension 未连接

```
✗ Extension not connected
```

**解决方案：**
1. 确保已安装扩展（`chrome://extensions/`）
2. 确保扩展已启用
3. 刷新 Chrome 页面
4. 重启 Daemon

### 未登录

```
未登录
```

**解决方案：**
在 Chrome 中手动登录小红书，CLI 会自动使用已登录状态。

### 找不到元素

```
Element not found
```

**解决方案：**
先运行 `xhs operate state` 获取元素列表，再使用 ref 点击。

---

## 项目结构

```
xiaohongshu-cli/
├── extension/                    # Chrome 扩展
│   ├── manifest.json            # 扩展配置
│   ├── background.js            # Service Worker
│   └── content.js               # 真人行为模拟
├── src/
│   ├── daemon/                   # Daemon 服务
│   │   ├── index.ts             # HTTP 服务器
│   │   └── client.ts            # 客户端库
│   ├── browser/
│   │   └── bridge-page.ts       # 通过 Daemon 操作浏览器
│   └── index.ts                 # CLI 入口
└── package.json
```

## License

MIT
