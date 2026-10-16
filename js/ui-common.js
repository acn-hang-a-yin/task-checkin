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

/* ---------- 资料弹窗（昵称 + 头像）共用零件 ---------- */

/**
 * 资料弹窗顶部的「当前昵称 / 当前头像」预览块
 * 作用：改资料时先让用户看到自己现在用的是什么，一眼能对照
 * @param {{nickname?: string, avatar?: {key: string, emoji: string, label: string}, tip?: string}} options
 *        nickname=当前昵称，avatar=当前头像（AVATARS 里的一项），tip=下面那行小字
 * @returns {string} HTML 字符串，内部固定 id：profile-preview / -avatar / -name / -avatar-label / -tip
 */
export function profilePreviewHtml({ nickname = '', avatar = { key: 'cat', emoji: '🐱', label: '小猫' }, tip = '' } = {}) {
  const name = escapeHtml(String(nickname || '').trim());

  return `
    <div class="profile-preview" id="profile-preview" data-changed="false">
      <span class="avatar-fallback avatar-lg" id="profile-preview-avatar">${avatar.emoji}</span>
      <div class="profile-preview-info">
        <div class="profile-preview-line">当前昵称：<b id="profile-preview-name">${name || '（还没有填）'}</b></div>
        <div class="profile-preview-line">当前头像：<span id="profile-preview-avatar-label">${avatar.label} ${avatar.emoji}</span></div>
        <div class="profile-preview-tip" id="profile-preview-tip">${escapeHtml(tip)}</div>
      </div>
    </div>
  `;
}

/**
 * 让上面的预览块跟着输入实时变化（改昵称、换头像都会立刻反映到预览里）
 * 约定：弹窗里昵称输入框 id = profile-nickname，头像单选按钮 name = avatar_key
 * @param {HTMLElement} root 弹窗根元素（showModal() 返回的 element）
 * @param {{avatars?: Array<{key: string, emoji: string, label: string}>}} options avatars=AVATARS，用来把头像标识翻成 emoji / 名字
 */
export function bindProfilePreview(root, { avatars = [] } = {}) {
  const preview = root.querySelector('#profile-preview');
  if (!preview) return;

  const nameEl = preview.querySelector('#profile-preview-name');
  const avatarEl = preview.querySelector('#profile-preview-avatar');
  const avatarLabelEl = preview.querySelector('#profile-preview-avatar-label');
  const tipEl = preview.querySelector('#profile-preview-tip');
  const nameInput = root.querySelector('#profile-nickname');
  const radios = Array.from(root.querySelectorAll('input[name="avatar_key"]'));

  // 把预览里的「当前头像 / 当前头像名 / 当前昵称」重画一遍
  const paint = () => {
    const key = radios.find((r) => r.checked)?.value;
    const found = avatars.find((a) => a.key === key);

    if (found) {
      avatarEl.textContent = found.emoji;
      avatarLabelEl.textContent = `${found.label} ${found.emoji}`;
    }
    nameEl.textContent = (nameInput?.value || '').trim() || '（还没有填）';
  };

  // 一旦改动就提醒「还没保存」，预览块换成橙色边
  const markChanged = () => {
    if (preview.dataset.changed === 'true') return;
    preview.dataset.changed = 'true';
    tipEl.textContent = '已修改，点「保存」后才会生效';
  };

  nameInput?.addEventListener('input', () => {
    paint();
    markChanged();
  });
  radios.forEach((radio) => radio.addEventListener('change', () => {
    paint();
    markChanged();
  }));

  paint();
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
