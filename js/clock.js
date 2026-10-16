// 实时时钟模块（公共组件）
// 用法：页面顶部放一个 <span id="system-clock"></span>，然后调用 startClock()
// 显示格式：2026年10月16日 21:05:07，每秒自动刷新

/**
 * 启动实时时钟
 * @param {string} elId 显示时钟的元素 id，默认 'system-clock'
 * @returns {number|null} 定时器 id（元素不存在时返回 null）
 */
export function startClock(elId = 'system-clock') {
  const el = document.getElementById(elId);
  if (!el) return null;

  const p = (n) => String(n).padStart(2, '0');

  const tick = () => {
    const d = new Date();
    el.textContent = `${d.getFullYear()}年${p(d.getMonth() + 1)}月${p(d.getDate())}日 ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  };

  tick();
  return setInterval(tick, 1000);
}

/**
 * 停止时钟（页面卸载时浏览器会自动清理，一般不需要手动调用）
 * @param {number|null} timerId startClock() 的返回值
 */
export function stopClock(timerId) {
  if (timerId) clearInterval(timerId);
}
