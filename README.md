# 小红书 CLI (XHS CLI)

**复用已登录的 Chrome，无需重新登录！**

基于 Chrome Extension + Daemon + CLI 架构，直接操作你已经登录的浏览器，配合 56 层反检测保护和真人行为模拟，安全稳定。

## ✨ 特性

- 🔄 **复用已登录 Chrome** - 无需重新登录，直接使用已登录的浏览器
- 🖱️ **真人行为模拟** - 贝塞尔曲线鼠标轨迹、高斯分布延迟、打字模拟、失误纠正
- 🛡️ **56 层反检测** - WebRTC、Font、Canvas、Audio、WebGL 指纹保护
- 📱 **Touch 事件支持** - 支持移动端/响应式网站
- 🔐 **隐蔽状态存储** - WeakMap + Symbol，避免全局变量被检测
- ⚡ **行为噪声** - 自适应延迟、随机微操作，防止机器学习检测
- 🎯 **事件完整性** - movementX/Y、sourceCapabilities、InputDeviceCapabilities

## 📐 架构

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

## 🚀 快速开始

### 1. 安装

```bash
git clone https://github.com/muse2019/xhs-cli.git
cd xhs-cli
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

# 获取首页 Feed
xhs xiaohongshu feed --limit 20

# 查看笔记详情
xhs xiaohongshu view 1

# 点赞（真人行为模拟）
xhs xiaohongshu like

# 收藏（真人行为模拟）
xhs xiaohongshu collect

# 评论（真人行为模拟）
xhs xiaohongshu comment "太棒了！"

# 浏览笔记（真人行为模拟）
xhs xiaohongshu browse --duration 15000
```

---

## 📖 命令列表

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
| `xhs xiaohongshu feed` | 获取首页 Feed |
| `xhs xiaohongshu view <num>` | 查看指定编号笔记 |
| `xhs xiaohongshu search <keyword>` | 搜索笔记 |
| `xhs xiaohongshu note <id>` | 查看笔记详情 |
| `xhs xiaohongshu like [id]` | 点赞（真人行为） |
| `xhs xiaohongshu collect [id]` | 收藏（真人行为） |
| `xhs xiaohongshu comment [id] <text>` | 评论（真人行为） |
| `xhs xiaohongshu browse [id]` | 浏览笔记（真人行为） |
| `xhs xiaohongshu back` | 返回列表 |
| `xhs xiaohongshu refresh` | 刷新页面 |

---

## 🛡️ 反检测保护

### 56 层防护机制

| 分类 | 功能 |
|------|------|
| **基础伪装** | navigator.webdriver、window.chrome、navigator.plugins、languages |
| **痕迹清理** | CDP 堆栈清理、debugger 过滤、console 方法伪装 |
| **指纹保护** | Canvas、Audio、WebGL、Font、Screen、Hardware |
| **网络保护** | WebRTC IP 保护、User-Agent Client Hints、Fetch 伪装 |
| **API 伪装** | Touch、Battery、SpeechSynthesis、Gamepad、USB、Bluetooth、Serial |
| **事件伪装** | InputDeviceCapabilities、sourceCapabilities、movementX/Y、Event.timeStamp |
| **高级防护** | Math.random 增强、错误堆栈清理、CSS 指纹噪声、PerformanceTiming |

### 指纹保护详情

| 类型 | 说明 |
|------|------|
| **Canvas** | getImageData 添加微弱噪声 |
| **Audio** | getFloatFrequencyData 随机化 |
| **WebGL** | GPU 指纹池化（Intel/NVIDIA/AMD） |
| **Font** | 随机化字体测量结果 |
| **Screen** | 多种常见分辨率伪装 |
| **Hardware** | CPU 核心数、内存、电池状态伪装 |

---

## 🖱️ 真人行为模拟

### 实现位置

真人行为模拟在 **Chrome Extension 端**实现：

```
extension/
├── manifest.json     # 扩展配置
├── background.js     # Service Worker
├── stealth.js        # 反检测脚本 (56 层)
└── content.js        # 真人行为模拟
```

### 功能列表

| 功能 | 说明 |
|------|------|
| **鼠标轨迹** | 贝塞尔曲线 + 随机抖动 + 失误纠正 + 高频微颤 |
| **点击模拟** | PointerEvent + TouchEvent 完整事件序列 |
| **打字模拟** | keydown → keypress → input → keyup + 随机延迟 + 打错字模拟 |
| **滚动模拟** | 分段滚动 + 随机速度 + 偶尔回头 |
| **思考时间** | 高斯分布延迟模拟人类思考 |
| **阅读时间** | 根据文字长度计算阅读时间 |
| **行为噪声** | 自适应延迟、随机微操作、动态阈值 |

### 行为噪声机制

为防止机器学习检测操作模式，实现了以下噪声机制：

- **自适应延迟**: 操作太频繁时自动增加延迟
- **随机微操作**: 5% 概率在操作间插入无意义动作
- **频率控制**: 每分钟操作超过阈值时自动降速
- **疲劳模拟**: 长时间操作后速度变慢
- **动态参数**: 噪声参数每 30-90 秒自动更新

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
    // 添加随机抖动 + 高频微颤
    point.x += random(-2, 2) + Math.sin(i * 0.8) * random(0.5, 2);
    point.y += random(-2, 2) + Math.cos(i * 0.6) * random(0.5, 2);
  }
}
```

### 隐蔽状态存储

使用 WeakMap + Symbol 实现隐蔽的状态存储，避免全局变量被检测：

```javascript
const _stateKey = Symbol.for('_xhs_' + Math.random().toString(36).slice(2, 10));
const _stateStore = new WeakMap();

function getState() {
  if (!_stateStore.has(window)) {
    _stateStore.set(window, { /* 状态 */ });
  }
  return _stateStore.get(window);
}
```

---

## ❓ 常见问题

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

## 📁 项目结构

```
xiaohongshu-cli/
├── extension/                    # Chrome 扩展
│   ├── manifest.json            # 扩展配置
│   ├── background.js            # Service Worker
│   ├── stealth.js               # 反检测脚本 (56 层)
│   └── content.js               # 真人行为模拟
├── src/
│   ├── daemon/                   # Daemon 服务
│   │   ├── index.ts             # HTTP 服务器
│   │   └── client.ts            # 客户端库
│   ├── browser/
│   │   ├── page.ts              # Playwright 页面封装
│   │   └── bridge-page.ts       # 通过 Daemon 操作浏览器
│   ├── stealth/                  # 反检测模块
│   │   ├── stealth-script.ts    # 反检测脚本生成
│   │   ├── human-behavior.ts    # 真人行为模拟
│   │   ├── mouse-trajectory.ts  # 鼠标轨迹算法
│   │   └── random-delay.ts      # 随机延迟 + 冷却器
│   ├── adapters/
│   │   └── xiaohongshu.ts       # 小红书专用功能
│   └── index.ts                 # CLI 入口
├── dist/                         # 编译输出
└── package.json
```

## 📊 代码统计

| 模块 | 行数 | 大小 |
|------|------|------|
| stealth.js (反检测) | 1,450 行 | 46 KB |
| content.js (行为模拟) | 1,352 行 | 37 KB |
| TypeScript 核心模块 | 1,591 行 | - |
| **总计** | **~4,400 行** | **~83 KB** |

## 📄 License

MIT

---

<p align="center">
  <b>⭐ 如果这个项目对你有帮助，请给一个 Star！</b>
</p>
