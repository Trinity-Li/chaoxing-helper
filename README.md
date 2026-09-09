# 视频防自动暂停 · Video No-Autopause

一个零依赖的 Chromium 扩展：拦截 `mouseout` / `mouseleave` / `pointerout` / `pointerleave` 侦听器的注册，
让网页播放器**不再因为鼠标移出画面而自动暂停**，而点击、拖拽、滚轮、悬停等操作全部照常可用。

[中文](#中文) · [English](#english)

---

## 中文

### 它解决什么问题

很多网页播放器（在线课程、部分流媒体网站）会在鼠标移出视频区域时自动暂停。
接个电话、把鼠标挪到第二块屏幕、切去回个消息，视频就停了 —— 对多屏用户和想边听边干活的人来说非常烦。

本扩展在网页脚本运行之前接管事件注册，让「鼠标离开某块区域」这件事**根本无法被网页感知**。

### 特性

| 项目 | 说明 |
| --- | --- |
| 拦截的事件 | `mouseout` `mouseleave` `pointerout` `pointerleave` |
| 放行的事件 | `click` `dblclick` `mousedown` `mouseup` `mousemove` `mouseover` `wheel` `contextmenu` `drag*` … 全部正常 |
| 覆盖的注册方式 | `addEventListener()`、`onmouseout = fn`、内联 `<div onmouseout="...">` 三种 |
| 注入时机 | `run_at: document_start` + `world: MAIN`，早于网页自己的第一行脚本 |
| 开关 | `Alt + M` 或点击工具栏图标；图标角标 **ON** / **OFF**，按标签页独立 |
| 其它 | 无网络请求、无数据收集、无第三方依赖、核心逻辑单文件 |

### 安装

```bash
git clone https://github.com/Trinity-Li/chaoxing-helper.git
```

1. 打开 `chrome://extensions`（Edge 用 `edge://extensions`）
2. 打开右上角「开发者模式」
3. 点「加载已解压的扩展程序」→ 选择仓库目录
4. 刷新任意网页

> 需要 Chromium 内核 119+（Chrome / Edge / Brave / Opera）。
> 改完代码后，在扩展页点一下该扩展的「刷新」按钮，再刷新网页。

### 使用

- 装好后对所有网站默认生效，工具栏图标角标显示 **ON**
- `Alt + M` 或点击图标：切换当前标签页的开关（整个页面含 iframe 一起切换），角标变 **OFF**
- 控制台可查看状态：

  ```js
  __MOUSE_LISTENER_KILLER__   // { active, blockedCount, blockedTypes, pause(), resume(), toggle() }
  ```

### 如果播放器仍然自动暂停

不同播放器判断「鼠标离开」的方式不同。编辑 `content.js` 顶部的 `CONFIG.events`，按需追加：

| 追加类型 | 适用情况 | 副作用 |
| --- | --- | --- |
| `'mouseover'` `'mouseenter'` `'pointerover'` `'pointerenter'` | 播放器用「鼠标进入了别的元素」反推你离开了视频 | 悬停弹出控制条可能失效 |
| `'mousemove'` `'pointermove'` | 播放器用鼠标坐标计算是否还在视频框内 | 控制条可能不再出现 |

改完在 `chrome://extensions` 点扩展的「刷新」按钮，再刷新网页。

### 已知限制

- 只处理鼠标事件：`blur`、`visibilitychange`、`pagehide` 等非鼠标信号不受影响
- 其它浏览器扩展在隔离世界（isolated world）注册的侦听器不经过本扩展
- 仅限 Chromium 内核（Firefox 不支持 `world: "MAIN"`）
- 少数网站「鼠标移出就关闭」的悬浮菜单可能一直保持展开，按 `Alt + M` 临时放行即可

### 文件结构

```
.
├── manifest.json     扩展配置（MV3）
├── content.js        核心：注入页面主世界，拦截侦听器注册（要改拦截范围就改这里）
├── bridge.js         页面主世界 ↔ 扩展后台的桥接（角标状态回传）
├── background.js     图标角标 ON/OFF、点击图标切换开关
└── icons/            图标（16/32/48/128）
```

### 工作原理

1. 以 `world: "MAIN"` 注入页面主世界，此时网页自己的脚本尚未执行
2. 保存原生的 `addEventListener` / `removeEventListener` / `Function.prototype.toString` 引用
3. 替换 `EventTarget.prototype.addEventListener`：命中拦截列表的注册直接丢弃
4. 把 `window`、`document` 及各原型上的 `onmouseout` 等访问器改成空 setter
5. `MutationObserver` 监听 DOM，抹掉内联的 `onmouseout="..."` 属性（解析器插入的元素也能覆盖）
6. 打过补丁的函数用 `Function.prototype.toString` 伪装成 `[native code]`，降低被网页检测的概率

### 隐私

不联网、不上报、不读取页面内容。唯一写入浏览器本地的数据是工具栏图标的角标状态。

### 使用须知

- 本扩展只改变浏览器的事件注册行为，**不绕过任何非鼠标检测**：
  切屏检测（`visibilitychange` / `blur`）、播放进度上报、防拖拽、弹题等一概不受影响。
- 请遵守你所用网站的服务条款，因使用本扩展产生的后果由使用者自行承担。

### 许可

[MIT](LICENSE)

---

## English

A dependency-free Chromium extension that blocks `mouseout` / `mouseleave` / `pointerout` / `pointerleave`
listeners from ever being registered, so web video players **stop auto-pausing when the cursor leaves
the video area** — while clicks, drags, scrolling and hover keep working normally.

- **Blocked:** `mouseout` `mouseleave` `pointerout` `pointerleave`
- **Untouched:** `click` `dblclick` `mousedown` `mouseup` `mousemove` `mouseover` `wheel` `contextmenu` `drag*` …
- Injects at `document_start` in `world: "MAIN"`, i.e. before any page script runs
- Covers `addEventListener`, `onmouseout = fn` and inline `onmouseout="..."`
- Toggle per tab with `Alt + M` or by clicking the toolbar icon; the badge shows **ON** / **OFF**
- No network requests, no telemetry, no third-party dependencies

**Install:** clone the repo, open `chrome://extensions`, enable *Developer mode*, click *Load unpacked*
and pick the repo folder. Requires Chromium 119+.

**Note:** only mouse event registration is affected. Non-mouse signals such as `blur`,
`visibilitychange` or `pagehide`, as well as progress reporting, anti-seek logic and in-video quizzes,
are untouched. Please follow the terms of service of the sites you use.

Licensed under the [MIT License](LICENSE).
