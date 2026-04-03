# 小红书 CLI (XHS CLI)

**复用已登录的 Chrome，无需重新登录！**

类似 opencli 的架构：Chrome Extension + Daemon + CLI，直接操作你已经登录的浏览器。

## 特性

- ✅ **复用已登录 Chrome** - 无需重新登录
- ✅ **真人行为模拟** - 贝塞尔曲线鼠标轨迹、随机延迟、打字模拟、失误纠正
- ✅ **反检测** - 23 层保护，包括 WebRTC、Font、Canvas、Audio 指纹保护
- ✅ **Touch 事件支持** - 支持移动端/响应式网站
- ✅ **行为噪声** - 自适应延迟、随机微操作，防止机器学习检测

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

### 配置管理

| 命令 | 说明 |
|------|------|
| `xhs config cdp on` | 启用 CDP 模式（isTrusted=true 事件） |
| `xhs config cdp off` | 禁用 CDP 模式（默认） |
| `xhs config show` | 显示当前配置 |

> **注意**: CDP 模式会生成可信事件 (`isTrusted=true`)，但浏览器顶部会显示调试警告条。

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

## 反检测保护

### 23 层保护机制

| 层级 | 功能 |
|------|------|
| 1-14 | 基础保护（webdriver 伪装、CDP 痕迹清理等） |
| 15 | Canvas 指纹噪声 |
| 16 | Audio 指纹噪声 |
| 17 | DevTools 检测防护 |
| 18 | 时间戳指纹随机化 |
| 19 | WebRTC IP 泄露保护 |
| 20 | Font 指纹保护 |
| 21 | 屏幕信息伪装 |
| 22 | 硬件信息伪装 |
| 23 | Touch 支持伪装 |

### 指纹保护

| 类型 | 说明 |
|------|------|
| **Canvas** | getImageData 添加微弱噪声 |
| **Audio** | getFloatFrequencyData 随机化 |
| **WebGL** | 统一显卡指纹 |
| **Font** | 随机化字体测量结果 |
| **Screen** | 伪装常见分辨率 |
| **Hardware** | CPU 核心数、内存、电池状态 |

---

## 真人行为模拟

### 实现位置

真人行为模拟在 **Chrome Extension 端**实现：

```
extension/
├── manifest.json     # 扩展配置
├── background.js     # Service Worker
├── stealth.js        # 反检测脚本
└── content.js        # 真人行为模拟 ⭐
```

### 功能列表

| 功能 | 说明 |
|------|------|
| **鼠标轨迹** | 贝塞尔曲线 + 随机抖动 + 失误纠正 |
| **点击模拟** | PointerEvent + TouchEvent 完整事件序列 |
| **打字模拟** | keydown → keypress → input → keyup + 随机延迟 + 打错字模拟 |
| **滚动模拟** | 分段滚动 + 随机速度 + 偶尔回头 |
| **思考时间** | 随机延迟模拟人类思考 |
| **阅读时间** | 根据文字长度计算阅读时间 |
| **行为噪声** | 自适应延迟、随机微操作 |

### 行为噪声

为防止机器学习检测操作模式，实现了以下噪声机制：

- **自适应延迟**: 操作太频繁时自动增加延迟
- **随机微操作**: 5% 概率在操作间插入无意义动作
- **频率控制**: 每分钟操作超过 30 次时自动降速

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
| Touch 事件 | ❌ | ✅ |
| 反检测 | ✅ 13层 | ✅ 23层 |
| WebRTC 保护 | ❌ | ✅ |
| Font 指纹保护 | ❌ | ✅ |
| 行为噪声 | ❌ | ✅ |

---

## 常见问题

### Extension 未连接

```
✗ Extension not connected
```

**解决方案：**
1. 确保已安装扩展（`chrome://extensions/`）
2. 确保扩展已启用
3. 点击扩展页面的**刷新按钮**重新加载扩展
4. 运行 `xhs daemon status` 检查连接

### Service Worker 休眠

Chrome MV3 的 Service Worker 会在空闲时休眠，扩展已实现自动重连机制。如果遇到连接断开：

1. 刷新扩展页面
2. 或执行任意命令触发唤醒

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
│   ├── stealth.js               # 反检测脚本
│   └── content.js               # 真人行为模拟
├── src/
│   ├── daemon/                   # Daemon 服务
│   │   ├── index.ts             # HTTP 服务器
│   │   └── client.ts            # 客户端库
│   ├── browser/
│   │   └── bridge-page.ts       # 通过 Daemon 操作浏览器
│   ├── stealth/                  # 反检测模块
│   └── index.ts                 # CLI 入口
└── package.json
```

## License

MIT
