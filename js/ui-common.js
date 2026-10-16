// 公共 UI 小工具模块（家长端 admin.html 和孩子端 child.html 共用）
// 提供：顶部提示条、通用弹窗、二次确认、文本转义、时间格式化

/**
 * 顶部提示条，3 秒后自动消失
 * @param {string} message 提示内容
 * @param {'info'|'success'|'error'} type 提示类型
 */
export function showNotification(message, type = 'info') {
  const notification = document.createElement('div');
  notification.className = `notification ${type}`;
  notification.textContent = message;

  document.body.appendChild(notification);

  setTimeout(() => {
    notification.remove();
  }, 3000);
}

/**
 * 把用户输入转成安全的 HTML 文本（防止页面被注入脚本）
 * @param {*} value 任意值
 * @returns {string}
 */
export function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * 打开一个通用弹窗
 * @param {string} html 弹窗内部 HTML（内部任何带 data-modal-close 的元素都能关闭弹窗）
 * @param {{title?: string, wide?: boolean}} options title=标题，wide=true 使用更宽的卡片
 * @returns {{element: HTMLElement, close: Function}}
 */
export function showModal(html, options = {}) {
  const { title = '', wide = false } = options;

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-card${wide ? ' modal-wide' : ''}">
      ${title ? `<div class="modal-header"><h3>${escapeHtml(title)}</h3><button type="button" class="modal-x" data-modal-close>&times;</button></div>` : ''}
      <div class="modal-body">${html}</div>
    </div>
  `;

  document.body.appendChild(overlay);

  const close = () => {
    if (overlay.parentNode) overlay.remove();
  };

  // 点遮罩空白处、点 × 或任何带 data-modal-close 的元素都能关闭
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay || e.target.closest('[data-modal-close]')) close();
  });

  return { element: overlay, close };
}

/**
 * 二次确认弹窗（Promise 版）
 * @param {string} message 确认文字
 * @param {{okText?: string, cancelText?: string}} options 按钮文字
 * @returns {Promise<boolean>} 点「确定」返回 true，其它情况返回 false
 */
export function confirmDialog(message, options = {}) {
  const { okText = '确定删除', cancelText = '取消' } = options;

  return new Promise((resolve) => {
    const html = `
      <p class="confirm-text">${escapeHtml(message)}</p>
      <div class="modal-actions">
        <button type="button" class="btn btn-danger" data-confirm-ok>${escapeHtml(okText)}</button>
        <button type="button" class="btn" data-confirm-cancel>${escapeHtml(cancelText)}</button>
      </div>
    `;

    const modal = showModal(html, { title: '请确认' });
    let answered = false;

    const finish = (value) => {
      if (answered) return;
      answered = true;
      modal.close();
      resolve(value);
    };

    modal.element.querySelector('[data-confirm-ok]').addEventListener('click', () => finish(true));
    modal.element.querySelector('[data-confirm-cancel]').addEventListener('click', () => finish(false));
    modal.element.addEventListener('click', (e) => {
      if (e.target === modal.element) finish(false);
    });
  });
}

/**
 * 显示成标准时间：2026-10-16 21:05
 * @param {string|Date} value 时间（ISO 字符串或 Date）
 * @returns {string}
 */
export function formatDateTime(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';

  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/**
 * 把数据库的 TIME 字段（'21:00:00'）显示成 '21:00'
 * @param {string} value
 * @returns {string}
 */
export function formatTimeLabel(value) {
  if (!value) return '';
  return String(value).slice(0, 5);
}

/**
 * 按钮 loading 状态切换（防止重复点击提交）
 * @param {HTMLButtonElement} button 按钮
 * @param {boolean} loading 是否 loading
 * @param {string} loadingText loading 时显示的文字
 */
export function setButtonLoading(button, loading, loadingText = '处理中...') {
  if (!button) return;

  if (loading) {
    button.dataset.originalText = button.textContent;
    button.disabled = true;
    button.textContent = loadingText;
  } else {
    button.disabled = false;
    if (button.dataset.originalText) button.textContent = button.dataset.originalText;
  }
}
