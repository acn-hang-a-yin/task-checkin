// 家长端页面逻辑（admin.html）
// 四个页签：任务 / 记录 / 奖励 / 消息，所有数据都通过 js/*-api.js 访问 Supabase
import { requireAuth, logout, getMyProfile } from './auth.js';
import { getChildren, avatarEmoji, saveProfile, AVATARS } from './member-api.js';
import { getAllTasks, createTask, updateTask, deleteTask, normalizeTaskForm, setTaskStatus } from './task-api.js';
import { getCheckinsByUser, deleteCheckin } from './checkin-api.js';
import { getRewards, createReward, updateReward, deleteReward, getRedemptions, reviewRedemption } from './reward-api.js';
import { sendMessage, getSentMessages, deleteMessage } from './message-api.js';
import { getStarBalance, getStarRecords, addStars, deductStars } from './star-api.js';
import { todayKey, buildMonthMatrix, getOverallStreak, getCompletionRate, isTaskScheduledOn, downloadCsv } from './stats.js';
import { QUICK_FILL, getMyPresets, saveMyPreset, removeMyPreset } from './presets.js';
import { startClock } from './clock.js';
import {
  showNotification, escapeHtml, showModal, confirmDialog,
  formatDateTime, formatTimeLabel, setButtonLoading
} from './ui-common.js';

// 页面状态：所有渲染都以这里的数据为准
const state = {
  user: null,
  children: [],
  tasks: [],
  checkins: [],
  rewards: [],
  redemptions: [],
  recordChildId: null,
  rewardChildId: null,
  viewYear: new Date().getFullYear(),
  viewMonth: new Date().getMonth() + 1,
  selectedDate: todayKey(),
  currentTab: null,
  loaded: { tasks: false, records: false, rewards: false, messages: false }
};

/* ============ 页面入口 ============ */

export async function initAdminPage() {
  // 1) 入口守卫：只有家长（role = admin）能进这一页
  const auth = await requireAuth(['admin']);
  if (!auth) return;

  state.user = auth.user;

  // 2) 顶部实时时钟
  startClock();

  // 3) 先绑事件，避免数据加载慢时点不动
  bindHeader();
  bindTabs();
  bindAutoRefresh();

  // 4) 成员资料：没有资料就弹首次登录引导
  const profile = await getMyProfile();
  renderHeaderUser(profile);
  if (!profile) showProfileGuide({ firstTime: true });

  // 5) 孩子列表 + 默认打开「任务」页签
  await loadChildren();
  await loadTab('tasks');

  console.log('家长端页面初始化完成');
}

/* ============ 顶部栏 ============ */

function renderHeaderUser(profile) {
  const el = document.getElementById('header-user');
  if (!el) return;

  const nickname = profile?.nickname || state.user?.email || '家长';
  el.innerHTML = `<span class="avatar-fallback">${avatarEmoji(profile?.avatar_key)}</span>${escapeHtml(nickname)}`;
  el.title = state.user?.email || '';
}

function bindHeader() {
  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      const ok = await confirmDialog('确定要退出登录吗？', { okText: '退出', cancelText: '再想想' });
      if (!ok) return;

      await logout();
      window.location.href = 'login.html';
    });
  }

  // 点昵称可以随时改资料
  document.getElementById('header-user')?.addEventListener('click', () => showProfileGuide());
}

/* ============ 页签切换 ============ */

function bindTabs() {
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => loadTab(btn.dataset.tab));
  });
}

async function loadTab(name) {
  if (!name) return;

  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.tab === name);
  });
  document.querySelectorAll('.tab-panel').forEach((panel) => {
    panel.classList.toggle('active', panel.id === `panel-${name}`);
  });

  // 第一次打开这个页签：正常加载（会显示「加载中…」）
  // 之后再打开：先把上次的数据摆出来，再在后台静默拉一次最新（stale-while-revalidate），
  // 这样家人切页签不用等转圈，也不会一直看着过期数据（孩子在另一台设备上随时会打卡）
  const isFirstOpen = !state.loaded[name];
  state.loaded[name] = true;
  state.currentTab = name;
  lastAutoRefreshAt = Date.now(); // 手动点页签也算刷过一次，避免紧接着又自动刷

  await refreshTab(name, { silent: !isFirstOpen });
}

// 按页签名重新拉数据（silent = true 时不显示「加载中…」，失败也不覆盖已有画面）
async function refreshTab(name, { silent = false } = {}) {
  if (name === 'tasks') await loadTasks({ silent });
  if (name === 'records') await loadRecords({ silent });
  if (name === 'rewards') await loadRewards({ silent });
  if (name === 'messages') await loadMessages({ silent });
}

/* ============ 回到页面自动刷新 ============ */

// 从别的标签页 / 别的程序切回来时，静默拉一次当前页签的数据（不用再按 F5）
let lastAutoRefreshAt = 0;
const AUTO_REFRESH_GAP = 3000; // 3 秒内不重复刷新，避免来回切换时狂发请求

function bindAutoRefresh() {
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) autoRefresh();
  });
  // 桌面端在多个程序窗口之间切换时 visibilitychange 不一定触发，补一个 focus
  window.addEventListener('focus', autoRefresh);
}

function autoRefresh() {
  if (document.hidden || !state.currentTab) return;

  const now = Date.now();
  if (now - lastAutoRefreshAt < AUTO_REFRESH_GAP) return;
  lastAutoRefreshAt = now;

  refreshTab(state.currentTab, { silent: true }).catch((error) => {
    console.warn('自动刷新失败：', error);
  });
}

// 静默刷新失败：只在控制台留个记录，屏幕上继续显示上一次的数据，不打断家长操作
function warnSilent(what, error) {
  console.warn(`[静默刷新] ${what} 读取失败：`, error);
}

/* ============ 家长资料（首次登录引导） ============ */

function showProfileGuide({ firstTime = false } = {}) {
  const avatarOptions = AVATARS.map((a) => `
    <label class="avatar-option">
      <input type="radio" name="avatar_key" value="${a.key}" ${a.key === 'cat' ? 'checked' : ''}>
      <span>${a.emoji}<em>${a.label}</em></span>
    </label>
  `).join('');

  const html = `
    <p class="muted" style="margin-bottom:12px;">
      ${firstTime ? '第一次登录，先给自己起个名字吧～' : '修改昵称和头像'}
    </p>
    <form id="profile-form">
      <div class="form-row">
        <label for="profile-nickname">昵称</label>
        <input class="input" type="text" id="profile-nickname" maxlength="12" placeholder="例如：妈妈 / 爸爸" required>
      </div>
      <div class="form-row">
        <label>头像</label>
        <div class="avatar-picker">${avatarOptions}</div>
      </div>
      <div class="modal-actions">
        <button type="submit" class="btn btn-primary" id="profile-save">保存</button>
        ${firstTime ? '' : '<button type="button" class="btn" data-modal-close>取消</button>'}
      </div>
    </form>
  `;

  const modal = showModal(html, { title: '我的资料' });

  modal.element.querySelector('#profile-form').addEventListener('submit', async (e) => {
    e.preventDefault();

    const saveBtn = modal.element.querySelector('#profile-save');
    const nickname = modal.element.querySelector('#profile-nickname').value.trim();
    const avatarKey = modal.element.querySelector('input[name="avatar_key"]:checked')?.value || 'cat';

    setButtonLoading(saveBtn, true, '保存中…');
    const { success, data, error } = await saveProfile({ nickname, avatarKey });
    setButtonLoading(saveBtn, false);

    if (!success) {
      showNotification(error, 'error');
      return;
    }

    showNotification('保存成功', 'success');
    renderHeaderUser(data);
    modal.close();
    await loadChildren(); // 昵称变了，下拉框跟着刷新
  });
}

/* ============ 孩子列表 ============ */

async function loadChildren() {
  const { success, data, error } = await getChildren();

  if (!success) {
    showNotification(`读取孩子列表失败：${error}`, 'error');
    return;
  }

  state.children = data;
  state.recordChildId = state.children[0]?.user_id || null;
  state.rewardChildId = state.recordChildId;

  fillChildSelect('record-child-select', state.recordChildId);
  fillChildSelect('reward-child-select', state.rewardChildId);

  bindChildSelect('record-child-select', async (value) => {
    state.recordChildId = value;
    await loadRecords();
  });

  bindChildSelect('reward-child-select', async (value) => {
    state.rewardChildId = value;
    await loadRewards();
  });

  // 导出按钮只绑一次
  const exportBtn = document.getElementById('export-csv-btn');
  if (exportBtn && !exportBtn.dataset.bound) {
    exportBtn.dataset.bound = '1';
    exportBtn.addEventListener('click', exportCurrentChildCheckins);
  }
}

function fillChildSelect(selectId, selectedId) {
  const select = document.getElementById(selectId);
  if (!select) return;

  if (!state.children.length) {
    select.innerHTML = '<option value="">（还没有其他成员）</option>';
    return;
  }

  select.innerHTML = state.children
    .map((m) => `<option value="${m.user_id}" ${m.user_id === selectedId ? 'selected' : ''}>${escapeHtml(m.nickname || '未命名')}</option>`)
    .join('');
}

function bindChildSelect(selectId, onChange) {
  const select = document.getElementById(selectId);
  if (!select || select.dataset.bound) return;

  select.dataset.bound = '1';
  select.addEventListener('change', () => onChange(select.value));
}

// 取孩子昵称（页面提示用）
function childName(userId) {
  const found = state.children.find((m) => m.user_id === userId);
  return found?.nickname || '孩子';
}

/* ============ 页签一：任务 ============ */

async function loadTasks({ silent = false } = {}) {
  const listEl = document.getElementById('task-list');
  if (listEl && !silent) listEl.innerHTML = '<p class="loading-text">加载中…</p>';

  const { success, data, error } = await getAllTasks();
  if (!success) {
    if (silent) return warnSilent('任务列表', error);
    if (listEl) listEl.innerHTML = `<p class="empty-text">读取任务失败：${escapeHtml(error)}</p>`;
    return;
  }

  state.tasks = data;
  renderTasks();

  // 「新建任务」按钮只绑一次
  const newBtn = document.getElementById('new-task-btn');
  if (newBtn && !newBtn.dataset.bound) {
    newBtn.dataset.bound = '1';
    newBtn.addEventListener('click', () => openTaskForm(null));
  }
}

function renderTasks() {
  const listEl = document.getElementById('task-list');
  if (!listEl) return;

  if (!state.tasks.length) {
    listEl.innerHTML = `
      <div class="empty-box">
        <p class="empty-emoji">📝</p>
        <p class="empty-text">还没有任务，点右上角「+ 新建任务」开始吧</p>
      </div>
    `;
    return;
  }

  // 进行中 → 已暂停 → 已结束，排序让家长一眼看到重点
  const order = { active: 0, paused: 1, ended: 2 };
  const list = [...state.tasks].sort((a, b) => {
    const diff = (order[a.status] ?? 1) - (order[b.status] ?? 1);
    if (diff !== 0) return diff;
    return String(a.title).localeCompare(String(b.title), 'zh-CN');
  });

  listEl.innerHTML = `<div class="task-grid">${list.map(renderTaskItem).join('')}</div>`;

  listEl.querySelectorAll('[data-task-action]').forEach((btn) => {
    btn.addEventListener('click', () => handleTaskAction(btn.dataset.taskAction, btn.dataset.taskId));
  });
}

// 周期文案：每天 / 每周 周一·周三
function cycleLabel(task) {
  if (task.cycle_type !== 'weekly') return '每天';

  const names = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
  const days = (task.cycle_days || []).map((d) => names[d - 1]).filter(Boolean);

  return days.length ? `每周 ${days.join('·')}` : '每周（未选日期）';
}

function statusTag(status) {
  if (status === 'paused') return '<span class="tag tag-warning">已暂停</span>';
  if (status === 'ended') return '<span class="tag">已结束</span>';
  return '<span class="tag tag-success">进行中</span>';
}

function renderTaskItem(task) {
  const typeLabel = { checkbox: '勾选', photo: '照片', text: '文字' }[task.checkin_type] || '勾选';

  return `
    <div class="task-item ${task.status !== 'active' ? 'inactive' : ''}">
      <div class="task-item-head">
        <h3>${escapeHtml(task.title)}</h3>
        ${statusTag(task.status)}
      </div>
      <p class="muted">
        ${task.subject ? `📚 ${escapeHtml(task.subject)} · ` : ''}${cycleLabel(task)} · ⏰ ${formatTimeLabel(task.deadline_time) || '不限'} · ⭐ ${task.star_reward || 0} · 🖊 ${typeLabel}
      </p>
      ${task.description ? `<p class="task-item-desc">${escapeHtml(task.description)}</p>` : ''}
      <div class="task-item-actions">
        <button class="btn btn-sm" data-task-action="edit" data-task-id="${task.id}">编辑</button>
        ${task.status === 'active' ? `<button class="btn btn-sm" data-task-action="pause" data-task-id="${task.id}">暂停</button>` : ''}
        ${task.status === 'paused' ? `<button class="btn btn-sm btn-success" data-task-action="resume" data-task-id="${task.id}">恢复</button>` : ''}
        ${task.status !== 'ended' ? `<button class="btn btn-sm" data-task-action="end" data-task-id="${task.id}">结束</button>` : ''}
        <button class="btn btn-sm btn-danger" data-task-action="delete" data-task-id="${task.id}">删除</button>
      </div>
    </div>
  `;
}

async function handleTaskAction(action, taskId) {
  const task = state.tasks.find((t) => t.id === taskId);
  if (!task) return;

  if (action === 'edit') {
    openTaskForm(task);
    return;
  }

  if (action === 'delete') {
    const ok = await confirmDialog(`确定删除任务「${task.title}」吗？它的打卡记录也会一起删除，删掉不能恢复。`);
    if (!ok) return;

    const { success, error } = await deleteTask(taskId);
    if (!success) {
      showNotification(error, 'error');
      return;
    }

    showNotification('任务已删除', 'success');
    await loadTasks();
    return;
  }

  const statusMap = { pause: 'paused', resume: 'active', end: 'ended' };
  const status = statusMap[action];
  if (!status) return;

  const { success, error } = await setTaskStatus(taskId, status);
  if (!success) {
    showNotification(error, 'error');
    return;
  }

  const tips = { pause: '任务已暂停', resume: '任务已恢复', end: '任务已结束' };
  showNotification(tips[action], 'success');
  await loadTasks();
}

/* ============ 任务表单（新建 / 编辑：字段都能自由填写） ============ */

function openTaskForm(task = null) {
  const isEdit = Boolean(task);
  const presetList = getMyPresets();

  const quickChips = QUICK_FILL
    .map((p, i) => `<button type="button" class="chip" data-quick-index="${i}">${escapeHtml(p.title)}</button>`)
    .join('');

  const myChips = presetList.length
    ? presetList.map((p, i) => `
        <span class="chip chip-with-x">
          <button type="button" class="chip-text" data-my-index="${i}">${escapeHtml(p.title)}</button>
          <button type="button" class="chip-x" data-my-remove="${i}" title="删除这条常用">×</button>
        </span>`).join('')
    : '<span class="muted">还没有保存过「我的常用」</span>';

  const weekdayNames = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
  const weekdayChecks = weekdayNames.map((name, i) => {
    const day = i + 1;
    const checked = isEdit ? (task.cycle_days || []).includes(day) : day <= 5;
    return `<label class="chip-check"><input type="checkbox" name="cycle_days" value="${day}" ${checked ? 'checked' : ''}>${name}</label>`;
  }).join('');

  const html = `
    <form id="task-form">
      <p class="muted" style="margin-bottom:12px;">任务字段都可以自由填写，下面这些只是帮你少打几个字。</p>

      <div class="form-row">
        <label>快捷填充</label>
        <div class="chip-list">${quickChips}</div>
      </div>

      <div class="form-row">
        <label>我的常用（只存在这台设备的浏览器里）</label>
        <div class="chip-list">${myChips}</div>
      </div>

      <div class="form-grid">
        <div class="form-row">
          <label for="task-title">任务名称 *</label>
          <input class="input" type="text" id="task-title" maxlength="30" required value="${escapeHtml(task?.title || '')}">
        </div>
        <div class="form-row">
          <label for="task-subject">科目 / 分类</label>
          <input class="input" type="text" id="task-subject" maxlength="20" placeholder="例如：语文" value="${escapeHtml(task?.subject || '')}">
        </div>
      </div>

      <div class="form-row">
        <label for="task-description">任务说明</label>
        <textarea class="input" id="task-description" maxlength="200" placeholder="例如：阅读 20 分钟并拍照上传">${escapeHtml(task?.description || '')}</textarea>
      </div>

      <div class="form-grid">
        <div class="form-row">
          <label for="task-cycle-type">打卡周期</label>
          <select class="select" id="task-cycle-type">
            <option value="daily" ${task?.cycle_type !== 'weekly' ? 'selected' : ''}>每天</option>
            <option value="weekly" ${task?.cycle_type === 'weekly' ? 'selected' : ''}>每周指定几天</option>
          </select>
        </div>
        <div class="form-row">
          <label for="task-checkin-type">打卡方式</label>
          <select class="select" id="task-checkin-type">
            <option value="checkbox" ${task?.checkin_type === 'photo' || task?.checkin_type === 'text' ? '' : 'selected'}>勾选即可</option>
            <option value="photo" ${task?.checkin_type === 'photo' ? 'selected' : ''}>拍照</option>
            <option value="text" ${task?.checkin_type === 'text' ? 'selected' : ''}>文字说明</option>
          </select>
        </div>
        <div class="form-row">
          <label for="task-deadline">打卡截止时间</label>
          <input class="input" type="time" id="task-deadline" value="${formatTimeLabel(task?.deadline_time) || '21:00'}">
        </div>
        <div class="form-row">
          <label for="task-star">完成奖励星星</label>
          <input class="input" type="number" id="task-star" min="0" max="100" value="${task?.star_reward ?? 2}">
        </div>
        <div class="form-row">
          <label for="task-status">任务状态</label>
          <select class="select" id="task-status">
            <option value="active" ${task?.status === 'paused' || task?.status === 'ended' ? '' : 'selected'}>进行中</option>
            <option value="paused" ${task?.status === 'paused' ? 'selected' : ''}>已暂停</option>
            <option value="ended" ${task?.status === 'ended' ? 'selected' : ''}>已结束</option>
          </select>
        </div>
      </div>

      <div class="form-row" id="weekday-row" ${task?.cycle_type === 'weekly' ? '' : 'hidden'}>
        <label>每周哪几天要打卡</label>
        <div class="chip-checks">${weekdayChecks}</div>
      </div>

      <div class="modal-actions">
        <button type="submit" class="btn btn-primary" id="task-save">${isEdit ? '保存修改' : '创建任务'}</button>
        <button type="button" class="btn" id="save-my-preset">存为我的常用</button>
        <button type="button" class="btn" data-modal-close>取消</button>
      </div>
    </form>
  `;

  const modal = showModal(html, { title: isEdit ? '编辑任务' : '新建任务', wide: true });

  // 周期切到「每周」时才显示周几
  modal.element.querySelector('#task-cycle-type').addEventListener('change', (e) => {
    modal.element.querySelector('#weekday-row').hidden = e.target.value !== 'weekly';
  });

  // 快捷填充
  modal.element.querySelectorAll('[data-quick-index]').forEach((btn) => {
    btn.addEventListener('click', () => {
      applyTaskForm(modal, QUICK_FILL[Number(btn.dataset.quickIndex)]);
      showNotification('已帮你填好，可以随意修改', 'info');
    });
  });

  // 点「我的常用」填充
  modal.element.querySelectorAll('[data-my-index]').forEach((btn) => {
    btn.addEventListener('click', () => {
      applyTaskForm(modal, presetList[Number(btn.dataset.myIndex)]);
      showNotification('已填入常用任务', 'info');
    });
  });

  // 删除某条常用
  modal.element.querySelectorAll('[data-my-remove]').forEach((btn) => {
    btn.addEventListener('click', () => {
      removeMyPreset(Number(btn.dataset.myRemove));
      showNotification('已删除这条常用', 'success');
      modal.close();
      openTaskForm(task);
    });
  });

  // 存为「我的常用」
  modal.element.querySelector('#save-my-preset').addEventListener('click', () => {
    const form = collectTaskForm(modal);

    if (!form.title) {
      showNotification('先填个任务名称再保存吧', 'error');
      return;
    }

    saveMyPreset({
      title: form.title,
      subject: form.subject,
      description: form.description,
      cycle_type: form.cycle_type,
      cycle_days: form.cycle_days,
      deadline_time: form.deadline_time,
      checkin_type: form.checkin_type,
      star_reward: Number(form.star_reward) || 0
    });

    showNotification('已存为「我的常用」，下次点一下就能填好', 'success');
  });

  // 提交：新建 / 保存
  modal.element.querySelector('#task-form').addEventListener('submit', async (e) => {
    e.preventDefault();

    const saveBtn = modal.element.querySelector('#task-save');
    let payload;

    try {
      payload = normalizeTaskForm(collectTaskForm(modal));
    } catch (error) {
      showNotification(error.message, 'error');
      return;
    }

    setButtonLoading(saveBtn, true, '保存中…');
    const result = isEdit ? await updateTask(task.id, payload) : await createTask(payload);
    setButtonLoading(saveBtn, false);

    if (!result.success) {
      showNotification(result.error, 'error');
      return;
    }

    showNotification(isEdit ? '任务已更新' : '任务已创建', 'success');
    modal.close();

    // 任务变了，记录页的完成率要重算
    state.loaded.records = false;
    await loadTasks();
  });
}

// 把数据填进表单（快捷填充 / 我的常用共用）
function applyTaskForm(modal, data) {
  const set = (id, value) => {
    const el = modal.element.querySelector(`#${id}`);
    if (el && value !== undefined && value !== null) el.value = value;
  };

  set('task-title', data.title);
  set('task-subject', data.subject || '');
  set('task-description', data.description || '');
  set('task-cycle-type', data.cycle_type || 'daily');
  set('task-checkin-type', data.checkin_type || 'checkbox');
  set('task-deadline', formatTimeLabel(data.deadline_time) || '21:00');
  set('task-star', data.star_reward ?? 2);

  // 周几勾选：预设里没写就保持原样
  const days = data.cycle_days || [];
  if (days.length) {
    modal.element.querySelectorAll('input[name="cycle_days"]').forEach((box) => {
      box.checked = days.includes(Number(box.value));
    });
  }

  modal.element.querySelector('#weekday-row').hidden = (data.cycle_type || 'daily') !== 'weekly';
}

// 从表单收集数据（校验交给 normalizeTaskForm）
function collectTaskForm(modal) {
  const value = (id) => modal.element.querySelector(`#${id}`).value;

  return {
    title: value('task-title'),
    subject: value('task-subject'),
    description: value('task-description'),
    cycle_type: value('task-cycle-type'),
    cycle_days: [...modal.element.querySelectorAll('input[name="cycle_days"]:checked')].map((c) => Number(c.value)),
    deadline_time: value('task-deadline') || '21:00',
    checkin_type: value('task-checkin-type'),
    star_reward: value('task-star'),
    status: value('task-status')
  };
}

/* ============ 页签二：记录 ============ */

async function loadRecords({ silent = false } = {}) {
  const childId = state.recordChildId;
  const overviewEl = document.getElementById('record-overview');
  const calEl = document.getElementById('record-calendar');
  const detailEl = document.getElementById('record-day-detail');

  if (!childId) {
    if (overviewEl) overviewEl.innerHTML = '';
    if (detailEl) detailEl.innerHTML = '';
    if (calEl) {
      calEl.innerHTML = `
        <div class="empty-box">
          <p class="empty-emoji">👨‍👩‍👧</p>
          <p class="empty-text">还没有其他成员，先让孩子注册一个账号吧</p>
        </div>
      `;
    }
    return;
  }

  if (calEl && !silent) calEl.innerHTML = '<p class="loading-text">加载中…</p>';

  // 任务列表用来算每个任务的完成率（如果先打开「记录」页，这里顺手补齐）
  await ensureTasks();

  const { success, data, error } = await getCheckinsByUser(childId, { limit: 800 });
  if (!success) {
    if (silent) return warnSilent('打卡记录', error);
    if (calEl) calEl.innerHTML = `<p class="empty-text">读取打卡记录失败：${escapeHtml(error)}</p>`;
    return;
  }

  // 查询期间家长可能切换了孩子，这次结果就作废，别把新孩子的画面覆盖掉
  if (childId !== state.recordChildId) return;

  state.checkins = data;
  renderRecordOverview();
  renderRecordCalendar();
  renderRecordDayDetail(state.selectedDate);
}

// 任务数据兜底（直接打开「记录」页时 state.tasks 还是空的）
async function ensureTasks() {
  if (state.tasks.length) return state.tasks;

  const { success, data } = await getAllTasks();
  if (success) state.tasks = data;
  return state.tasks;
}

// 顶部概览数字
function renderRecordOverview() {
  const el = document.getElementById('record-overview');
  if (!el) return;

  const done = state.checkins.filter((c) => c.is_checked !== false);
  const keys = done.map((c) => c.checkin_date);
  const stars = done.reduce((sum, c) => sum + (Number(c.stars_earned) || 0), 0);

  el.innerHTML = `
    <div class="overview-item"><b>${getOverallStreak(keys)}</b><span>连续打卡（天）</span></div>
    <div class="overview-item"><b>${new Set(keys).size}</b><span>累计打卡（天）</span></div>
    <div class="overview-item"><b>${done.length}</b><span>累计完成任务（次）</span></div>
    <div class="overview-item"><b>${stars}</b><span>累计获得星星 ⭐</span></div>
  `;
}

// 月历（周一起始，点某一天看详情）
function renderRecordCalendar() {
  const wrap = document.getElementById('record-calendar');
  if (!wrap) return;

  const weeks = buildMonthMatrix(state.viewYear, state.viewMonth);
  const weekdays = ['一', '二', '三', '四', '五', '六', '日'];

  // 每天完成了多少次
  const countMap = new Map();
  state.checkins
    .filter((c) => c.is_checked !== false)
    .forEach((c) => countMap.set(c.checkin_date, (countMap.get(c.checkin_date) || 0) + 1));

  wrap.innerHTML = `
    <div class="card calendar-card">
      <div class="calendar-head">
        <button class="btn btn-sm" id="record-prev-month">‹ 上个月</button>
        <b>${escapeHtml(childName(state.recordChildId))} · ${state.viewYear} 年 ${state.viewMonth} 月</b>
        <button class="btn btn-sm" id="record-next-month">下个月 ›</button>
      </div>
      <div class="calendar-grid">
        ${weekdays.map((w) => `<div class="calendar-weekday">${w}</div>`).join('')}
        ${weeks.flat().map((cell) => {
          const doneCount = countMap.get(cell.date) || 0;
          const expected = state.tasks.filter((t) => t.status === 'active' && isTaskScheduledOn(t, cell.date)).length;
          const dot = doneCount === 0 ? '' : (expected > 0 && doneCount < expected ? 'partial-dot' : 'dot');

          return `
            <div class="calendar-cell ${cell.inMonth ? '' : 'out-month'} ${cell.isToday ? 'is-today' : ''} ${cell.date === state.selectedDate ? 'selected' : ''}"
                 data-date="${cell.date}" title="${cell.date} 完成 ${doneCount} 次">
              <span class="cell-day">${cell.day}</span>
              <span class="cell-dots">${dot ? `<i class="${dot}"></i>` : ''}</span>
            </div>
          `;
        }).join('')}
      </div>
      <p class="muted" style="margin-top:10px;">🟢 当天全部完成 · 🟡 只完成了一部分 · 点某一天看详情</p>
    </div>
  `;

  wrap.querySelector('#record-prev-month')?.addEventListener('click', () => shiftRecordMonth(-1));
  wrap.querySelector('#record-next-month')?.addEventListener('click', () => shiftRecordMonth(1));

  wrap.querySelectorAll('.calendar-cell').forEach((cell) => {
    cell.addEventListener('click', () => {
      state.selectedDate = cell.dataset.date;
      renderRecordCalendar();
      renderRecordDayDetail(state.selectedDate);
    });
  });
}

function shiftRecordMonth(step) {
  const d = new Date(state.viewYear, state.viewMonth - 1 + step, 1);
  state.viewYear = d.getFullYear();
  state.viewMonth = d.getMonth() + 1;
  renderRecordCalendar();
}

// 某一天的详情 + 每个任务的完成率
function renderRecordDayDetail(dateKey) {
  const el = document.getElementById('record-day-detail');
  if (!el) return;

  const doneList = state.checkins.filter((c) => c.checkin_date === dateKey && c.is_checked !== false);
  const stars = doneList.reduce((sum, c) => sum + (Number(c.stars_earned) || 0), 0);

  el.innerHTML = `
    <div class="card">
      <div class="card-head">
        <h3>${dateKey} 的打卡（${doneList.length} 次 · ⭐ ${stars}）</h3>
        <span class="muted">发现记错了可以点「删除」纠正，星星会一起扣回</span>
      </div>
      ${doneList.length ? doneList.map((c) => `
        <div class="day-detail-item">
          <div class="row">
            <b>${escapeHtml(c.tasks?.title || '任务')}</b>
            ${c.tasks?.subject ? `<span class="tag tag-info">${escapeHtml(c.tasks.subject)}</span>` : ''}
            <span class="tag tag-success">⭐ +${c.stars_earned || 0}</span>
            <button class="btn btn-sm btn-danger" data-delete-checkin="${c.id}">删除</button>
          </div>
          ${c.checkin_note ? `<p class="muted">${escapeHtml(c.checkin_note)}</p>` : ''}
          ${c.photo_url ? `<img class="checkin-photo" src="${c.photo_url}" alt="打卡照片">` : ''}
          <p class="muted">打卡时间：${formatDateTime(c.created_at)}</p>
        </div>
      `).join('') : '<p class="empty-text">这一天没有打卡记录</p>'}
    </div>

    <div class="card">
      <h3>任务完成率（从任务创建算到今天）</h3>
      ${state.tasks.length ? state.tasks.map(renderTaskCompletionRow).join('') : '<p class="empty-text">还没有任务</p>'}
    </div>
  `;

  el.querySelectorAll('[data-delete-checkin]').forEach((btn) => {
    btn.addEventListener('click', () => removeCheckin(btn.dataset.deleteCheckin));
  });
}

function renderTaskCompletionRow(task) {
  const keys = state.checkins
    .filter((c) => c.task_id === task.id && c.is_checked !== false)
    .map((c) => c.checkin_date)
    .filter(Boolean)
    .sort();

  // 已结束的任务：只统计到它最后一次打卡那天，否则「应打卡」会一直算到今天
  const options = task.status === 'ended' && keys.length ? { toKey: keys[keys.length - 1] } : {};

  // isTaskScheduledOn() 对已结束任务一律返回 false（当天该不该打卡），
  // 但这里要看的是「历史完成率」，所以统计时先把它当成进行中的任务
  const target = task.status === 'ended' ? { ...task, status: 'active' } : task;

  const { expected, done, rate } = getCompletionRate(target, keys, options);

  return `
    <div class="stat-line">
      <span>${escapeHtml(task.title)}</span>
      <span class="row">
        <span class="prog" style="width:120px;"><span style="width:${rate}%;"></span></span>
        <b>${rate}%</b>
        <span class="muted">${done}/${expected} 次</span>
        ${task.status === 'ended' ? '<span class="tag">已结束</span>' : ''}
        ${task.status === 'paused' ? '<span class="tag tag-warning">已暂停</span>' : ''}
      </span>
    </div>
  `;
}

// 删除某条打卡记录（含星星回退）
async function removeCheckin(checkinId) {
  const target = state.checkins.find((c) => c.id === checkinId);
  if (!target) return;

  const ok = await confirmDialog(`确定删除 ${target.checkin_date} 的「${target.tasks?.title || '任务'}」打卡记录吗？已发的星星会一起扣回。`);
  if (!ok) return;

  const { success, error } = await deleteCheckin(target);
  if (!success) {
    showNotification(error, 'error');
    return;
  }

  showNotification('记录已删除', 'success');
  await loadRecords();
}

// 导出当前孩子的打卡记录（带 BOM，Excel 打开不乱码）
function exportCurrentChildCheckins() {
  if (!state.recordChildId) {
    showNotification('还没有可导出的孩子', 'error');
    return;
  }

  if (!state.checkins.length) {
    showNotification('这个孩子还没有打卡记录', 'error');
    return;
  }

  const rows = [['日期', '任务', '科目', '是否完成', '获得星星', '打卡说明', '照片链接', '打卡时间']];

  [...state.checkins]
    .sort((a, b) => String(a.checkin_date).localeCompare(String(b.checkin_date)))
    .forEach((c) => {
      rows.push([
        c.checkin_date,
        c.tasks?.title || '',
        c.tasks?.subject || '',
        c.is_checked === false ? '未完成' : '已完成',
        c.stars_earned || 0,
        c.checkin_note || '',
        c.photo_url || '',
        formatDateTime(c.created_at)
      ]);
    });

  downloadCsv(`${childName(state.recordChildId)}-打卡记录-${todayKey()}.csv`, rows);
  showNotification('CSV 已下载，用 Excel 打开就能看', 'success');
}

/* ============ 页签三：奖励 ============ */

async function loadRewards({ silent = false } = {}) {
  const childId = state.rewardChildId;

  const [pool, redemptions] = await Promise.all([
    getRewards(false),
    getRedemptions({ limit: 100 })
  ]);

  // 查询期间家长可能切换了孩子，这次结果就作废，别把新孩子的画面覆盖掉
  if (childId !== state.rewardChildId) return;

  state.rewards = pool.success ? pool.data : [];
  state.redemptions = redemptions.success ? redemptions.data : [];

  // 静默刷新时先记住家长正在填的「星星数量 / 原因」，渲染完再填回去，别一刷新就清零
  const keepAmount = silent ? document.getElementById('star-amount')?.value : null;
  const keepReason = silent ? document.getElementById('star-reason')?.value : null;

  await renderStarBalanceCard(childId);

  const amountEl = keepAmount == null ? null : document.getElementById('star-amount');
  const reasonEl = keepReason == null ? null : document.getElementById('star-reason');
  if (amountEl) amountEl.value = keepAmount;
  if (reasonEl) reasonEl.value = keepReason;

  renderRewardPool();
  renderRedemptionCard();
}

// 星星卡：余额 + 手动加/扣星 + 最近流水
async function renderStarBalanceCard(childId) {
  const el = document.getElementById('star-balance-card');
  if (!el) return;

  if (!childId) {
    el.innerHTML = '<h3>⭐ 星星</h3><p class="empty-text">还没有孩子账号</p>';
    return;
  }

  const [balanceResult, recordsResult] = await Promise.all([
    getStarBalance(childId),
    getStarRecords(childId, 12)
  ]);

  const balance = balanceResult.success ? balanceResult.data : 0;

  el.innerHTML = `
    <div class="card-head">
      <h3>⭐ ${escapeHtml(childName(childId))} 的星星</h3>
      <b style="font-size:1.6rem;color:var(--color-star);">${balance}</b>
    </div>
    <div class="form-grid">
      <div class="form-row">
        <label for="star-amount">星星数量</label>
        <input id="star-amount" class="input" type="number" min="1" value="5">
      </div>
      <div class="form-row">
        <label for="star-reason">原因（会记进流水）</label>
        <input id="star-reason" class="input" type="text" maxlength="30" placeholder="例如：主动帮妈妈洗碗">
      </div>
    </div>
    <div class="card-actions">
      <button class="btn btn-success" id="star-add-btn">＋ 加星星</button>
      <button class="btn btn-danger" id="star-deduct-btn">－ 扣星星</button>
    </div>
    <h3 style="margin-top:18px;">最近星星流水</h3>
    ${renderStarRecordList(recordsResult.success ? recordsResult.data : [])}
  `;

  el.querySelector('#star-add-btn')?.addEventListener('click', () => adjustStars(childId, 1));
  el.querySelector('#star-deduct-btn')?.addEventListener('click', () => adjustStars(childId, -1));
}

function renderStarRecordList(records) {
  if (!records.length) return '<p class="empty-text">还没有星星记录</p>';

  return records.map((r) => {
    const plus = (r.stars_change || 0) > 0;
    return `
      <div class="star-record-item">
        <span class="star-${plus ? 'plus' : 'minus'}">${plus ? '+' : ''}${r.stars_change}</span>
        <span>${escapeHtml(r.reason || '（没有写原因）')}</span>
        <span class="muted">${formatDateTime(r.created_at)}</span>
      </div>
    `;
  }).join('');
}

// direction = 1 加星，-1 扣星
async function adjustStars(childId, direction) {
  const amount = Number(document.getElementById('star-amount')?.value) || 0;
  const reason = document.getElementById('star-reason')?.value || '';

  if (amount <= 0) {
    showNotification('星星数量要大于 0', 'error');
    return;
  }

  const ok = await confirmDialog(direction > 0
    ? `给 ${childName(childId)} 加 ${amount} 颗星星？`
    : `扣掉 ${childName(childId)} 的 ${amount} 颗星星？`);
  if (!ok) return;

  const result = direction > 0
    ? await addStars(childId, amount, reason || '家长奖励')
    : await deductStars(childId, amount, reason || '家长扣星');

  if (!result.success) {
    showNotification(result.error, 'error');
    return;
  }

  showNotification(direction > 0 ? '星星加好啦 ⭐' : '星星已扣掉', 'success');
  await renderStarBalanceCard(childId);
}

/* ---------- 奖励池（家长维护） ---------- */

function renderRewardPool() {
  const el = document.getElementById('reward-pool-card');
  if (!el) return;

  el.innerHTML = `
    <div class="card-head">
      <h3>🎁 奖励池（${state.rewards.length} 个）</h3>
      <button class="btn btn-primary btn-sm" id="new-reward-btn">+ 新建奖励</button>
    </div>
    ${state.rewards.length ? state.rewards.map(renderRewardItem).join('') : '<p class="empty-text">还没有奖励，先建一个孩子喜欢的吧</p>'}
  `;

  el.querySelector('#new-reward-btn')?.addEventListener('click', () => openRewardForm(null));

  el.querySelectorAll('[data-reward-action]').forEach((btn) => {
    btn.addEventListener('click', () => handleRewardAction(btn.dataset.rewardAction, btn.dataset.rewardId));
  });
}

function renderRewardItem(reward) {
  const off = reward.is_active === false;

  return `
    <div class="reward-item${off ? ' reward-off' : ''}">
      <div class="row">
        <span class="reward-emoji">${reward.emoji || '🎁'}</span>
        <b>${escapeHtml(reward.name)}</b>
        <span class="tag tag-star">⭐ ${reward.stars_required}</span>
        ${off ? '<span class="tag">已下架</span>' : ''}
      </div>
      ${reward.description ? `<p class="muted">${escapeHtml(reward.description)}</p>` : ''}
      <div class="card-actions">
        <button class="btn btn-sm" data-reward-action="toggle" data-reward-id="${reward.id}">${off ? '重新上架' : '下架'}</button>
        <button class="btn btn-sm" data-reward-action="edit" data-reward-id="${reward.id}">编辑</button>
        <button class="btn btn-sm btn-danger" data-reward-action="delete" data-reward-id="${reward.id}">删除</button>
      </div>
    </div>
  `;
}

async function handleRewardAction(action, rewardId) {
  const reward = state.rewards.find((r) => r.id === rewardId);
  if (!reward) return;

  if (action === 'edit') {
    openRewardForm(reward);
    return;
  }

  if (action === 'toggle') {
    const { success, error } = await updateReward(reward.id, {
      name: reward.name,
      description: reward.description,
      starsRequired: reward.stars_required,
      emoji: reward.emoji,
      isActive: reward.is_active === false
    });

    if (!success) {
      showNotification(error, 'error');
      return;
    }

    showNotification(reward.is_active === false ? '已重新上架' : '已下架', 'success');
    await loadRewards();
    return;
  }

  const ok = await confirmDialog(`删除奖励「${reward.name}」？删掉之后孩子端就看不到它了。`);
  if (!ok) return;

  const { success, error } = await deleteReward(reward.id);
  if (!success) {
    showNotification(error, 'error');
    return;
  }

  showNotification('奖励已删除', 'success');
  await loadRewards();
}

// 新建 / 编辑奖励弹窗
function openRewardForm(reward) {
  const isEdit = Boolean(reward);
  const emojiQuick = ['🎁', '🍦', '🎮', '📺', '🎬', '🧸', '🍕', '🚴'];

  const html = `
    <form id="reward-form">
      <div class="form-row">
        <label for="reward-name">奖励名称</label>
        <input id="reward-name" class="input" type="text" maxlength="30" placeholder="例如：看 30 分钟动画片"
               value="${isEdit ? escapeHtml(reward.name) : ''}" required>
      </div>
      <div class="form-row">
        <label for="reward-desc">说明（可选）</label>
        <input id="reward-desc" class="input" type="text" maxlength="60" placeholder="例如：周末全天有效"
               value="${isEdit ? escapeHtml(reward.description || '') : ''}">
      </div>
      <div class="form-grid">
        <div class="form-row">
          <label for="reward-emoji">图标</label>
          <input id="reward-emoji" class="input" type="text" maxlength="4" value="${isEdit ? escapeHtml(reward.emoji || '🎁') : '🎁'}">
        </div>
        <div class="form-row">
          <label for="reward-stars">需要星星（⭐）</label>
          <input id="reward-stars" class="input" type="number" min="1" value="${isEdit ? reward.stars_required : 10}">
        </div>
      </div>
      <div class="chip-list">
        ${emojiQuick.map((e) => `<button type="button" class="chip" data-emoji="${e}">${e}</button>`).join('')}
      </div>
      <div class="modal-actions">
        <button type="button" class="btn" data-modal-close>取消</button>
        <button type="submit" class="btn btn-primary" id="reward-save">${isEdit ? '保存' : '创建'}</button>
      </div>
    </form>
  `;

  const modal = showModal(html, { title: isEdit ? '编辑奖励' : '新建奖励' });

  // 点小图标就填进图标输入框
  modal.element.querySelectorAll('[data-emoji]').forEach((btn) => {
    btn.addEventListener('click', () => {
      modal.element.querySelector('#reward-emoji').value = btn.dataset.emoji;
    });
  });

  modal.element.querySelector('#reward-form').addEventListener('submit', async (e) => {
    e.preventDefault();

    const saveBtn = modal.element.querySelector('#reward-save');
    const payload = {
      name: modal.element.querySelector('#reward-name').value.trim(),
      description: modal.element.querySelector('#reward-desc').value.trim(),
      emoji: modal.element.querySelector('#reward-emoji').value.trim() || '🎁',
      starsRequired: Number(modal.element.querySelector('#reward-stars').value) || 1
    };

    setButtonLoading(saveBtn, true, '保存中…');
    const result = isEdit
      ? await updateReward(reward.id, { ...payload, isActive: reward.is_active !== false })
      : await createReward(payload);
    setButtonLoading(saveBtn, false);

    if (!result.success) {
      showNotification(result.error, 'error');
      return;
    }

    showNotification(isEdit ? '奖励已更新' : '奖励已添加 🎁', 'success');
    modal.close();
    await loadRewards();
  });
}

/* ---------- 兑换申请审核 ---------- */

function renderRedemptionCard() {
  const el = document.getElementById('redemption-card');
  if (!el) return;

  const pending = state.redemptions.filter((r) => r.status === 'pending');

  el.innerHTML = `
    <div class="card-head">
      <h3>📮 兑换申请（待审核 ${pending.length}）</h3>
    </div>
    ${state.redemptions.length ? state.redemptions.map(renderRedemptionItem).join('') : '<p class="empty-text">还没有兑换申请，孩子攒够星星就会来申请啦</p>'}
  `;

  el.querySelectorAll('[data-review]').forEach((btn) => {
    btn.addEventListener('click', () => reviewRedemptionById(btn.dataset.review, btn.dataset.decision));
  });
}

function renderRedemptionItem(r) {
  const statusText = {
    pending: ['tag-warning', '待审核'],
    approved: ['tag-success', '已通过'],
    rejected: ['tag-danger', '已驳回']
  };
  const [cls, text] = statusText[r.status] || ['tag', r.status];

  return `
    <div class="redemption-item">
      <div class="row">
        <b>${childName(r.user_id)}</b>
        <span>${r.reward_emoji || '🎁'} ${escapeHtml(r.reward_name)}</span>
        <span class="tag tag-star">⭐ ${r.stars_spent || 0}</span>
        <span class="tag ${cls}">${text}</span>
      </div>
      <p class="muted">申请时间：${formatDateTime(r.created_at)}</p>
      ${r.review_notes ? `<p class="muted">审核备注：${escapeHtml(r.review_notes)}</p>` : ''}
      ${r.status === 'pending' ? `
        <div class="card-actions">
          <button class="btn btn-sm btn-success" data-review="${r.id}" data-decision="approved">同意（扣 ${r.stars_spent || 0} 星）</button>
          <button class="btn btn-sm btn-danger" data-review="${r.id}" data-decision="rejected">驳回</button>
        </div>
      ` : ''}
    </div>
  `;
}

async function reviewRedemptionById(redemptionId, decision) {
  const target = state.redemptions.find((r) => r.id === redemptionId);
  if (!target) return;

  const approve = decision === 'approved';

  const ok = await confirmDialog(
    approve
      ? `同意「${target.reward_name}」的兑换，并扣掉 ${target.stars_spent} 颗星星？`
      : `驳回「${target.reward_name}」的兑换申请？星星不会扣。`,
    approve ? { okText: '同意兑换', cancelText: '再想想' } : { okText: '确定驳回', cancelText: '取消' }
  );
  if (!ok) return;

  const { success, error } = await reviewRedemption(
    target,
    decision,
    approve ? '家长已同意，去领奖励吧' : '家长暂时驳回，下次再努力'
  );

  if (!success) {
    showNotification(error, 'error');
    return;
  }

  showNotification(approve ? '已同意兑换 🎉' : '已驳回申请', 'success');
  await loadRewards();
}

/* ============ 页签四：消息 ============ */

// 发过的留言缓存（只在这页用，不放进 state）
let sentMessageCache = [];

async function loadMessages({ silent = false } = {}) {
  const formEl = document.getElementById('message-form-card');
  const historyEl = document.getElementById('message-history-card');

  if (!state.children.length) {
    if (formEl) formEl.innerHTML = '<p class="empty-text">还没有孩子账号，先让孩子注册一个吧</p>';
    if (historyEl) historyEl.innerHTML = '';
    return;
  }

  // 静默刷新时表单已经建好了就别重建，否则会把家长正在输入的文字清掉
  if (!formEl?.querySelector('#message-send')) renderMessageForm();

  if (historyEl && !silent) historyEl.innerHTML = '<p class="loading-text">加载中…</p>';

  const { success, data, error } = await getSentMessages(50);
  if (!success) {
    if (silent) return warnSilent('留言', error);
    if (historyEl) historyEl.innerHTML = `<p class="empty-text">读取留言失败：${escapeHtml(error)}</p>`;
    return;
  }

  sentMessageCache = data;
  renderMessageHistory();
}

function renderMessageForm() {
  const el = document.getElementById('message-form-card');
  if (!el) return;

  el.innerHTML = `
    <h3>✉️ 写一条留言</h3>
    <div class="form-row">
      <label for="message-to">发给谁</label>
      <select id="message-to" class="select">
        ${state.children.map((c) => `<option value="${c.user_id}" ${c.user_id === state.rewardChildId ? 'selected' : ''}>${escapeHtml(c.nickname || '未命名')}</option>`).join('')}
      </select>
    </div>
    <div class="form-row">
      <label for="message-content">留言内容</label>
      <textarea id="message-content" class="input" maxlength="200" placeholder="例如：今天的口算做得很好，妈妈看到了 👍"></textarea>
    </div>
    <div class="card-actions">
      <button class="btn btn-primary" id="message-send">发送</button>
      <span class="muted">孩子打开「消息」页签就能看到</span>
    </div>
  `;

  el.querySelector('#message-send').addEventListener('click', sendMessageToChild);
}

async function sendMessageToChild() {
  const toUserId = document.getElementById('message-to')?.value;
  const contentEl = document.getElementById('message-content');
  const btn = document.getElementById('message-send');
  const content = (contentEl?.value || '').trim();

  if (!toUserId) {
    showNotification('请选择要发给孩子', 'error');
    return;
  }

  if (!content) {
    showNotification('先写点内容吧', 'error');
    return;
  }

  setButtonLoading(btn, true, '发送中…');
  const { success, error } = await sendMessage(toUserId, content);
  setButtonLoading(btn, false);

  if (!success) {
    showNotification(error, 'error');
    return;
  }

  if (contentEl) contentEl.value = '';
  showNotification(`已发给 ${childName(toUserId)} 💬`, 'success');
  await loadMessages();
}

function renderMessageHistory() {
  const el = document.getElementById('message-history-card');
  if (!el) return;

  if (!sentMessageCache.length) {
    el.innerHTML = '<h3>📤 我发过的留言</h3><p class="empty-text">还没有发过留言</p>';
    return;
  }

  el.innerHTML = `
    <h3>📤 我发过的留言（${sentMessageCache.length} 条）</h3>
    ${sentMessageCache.map((m) => `
      <div class="message-item">
        <div class="row">
          <b>${childName(m.to_user_id)}</b>
          <span class="tag ${m.is_read ? 'tag-success' : 'tag-warning'}">${m.is_read ? '已读' : '未读'}</span>
          <span class="muted">${formatDateTime(m.created_at)}</span>
          <button class="btn btn-sm btn-danger" data-del-message="${m.id}">删除</button>
        </div>
        <p class="message-content">${escapeHtml(m.content)}</p>
      </div>
    `).join('')}
  `;

  el.querySelectorAll('[data-del-message]').forEach((btn) => {
    btn.addEventListener('click', () => removeMessage(btn.dataset.delMessage));
  });
}

async function removeMessage(messageId) {
  const ok = await confirmDialog('删除这条留言？孩子那边就看不到了。');
  if (!ok) return;

  const { success, error } = await deleteMessage(messageId);
  if (!success) {
    showNotification(error, 'error');
    return;
  }

  showNotification('留言已删除', 'success');
  await loadMessages();
}

