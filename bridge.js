/* =============================================================================
 *  bridge.js —— 隔离世界桥接（内容脚本默认世界）
 * -----------------------------------------------------------------------------
 *  MAIN world 的 content.js 拿不到 chrome.* API，这里负责两头传话：
 *    页面开关状态  →  background.js（刷图标角标 ON / OFF）
 *    点击图标命令  →  content.js（切换开关）
 * ========================================================================== */

(() => {
  'use strict';

  const IS_TOP = (() => {
    try { return window === window.top; } catch (_) { return false; }
  })();

  /* 页面 → 后台 */
  window.addEventListener('message', (e) => {
    if (e.source !== window) return;               // 只收本窗口自己发的
    const d = e.data;
    if (!d || typeof d !== 'object') return;
    if (d.__MLK_BADGE__ !== true) return;
    if (!IS_TOP) return;                           // 角标只反映主框架的状态
    try {
      chrome.runtime.sendMessage({ type: 'mlk-state', active: !!d.active });
    } catch (_) { /* 扩展已重载，忽略 */ }
  }, false);

  /* 后台（点击图标）→ 页面 */
  chrome.runtime.onMessage.addListener((msg) => {
    if (!msg || msg.type !== 'mlk-toggle') return;
    if (!IS_TOP) return;                           // 主框架负责切换，再同步给 iframe
    window.postMessage({ __MLK_CMD__: 'toggle' }, '*');
  });

  /* 页面加载时主动要一次当前状态，避免两个脚本的执行先后顺序问题 */
  window.postMessage({ __MLK_CMD__: 'sync' }, '*');
})();
