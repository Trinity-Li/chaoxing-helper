/* =============================================================================
 *  视频防自动暂停 / 鼠标事件侦听器拦截器 (Mouse Listener Killer) v1.1
 * -----------------------------------------------------------------------------
 *  做什么：
 *    在网页自己的脚本运行之前接管三件事，让“鼠标离开某块区域”这一类事件侦听器
 *    无法被注册，于是视频播放器再也收不到“鼠标移出画面”的信号，也就不会自动暂停。
 *
 *      1. EventTarget.prototype.addEventListener  —— 丢弃 mouseout/mouseleave/…
 *      2. onmouseout = fn 这类属性赋值            —— 赋值被忽略
 *      3. <div onmouseout="..."> 内联属性         —— 由 MutationObserver 抹掉
 *
 *    点击、拖拽、滚轮、右键、悬停全部正常，播放器控制条也能正常弹出。
 *
 *  为什么能抢在网页前面：
 *    manifest.json 中 world:"MAIN" + run_at:"document_start"，
 *    注入时机早于网页自己的任何一行脚本，网页没有机会先注册再被我们看见。
 *
 *  临时放行：
 *    Alt+M —— 暂停 / 恢复本页拦截（同一页面的子 iframe 一起切换）
 *  查看状态：
 *    F12 控制台输入  __MOUSE_LISTENER_KILLER__
 * ========================================================================== */

(() => {
  'use strict';

  /* ======================= 配置区（要改就改这里） ======================= */
  const CONFIG = {
    // false = 本工具完全不生效
    enabled: true,

    // 被拦截的事件类型（大小写不敏感）。不想要哪个删掉哪一行即可。
    // 默认只拦「鼠标离开某块区域」这一族 —— 视频“鼠标移出画面就自动暂停”全靠它们。
    // 点击 / 按下 / 抬起 / 移动 / 滚轮 / 右键 / 拖拽 一律放行。
    events: [
      'mouseout', 'mouseleave',
      'pointerout', 'pointerleave'
    ],

    // 如果视频还是会暂停，按顺序把下面这些也加进 events（越往下副作用越大）：
    //   'mouseover', 'mouseenter', 'pointerover', 'pointerenter'   // 悬停弹出控制条可能失效
    //   'mousemove', 'pointermove'                                  // 控制条可能不再出现
    //   'mousedown', 'mouseup', 'click', 'dblclick', 'auxclick'      // 连点击也会失效
    // 需要“把鼠标相关事件全部关掉”的极端模式，就整段替换成：
    //   ['mousedown','mouseup','mousemove','mouseover','mouseout','mouseenter','mouseleave',
    //    'mousewheel','wheel','click','dblclick','auxclick','contextmenu','pointerdown',
    //    'pointerup','pointermove','pointerover','pointerout','pointerenter','pointerleave',
    //    'drag','dragstart','dragend','dragenter','dragleave','dragover','drop','selectstart']

    // 抹掉 <div onmouseover="..."> 这种内联属性
    blockInlineHandlers: true,

    // Alt + M 暂停 / 恢复（关掉可让 Event Listeners 面板里连 keydown 都没有）
    hotkey: true,
    hotkeyCode: 'KeyM',

    // 让 Alt+M 在子 iframe 里也同步生效
    frameSync: true,

    // 把打过补丁的函数伪装成原生函数，降低被网页脚本检测到的概率
    disguise: true,

    // 控制台打印一条启动日志
    verbose: true
  };

  if (!CONFIG.enabled) return;

  const EVENT_TYPES = CONFIG.events.map((t) => String(t).toLowerCase());
  const BLOCKED = new Set(EVENT_TYPES);
  const ON_PROPS = EVENT_TYPES.map((t) => 'on' + t);          // onmousedown / onDOMMouseScroll
  const ON_ATTRS = new Set(ON_PROPS.map((p) => p.toLowerCase()));

  /* ==================== 保存原生引用（此刻尚未被污染） ==================== */
  const NativeAdd = EventTarget.prototype.addEventListener;
  const NativeRemove = EventTarget.prototype.removeEventListener;
  const NativeToString = Function.prototype.toString;
  const NativeObserver = window.MutationObserver;

  const state = {
    active: true,   // true = 正在拦截
    blocked: 0,     // 已拦截次数
    paused: []      // 暂停期间放行的监听器，恢复时一并清掉
  };

  /* ========================= 伪装成原生函数 ========================= */
  const spoofed = new WeakSet();

  function fakeNative(fn, name, length) {
    try { Object.defineProperty(fn, 'name', { value: name, configurable: true }); } catch (_) {}
    try { Object.defineProperty(fn, 'length', { value: length, configurable: true }); } catch (_) {}
    spoofed.add(fn);
    return fn;
  }

  function patchMethod(target, key, fn) {
    const desc = Object.getOwnPropertyDescriptor(target, key);
    Object.defineProperty(target, key, Object.assign({}, desc, { value: fn }));
  }

  function installToStringSpoof() {
    // 用方法简写定义，避免多出 prototype 属性（原生内建函数没有）
    const patched = fakeNative(({ toString() {
      if (spoofed.has(this)) return 'function ' + this.name + '() { [native code] }';
      return NativeToString.call(this);
    } }).toString, 'toString', 0);
    patchMethod(Function.prototype, 'toString', patched);
  }

  /* ==================== 1. 拦截 addEventListener ==================== */
  const patchedAddEventListener = fakeNative(({
    addEventListener(type, listener, options) {
      if (state.active && BLOCKED.has(String(type).toLowerCase())) {
        state.blocked++;
        return undefined;               // 静默丢弃，事件侦听器不会挂上去
      }
      if (!state.active && state.paused.length < 20000) {
        state.paused.push([this, type, listener, options]);
      }
      return NativeAdd.call(this, type, listener, options);
    }
  }).addEventListener, 'addEventListener', 2);

  patchMethod(EventTarget.prototype, 'addEventListener', patchedAddEventListener);

  /* ============== 2. 拦截 onmousedown = fn 这类属性赋值 ============== */
  function blockOne(target, prop) {
    let desc;
    try { desc = Object.getOwnPropertyDescriptor(target, prop); } catch (_) { return; }
    if (desc && desc.configurable === false) return;
    try {
      Object.defineProperty(target, prop, {
        configurable: true,
        enumerable: desc ? !!desc.enumerable : true,
        get() { return null; },
        set() { state.blocked++; }
      });
    } catch (_) { /* 个别环境不允许改写，忽略 */ }
  }

  function blockHandlerProperties() {
    // 注意：window 自身也带一层 onXxx 属性，会遮蔽 Window.prototype 上的同名访问器，
    // 所以除了原型，还要单独处理 window / document 这两个对象本身。
    const targets = [window, document];
    for (const Ctor of [window.HTMLElement, window.SVGElement, window.Document, window.Window]) {
      if (Ctor && Ctor.prototype) targets.push(Ctor.prototype);
    }
    for (const target of targets) {
      for (const prop of ON_PROPS) blockOne(target, prop);
    }
  }

  /* ================ 3. 抹掉内联 onmouseover="..." 属性 ================ */
  function stripElement(el) {
    if (!el || el.nodeType !== 1 || !el.attributes) return;
    for (let i = el.attributes.length - 1; i >= 0; i--) {
      const name = el.attributes[i].name;
      if (ON_ATTRS.has(name.toLowerCase())) {
        el.removeAttribute(name);
        state.blocked++;
      }
    }
  }

  function stripTree(root) {
    if (!root) return;
    if (root.nodeType === 1) stripElement(root);
    if (root.querySelectorAll) {
      const all = root.querySelectorAll('*');
      for (let i = 0; i < all.length; i++) stripElement(all[i]);
    }
  }

  function startInlineHandlerCleanup() {
    // 解析器插入元素时也会产生 childList 记录，因此初次加载的 HTML 也能覆盖
    try {
      const observer = new NativeObserver((records) => {
        if (!state.active) return;
        for (const r of records) {
          if (r.type === 'attributes') {
            if (r.target.hasAttribute(r.attributeName)) {
              r.target.removeAttribute(r.attributeName);
              state.blocked++;
            }
          } else {
            for (let i = 0; i < r.addedNodes.length; i++) stripTree(r.addedNodes[i]);
          }
        }
      });
      observer.observe(document, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: [...ON_ATTRS]
      });
    } catch (_) {}
  }

  /* ========================= 暂停 / 恢复 ========================= */
  function log(msg) {
    if (!CONFIG.verbose) return;
    try {
      console.log('%c[鼠标侦听器拦截器] ' + msg, 'color:#22a06b;font-weight:bold');
    } catch (_) {}
  }

  function pause() {
    if (!state.active) return;
    state.active = false;
    log('已暂停拦截：本页鼠标事件恢复原样（再按 Alt+M 恢复）');
    notifyBadge();
  }

  function resume() {
    if (state.active) return;
    state.active = true;
    const pending = state.paused.splice(0);
    for (const [target, type, listener, options] of pending) {
      try {
        NativeRemove.call(target, type, listener, options);
        state.blocked++;
      } catch (_) {}
    }
    if (CONFIG.blockInlineHandlers) stripTree(document.documentElement);
    log('已恢复拦截' + (pending.length ? '，并清掉了暂停期间新增的 ' + pending.length + ' 个监听器' : ''));
    notifyBadge();
  }

  function setActive(active) { active ? resume() : pause(); }

  function broadcastToChildren(active) {
    if (!CONFIG.frameSync) return;
    for (let i = 0; i < window.frames.length; i++) {
      try { window.frames[i].postMessage({ __MLK__: 'set', active: active }, '*'); } catch (_) {}
    }
  }

  function notifyParent(active) {
    if (!CONFIG.frameSync) return;
    try {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({ __MLK__: 'set', active: active }, '*');
      }
    } catch (_) {}
  }

  // 收到其它 frame 的状态变更：应用后只向下传播，不回传父级，避免来回转发
  function applyRemote(active) {
    if (state.active === active) return;
    setActive(active);
    broadcastToChildren(active);
  }

  function toggle() {
    const next = !state.active;
    setActive(next);
    broadcastToChildren(next);   // 通知子 iframe
    notifyParent(next);          // 焦点在 iframe 里时也能切换整个页面
  }

  /* ============== 把开关状态回传给扩展，用来刷图标角标 ON / OFF ============== */
  const IS_TOP = (() => {
    try { return window === window.top; } catch (_) { return false; }
  })();

  function notifyBadge() {
    if (!IS_TOP) return;                     // 角标只反映主框架状态
    try {
      window.postMessage({ __MLK_BADGE__: true, active: state.active }, '*');
    } catch (_) {}
  }

  /* ========================= 对外接口 ========================= */
  function exposeApi() {
    const api = {
      get active() { return state.active; },
      get blockedCount() { return state.blocked; },
      blockedTypes: EVENT_TYPES.slice(),
      pause: pause,
      resume: resume,
      toggle: toggle
    };
    try {
      Object.defineProperty(window, '__MOUSE_LISTENER_KILLER__', {
        value: api, enumerable: false, configurable: true, writable: false
      });
    } catch (_) {}
  }

  /* ========================= 启动 ========================= */
  if (CONFIG.disguise) installToStringSpoof();
  if (CONFIG.blockInlineHandlers) startInlineHandlerCleanup();
  blockHandlerProperties();

  if (CONFIG.hotkey) {
    NativeAdd.call(window, 'keydown', (e) => {
      if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      if (e.code === CONFIG.hotkeyCode) {
        e.preventDefault();
        e.stopImmediatePropagation();
        toggle();
      }
    }, true);
  }

  // 统一收消息：iframe 状态同步 + 桥接脚本转来的「点击图标」命令
  NativeAdd.call(window, 'message', (e) => {
    const d = e.data;
    if (!d || typeof d !== 'object') return;
    if (d.__MLK__ === 'set') {
      applyRemote(!!d.active);                       // 父/子 frame 的状态同步
    } else if (e.source === window && d.__MLK_CMD__) {
      if (d.__MLK_CMD__ === 'toggle') toggle();      // 点击工具栏图标
      else if (d.__MLK_CMD__ === 'sync') notifyBadge();  // 页面刚加载，回报一次状态
    }
  }, false);

  exposeApi();
  notifyBadge();
  log('已启用：拦截 ' + EVENT_TYPES.join(' / ') + '（点击等其它鼠标操作正常，Alt+M 或点图标切换）');
})();
