// 无操作自动登出模块（家长端 admin.html 和孩子端 child.html 共用）
// 规则：5 分钟内没有任何「用过的痕迹」（鼠标 / 键盘 / 触摸 / 滚动）就自动退出登录。
//
// 来龙去脉：这个功能原来写在旧的单页版 js/ui.js（initPage 里那段 resetInactivityTimer），
//   后来重构成家长端 / 孩子端双页面，新页面用的是 admin-ui.js / child-ui.js，
//   这段逻辑没有跟着搬过来，于是新页面上就「没有自动登出」了。这里抽成共用模块补回来，
//   这样以后再加页面也不会再漏。
//
// 退出后做的事和以前一模一样：调 auth.js 的 logout() → 提示一句 → 清掉本地缓存 → 回登录页。
import { logout } from './auth.js';
import { showNotification } from './ui-common.js';

// 5 分钟没动作就退出（毫秒）。太长（10 分钟）容易忘记退出，太短又会误退
export const IDLE_TIMEOUT_MS = 5 * 60 * 1000;

// 算作「还在用」的动作：随便哪个发生一次就重新计时
const ACTIVITY_EVENTS = ['mousedown', 'mousemove', 'keypress', 'keydown', 'scroll', 'touchstart', 'click'];

// 已经启动过就不再重复绑定（一个页面只调用一次 startIdleLogout）
let started = false;

/**
 * 启动无操作自动登出
 * @param {{timeoutMs?: number}} options timeoutMs=多久没动作算超时（默认 5 分钟）
 */
export function startIdleLogout({ timeoutMs = IDLE_TIMEOUT_MS } = {}) {
  if (started) return;
  started = true;

  let timer = null;

  // 重新计时：初始化时调一次，之后每个用户动作都调一次
  const arm = () => {
    if (timer) clearTimeout(timer);

    timer = setTimeout(async () => {
      const { success } = await logout();

      // 退出失败（比如刚好断网）就别把人硬丢在页面上不动，重新开始计时
      if (!success) {
        arm();
        return;
      }

      showNotification('由于长时间未操作，已自动退出登录', 'info');
      localStorage.clear();

      // 稍等一下再跳，让上面那句提示来得及被看到
      setTimeout(() => {
        window.location.href = 'login.html';
      }, 1200);
    }, timeoutMs);
  };

  arm();

  // capture = true：即使事件被页面里的代码 stopPropagation 了也能监听到
  ACTIVITY_EVENTS.forEach((name) => document.addEventListener(name, arm, true));
}
