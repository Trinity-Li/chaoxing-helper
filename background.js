/* =============================================================================
 *  background.js —— 工具栏图标徽标（ON / OFF）
 * -----------------------------------------------------------------------------
 *  页面里按 Alt+M 或点工具栏图标切换开关，页面脚本把状态回传到这里，
 *  这里把图标角标刷成 ON（绿）/ OFF（灰）。
 * ========================================================================== */

const COLOR_ON = '#12b76a';
const COLOR_OFF = '#94a3b8';

function paint(tabId, active) {
  try {
    chrome.action.setBadgeText({ tabId: tabId, text: active ? 'ON' : 'OFF' });
    chrome.action.setBadgeBackgroundColor({ tabId: tabId, color: active ? COLOR_ON : COLOR_OFF });
    chrome.action.setTitle({
      tabId: tabId,
      title: active
        ? '视频防自动暂停：已开启（Alt+M 或点图标关闭）'
        : '视频防自动暂停：已关闭（Alt+M 或点图标开启）'
    });
  } catch (_) { /* 标签页已关闭 */ }
}

/* 页面脚本（MAIN world）→ 桥接脚本 → 这里 */
chrome.runtime.onMessage.addListener((msg, sender) => {
  if (!msg || msg.type !== 'mlk-state') return;
  const tabId = sender.tab && sender.tab.id;
  if (tabId == null || sender.frameId !== 0) return;   // 只认主框架的状态
  paint(tabId, !!msg.active);
});

/* 点击工具栏图标 = 切换当前页面的开关 */
chrome.action.onClicked.addListener((tab) => {
  if (!tab || tab.id == null) return;
  chrome.tabs.sendMessage(tab.id, { type: 'mlk-toggle' }, { frameId: 0 }).catch(() => {});
});

/* 页面开始导航时先清掉角标，避免停在上一个页面的状态 */
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status !== 'loading') return;
  try { chrome.action.setBadgeText({ tabId: tabId, text: '' }); } catch (_) {}
});
