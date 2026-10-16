// 孩子端页面逻辑（child.html）
// 四个页签：今日 / 记录 / 奖励 / 消息，全部走 js/*-api.js，界面尽量大字号、少文字、多图标
import { requireAuth, logout } from './auth.js';
import { getMember, avatarEmoji, saveProfile, AVATARS } from './member-api.js';
import { getTodayTasks } from './task-api.js';
import { getCheckinsByDate, getCheckinsByUser, submitCheckin } from './checkin-api.js';
import { getRewards, requestRedemption, getRedemptions } from './reward-api.js';
import { getMessagesForUser, getUnreadCount, markAllMessagesRead } from './message-api.js';
import { getStarBalance, getStarRecords } from './star-api.js';
import { todayKey, buildMonthMatrix, getOverallStreak, getBadgeStates, isTaskScheduledOn } from './stats.js';
import { startClock } from './clock.js';
import { startIdleLogout } from './idle-logout.js';
import {
  showNotification, escapeHtml, showModal, formatDateTime, formatTimeLabel, setButtonLoading
} from './ui-common.js';

// 页面状态
const state = {
  user: null,
  profile: null,
  tasks: [],
  todayCheckins: [],
  allCheckins: [],
  starRecords: [],
  balance: 0,
  rewards: [],
  redemptions: [],
  messages: [],
  viewYear: new Date().getFullYear(),
  viewMonth: new Date().getMonth() + 1,
  selectedDate: todayKey(),
  currentTab: null,
  loaded: { today: false, records: false, rewards: false, messages: false }
};

/* ============ 页面入口 ============ */

export async function initChildPage() {
  // 1) 入口守卫：孩子账号（role = user）才能进
  const auth = await requireAuth(['user']);
  if (!auth) return;

  state.user = auth.user;

  // 2) 顶部实时时钟
  startClock();

  // 3) 绑事件
  bindHeader();
  bindTabs();
  bindAutoRefresh();
  startIdleLogout(); // 5 分钟没有任何操作就自动退出登录（见 js/idle-logout.js）

  // 4) 我的资料（第一次登录要填昵称和头像）
  await loadMyProfile();

  // 5) 顶部星星数，然后打开「今日」
  await refreshStarBalance();
  await loadTab('today');

  console.log('孩子端页面初始化完成');
}

/* ============ 顶部栏 ============ */

function renderHeaderUser() {
  const el = document.getElementById('header-user');
  if (!el) return;

  const nickname = state.profile?.nickname || state.user?.email || '小朋友';
  el.innerHTML = `<span class="avatar-fallback">${avatarEmoji(state.profile?.avatar_key)}</span>${escapeHtml(nickname)}`;
  el.title = '点一下可以改昵称和头像';
}

async function refreshStarBalance() {
  const { success, data, error } = await getStarBalance(state.user.id);
  if (!success) {
    console.error('读取星星余额失败:', error);
    return;
  }

  state.balance = data;
  const el = document.getElementById('star-count');
  if (el) el.textContent = data;
}

function bindHeader() {
  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      await logout();
      window.location.href = 'login.html';
    });
  }

  document.getElementById('header-user')?.addEventListener('click', () => showProfileDialog());
}

async function loadMyProfile() {
  const { success, data, error } = await getMember(state.user.id);
  if (!success) {
    console.error('读取我的资料失败:', error);
    return;
  }

  state.profile = data;
  renderHeaderUser();

  // 第一次登录：先起个名字，之后在记录里就能看到自己
  if (!data) showProfileDialog({ firstTime: true });
}

// 昵称 + 头像设置（首次登录必填，之后随时可改）
function showProfileDialog({ firstTime = false } = {}) {
  const avatarOptions = AVATARS.map((a) => `
    <label class="avatar-option">
      <input type="radio" name="avatar_key" value="${a.key}" ${a.key === (state.profile?.avatar_key || 'cat') ? 'checked' : ''}>
      <span>${a.emoji}<em>${a.label}</em></span>
    </label>
  `).join('');

  const html = `
    <p class="muted" style="margin-bottom:12px;">
      ${firstTime ? '欢迎第一次登录，先给自己起个名字吧～' : '修改我的昵称和头像'}
    </p>
    <form id="profile-form">
      <div class="form-row">
        <label for="profile-nickname">我的名字</label>
        <input class="input" type="text" id="profile-nickname" maxlength="12" placeholder="例如：小明"
               value="${escapeHtml(state.profile?.nickname || '')}" required>
      </div>
      <div class="form-row">
        <label>选个头像</label>
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

    state.profile = data;
    renderHeaderUser();
    modal.close();
    showNotification('保存好啦！', 'success');
  });
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
  // 这样既不用等着转圈，也不会一直看过期的数据
  const isFirstOpen = !state.loaded[name];
  state.loaded[name] = true;
  state.currentTab = name;
  lastAutoRefreshAt = Date.now(); // 手动点页签也算刷过一次，避免紧接着又自动刷

  // 四个页签每次打开都会重新查，「消息」也一样（家长随时可能发新留言）。
  // 已读标记写在 loadMessages() 里、且只在成功拿到最新列表之后才执行，
  // 所以不会再出现「红点被清掉了，但孩子没看到新留言」。
  await refreshTab(name, { silent: !isFirstOpen });
}

// 按页签名重新拉数据（silent = true 时不显示「加载中…」，失败也不覆盖已有画面）
async function refreshTab(name, { silent = false } = {}) {
  if (name === 'today') await loadToday({ silent });
  if (name === 'records') await loadRecords({ silent });
  if (name === 'rewards') await loadRewards({ silent });
  if (name === 'messages') await loadMessages({ silent });
}

/* ============ 回到页面自动刷新 ============ */

// 从别的标签页 / 别的 App 切回来时，静默拉一次当前页签的数据。
// 手机上「切出去看一眼再切回来」是常规动作，这样就不用教家人按 F5 了。
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

  // 顶部星星数、消息红点也顺手更新（家长可能刚加/扣了星星，或者刚发了留言）
  refreshStarBalance();
  refreshUnreadDot();
  refreshTab(state.currentTab, { silent: true }).catch((error) => {
    console.warn('自动刷新失败：', error);
  });
}

// 静默刷新失败：只在控制台留个记录，屏幕上继续显示上一次的数据，不打断孩子使用
function warnSilent(what, error) {
  console.warn(`[静默刷新] ${what} 读取失败：`, error);
}

/* ============ 今日页签 ============ */

async function loadToday({ silent = false } = {}) {
  const listEl = document.getElementById('today-list');
  if (listEl && !silent) listEl.innerHTML = '<p class="loading-text">加载中…</p>';

  const dateKey = todayKey();

  // 1) 今天该打卡的任务
  const taskResult = await getTodayTasks(dateKey);
  if (!taskResult.success) {
    if (silent) return warnSilent('今日任务', taskResult.error);
    if (listEl) listEl.innerHTML = `<p class="empty-text">读取任务失败：${escapeHtml(taskResult.error)}</p>`;
    return;
  }

  // 2) 我今天已经打过的卡
  const checkinResult = await getCheckinsByDate(state.user.id, dateKey);
  if (!checkinResult.success) {
    if (silent) return warnSilent('今日打卡', checkinResult.error);
    if (listEl) listEl.innerHTML = `<p class="empty-text">读取打卡记录失败：${escapeHtml(checkinResult.error)}</p>`;
    return;
  }

  state.tasks = taskResult.data;
  state.todayCheckins = checkinResult.data;
  renderTodayList();
}

function renderTodayList() {
  const listEl = document.getElementById('today-list');
  if (!listEl) return;

  const checkinMap = new Map(state.todayCheckins.map((c) => [c.task_id, c]));

  if (!state.tasks.length) {
    listEl.innerHTML = `
      <div class="empty-box">
        <p class="empty-emoji">🎉</p>
        <p class="empty-text">今天没有任务，好好休息一下吧！</p>
      </div>
    `;
    renderTodayProgress();
    return;
  }

  listEl.innerHTML = state.tasks.map((task) => renderTaskCheckinCard(task, checkinMap.get(task.id))).join('');

  // 打卡按钮
  listEl.querySelectorAll('[data-checkin-task]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const task = state.tasks.find((t) => t.id === btn.dataset.checkinTask);
      if (task) openCheckinDialog(task);
    });
  });

  // 点照片看大图
  listEl.querySelectorAll('[data-photo-url]').forEach((img) => {
    img.addEventListener('click', () => openImagePreview(img.dataset.photoUrl));
  });

  renderTodayProgress();
}

function renderTaskCheckinCard(task, checkin) {
  const done = checkin?.is_checked === true;
  const deadline = formatTimeLabel(task.deadline_time);
  const typeLabel = { checkbox: '点一下就行', photo: '要拍照', text: '写点文字' }[task.checkin_type] || '点一下就行';

  return `
    <div class="task-checkin-card ${done ? 'done' : ''}">
      <div class="task-checkin-main">
        <div class="task-checkin-title">
          <span class="tick">${done ? '✅' : '⭕'}</span>
          <div>
            <h3>${escapeHtml(task.title)}</h3>
            <p class="muted">
              ${task.subject ? `📚 ${escapeHtml(task.subject)} · ` : ''}⏰ ${deadline || '不限'} · ⭐ +${task.star_reward || 0} · 🖊 ${typeLabel}
            </p>
          </div>
        </div>
        ${checkin?.checkin_note ? `<p class="checkin-note">我的记录：${escapeHtml(checkin.checkin_note)}</p>` : ''}
        ${checkin?.photo_url ? `<img class="checkin-photo" src="${checkin.photo_url}" alt="打卡照片" data-photo-url="${checkin.photo_url}">` : ''}
      </div>
      <div class="task-checkin-actions">
        <button class="btn ${done ? '' : 'btn-primary btn-lg'}" data-checkin-task="${task.id}">
          ${done ? '重新记录' : '我要打卡'}
        </button>
      </div>
    </div>
  `;
}

function renderTodayProgress() {
  const el = document.getElementById('today-progress');
  if (!el) return;

  const total = state.tasks.length;
  const doneCount = state.tasks.filter((task) => {
    const found = state.todayCheckins.find((c) => c.task_id === task.id);
    return found?.is_checked === true;
  }).length;

  el.textContent = total ? `已完成 ${doneCount}/${total}` : '';
  el.classList.toggle('all-done', total > 0 && doneCount === total);
}

// 看大图
function openImagePreview(url) {
  if (!url) return;
  showModal(`<img class="preview-photo" src="${url}" alt="打卡照片">`, { title: '打卡照片' });
}

// 打卡弹窗（勾选 / 拍照 / 文字三种类型都走这一个弹窗）
function openCheckinDialog(task) {
  const existing = state.todayCheckins.find((c) => c.task_id === task.id);
  const needPhoto = task.checkin_type === 'photo';
  const needNote = task.checkin_type !== 'checkbox';
  const photoRequired = needPhoto && !existing?.photo_url;

  const html = `
    <form id="checkin-form">
      <p class="muted" style="margin-bottom:12px;">
        ${escapeHtml(task.title)}${task.subject ? ` · ${escapeHtml(task.subject)}` : ''} · ⭐ +${task.star_reward || 0}
      </p>
      <div class="form-row">
        <label for="checkin-photo">${needPhoto ? `拍照 / 选照片${photoRequired ? '（必选）' : '（可选）'}` : '想拍照也可以（可选）'}</label>
        <input class="input" type="file" id="checkin-photo" accept="image/*" ${photoRequired ? 'required' : ''}>
      </div>
      <div class="form-row">
        <label for="checkin-note">说一句</label>
        <textarea class="input" id="checkin-note" maxlength="200" placeholder="今天做得怎么样？">${escapeHtml(existing?.checkin_note || '')}</textarea>
      </div>
      <div class="modal-actions">
        <button type="submit" class="btn btn-primary" id="checkin-submit">提交打卡 ⭐+${task.star_reward || 0}</button>
        <button type="button" class="btn" data-modal-close>取消</button>
      </div>
    </form>
  `;

  const modal = showModal(html, { title: '打卡' });

  modal.element.querySelector('#checkin-form').addEventListener('submit', async (e) => {
    e.preventDefault();

    const submitBtn = modal.element.querySelector('#checkin-submit');
    const note = modal.element.querySelector('#checkin-note').value;
    const photoInput = modal.element.querySelector('#checkin-photo');
    const file = photoInput?.files?.[0] || null;

    setButtonLoading(submitBtn, true, '提交中…');
    const { success, error, starAdded } = await submitCheckin({ task, note, photoFile: file });
    setButtonLoading(submitBtn, false);

    if (!success) {
      showNotification(error, 'error');
      return;
    }

    modal.close();
    showNotification(starAdded > 0 ? `打卡成功！获得 ${starAdded} 颗星星 ⭐` : '打卡成功！', 'success');
    await refreshStarBalance();
    await loadToday();
  });
}

/* ============ 记录页签 ============ */

async function loadRecords({ silent = false } = {}) {
  const calEl = document.getElementById('child-calendar');
  if (calEl && !silent) calEl.innerHTML = '<p class="loading-text">加载中…</p>';

  const { success, data, error } = await getCheckinsByUser(state.user.id, { limit: 800 });
  if (!success) {
    if (silent) return warnSilent('打卡记录', error);
    if (calEl) calEl.innerHTML = `<p class="empty-text">读取记录失败：${escapeHtml(error)}</p>`;
    return;
  }

  applyCheckins(data);
}

function renderStreakText() {
  const el = document.getElementById('streak-text');
  if (!el) return;

  const keys = state.allCheckins.filter((c) => c.is_checked !== false).map((c) => c.checkin_date);
  const streak = getOverallStreak(keys);

  el.textContent = streak > 0 ? `🔥 连续打卡 ${streak} 天` : '今天还没打卡';
}

// 打卡记录更新后统一重画：连续天数、日历、当天详情
// （勋章墙用的是同一份 state.allCheckins，由 loadRewards() 自己再画一次）
function applyCheckins(data) {
  if (!Array.isArray(data)) return;

  state.allCheckins = data;
  renderStreakText();
  renderChildCalendar();
  renderChildDayDetail(state.selectedDate);
}

function renderChildCalendar() {
  const wrap = document.getElementById('child-calendar');
  if (!wrap) return;

  const weeks = buildMonthMatrix(state.viewYear, state.viewMonth);
  const weekdays = ['一', '二', '三', '四', '五', '六', '日'];
  const doneSet = new Set(state.allCheckins.filter((c) => c.is_checked !== false).map((c) => c.checkin_date));

  wrap.innerHTML = `
    <div class="card calendar-card">
      <div class="calendar-head">
        <button class="btn btn-sm" id="child-prev-month">‹ 上个月</button>
        <b>${state.viewYear} 年 ${state.viewMonth} 月</b>
        <button class="btn btn-sm" id="child-next-month">下个月 ›</button>
      </div>
      <div class="calendar-grid">
        ${weekdays.map((w) => `<div class="calendar-weekday">${w}</div>`).join('')}
        ${weeks.flat().map((cell) => `
          <div class="calendar-cell ${cell.inMonth ? '' : 'out-month'} ${cell.isToday ? 'is-today' : ''} ${cell.date === state.selectedDate ? 'selected' : ''}"
               data-date="${cell.date}">
            <span class="cell-day">${cell.day}</span>
            <span class="cell-dots">${doneSet.has(cell.date) ? '<i class="dot"></i>' : ''}</span>
          </div>
        `).join('')}
      </div>
    </div>
  `;

  wrap.querySelector('#child-prev-month')?.addEventListener('click', () => shiftMonth(-1));
  wrap.querySelector('#child-next-month')?.addEventListener('click', () => shiftMonth(1));

  wrap.querySelectorAll('.calendar-cell').forEach((cell) => {
    cell.addEventListener('click', () => {
      state.selectedDate = cell.dataset.date;
      renderChildCalendar();
      renderChildDayDetail(state.selectedDate);
    });
  });
}

// 上个月 / 下个月
function shiftMonth(step) {
  const d = new Date(state.viewYear, state.viewMonth - 1 + step, 1);
  state.viewYear = d.getFullYear();
  state.viewMonth = d.getMonth() + 1;
  renderChildCalendar();
}

function renderChildDayDetail(dateKey) {
  const el = document.getElementById('child-day-detail');
  if (!el) return;

  const list = state.allCheckins.filter((c) => c.checkin_date === dateKey && c.is_checked !== false);

  if (!list.length) {
    el.innerHTML = `<div class="card"><h3>${dateKey}</h3><p class="empty-text">这一天还没有打卡记录</p></div>`;
    return;
  }

  el.innerHTML = `
    <div class="card">
      <h3>${dateKey} 的打卡（${list.length} 条）</h3>
      ${list.map((c) => `
        <div class="day-detail-item">
          <div class="row">
            <b>${escapeHtml(c.tasks?.title || '任务')}</b>
            <span class="tag tag-success">⭐ +${c.stars_earned || 0}</span>
            ${c.photo_url ? '<span class="tag tag-info">有照片</span>' : ''}
          </div>
          ${c.checkin_note ? `<p class="muted">${escapeHtml(c.checkin_note)}</p>` : ''}
          ${c.photo_url ? `<img class="checkin-photo" src="${c.photo_url}" alt="打卡照片" data-photo-url="${c.photo_url}">` : ''}
        </div>
      `).join('')}
    </div>
  `;

  el.querySelectorAll('[data-photo-url]').forEach((img) => {
    img.addEventListener('click', () => openImagePreview(img.dataset.photoUrl));
  });
}

/* ============ 奖励页签 ============ */

async function loadRewards({ silent = false } = {}) {
  const shopEl = document.getElementById('shop-list');
  if (shopEl && !silent) shopEl.innerHTML = '<p class="loading-text">加载中…</p>';

  // 奖励池、星星余额、星星流水、我的兑换申请，以及打卡记录一起查。
  // 打卡记录是「勋章墙 / 连续打卡 N 天」的算料：这个天数必须和星星一样是刚查回来的，
  // 不能吃「今日」「记录」页签留下的旧数组（家长删掉打卡后星星立刻变 0，天数也要跟着变 0）。
  const [rewardResult, balanceResult, recordResult, redemptionResult, checkinResult] = await Promise.all([
    getRewards(true),
    getStarBalance(state.user.id),
    getStarRecords(state.user.id, 20),
    getRedemptions({ userId: state.user.id, limit: 50 }),
    getCheckinsByUser(state.user.id, { limit: 800 })
  ]);

  if (!rewardResult.success) {
    if (silent) return warnSilent('奖励', rewardResult.error);
    if (shopEl) shopEl.innerHTML = `<p class="empty-text">读取奖励失败：${escapeHtml(rewardResult.error)}</p>`;
    return;
  }

  state.rewards = rewardResult.data;
  state.starRecords = recordResult.success ? recordResult.data : [];
  state.redemptions = redemptionResult.success ? redemptionResult.data : [];
  if (balanceResult.success) state.balance = balanceResult.data;

  // 先刷新打卡数据（查失败就保持上一次的，不会把勋章墙清空），再画勋章墙
  applyCheckins(checkinResult.success ? checkinResult.data : null);
  renderBadges();
  renderShop();
  renderMyRedemptions();
  await refreshStarBalance();
}

// 勋章墙 + 星星流水
function renderBadges() {
  const el = document.getElementById('badge-wall');
  if (!el) return;

  // 只认 state.allCheckins：loadRewards() 每次打开「奖励」页都会把最新打卡记录查回来（见下面的 applyCheckins）。
  // 旧写法是「allCheckins 为空就退回 state.todayCheckins」——家长把打卡删掉后 allCheckins 正好是空数组，
  // 于是退回「今日」页签留下的旧数组，勋章墙就会一直显示那条已经被删掉的打卡（星星已扣回 0，这里还写差 6 天）。
  const keys = state.allCheckins.filter((c) => c.is_checked !== false).map((c) => c.checkin_date);
  const streak = getOverallStreak(keys);
  const badges = getBadgeStates(streak);

  el.innerHTML = `
    <div class="card">
      <div class="card-head">
        <h3>我的勋章墙</h3>
        <span class="muted">连续打卡 ${streak} 天</span>
      </div>
      <div class="badge-grid">
        ${badges.map((b) => `
          <div class="badge-item ${b.unlocked ? 'unlocked' : ''}">
            <span class="badge-emoji">${b.emoji}</span>
            <span class="badge-name">${b.name}</span>
            <span class="muted">${b.unlocked ? '已点亮 ✨' : `还差 ${b.days - streak} 天`}</span>
          </div>
        `).join('')}
      </div>
      <p class="muted" style="margin-top:14px;">星星记录（最近 ${state.starRecords.length} 条）</p>
      ${state.starRecords.length ? state.starRecords.map((r) => `
        <div class="star-record-item">
          <span>${escapeHtml(r.reason || '星星变动')}</span>
          <span class="${r.stars_change >= 0 ? 'star-plus' : 'star-minus'}">${r.stars_change >= 0 ? '+' : ''}${r.stars_change}</span>
        </div>
      `).join('') : '<p class="empty-text">还没有星星记录</p>'}
    </div>
  `;
}

// 奖励商店
function renderShop() {
  const el = document.getElementById('shop-list');
  if (!el) return;

  if (!state.rewards.length) {
    el.innerHTML = '<div class="card"><p class="empty-text">家长还没有设置奖励，去提醒一下吧～</p></div>';
    return;
  }

  el.innerHTML = `
    <div class="card">
      <div class="card-head">
        <h3>奖励商店</h3>
        <span class="muted">我有 ${state.balance} ⭐</span>
      </div>
      ${state.rewards.map((r) => {
        const pending = state.redemptions.find((x) => x.reward_id === r.id && x.status === 'pending');
        const affordable = state.balance >= r.stars_required;

        return `
          <div class="reward-item">
            <div>
              <div><span class="reward-emoji">${r.emoji || '🎁'}</span> <b>${escapeHtml(r.name)}</b></div>
              ${r.description ? `<p class="muted">${escapeHtml(r.description)}</p>` : ''}
            </div>
            <div class="row">
              <span class="reward-cost">⭐ ${r.stars_required}</span>
              ${pending
                ? '<span class="tag tag-warning">等待家长审核</span>'
                : `<button class="btn btn-sm ${affordable ? 'btn-primary' : ''}" data-redeem="${r.id}" ${affordable ? '' : 'disabled'}>兑换</button>`}
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;

  el.querySelectorAll('[data-redeem]').forEach((btn) => {
    btn.addEventListener('click', () => redeemReward(btn.dataset.redeem));
  });
}

async function redeemReward(rewardId) {
  const reward = state.rewards.find((r) => r.id === rewardId);
  if (!reward) return;

  const { success, error } = await requestRedemption(reward);
  if (!success) {
    showNotification(error, 'error');
    return;
  }

  showNotification('申请好啦，等家长同意就能拿到奖励啦', 'success');
  await loadRewards();
}

// 我的兑换申请
function renderMyRedemptions() {
  const el = document.getElementById('my-redemptions');
  if (!el) return;

  if (!state.redemptions.length) {
    el.innerHTML = '';
    return;
  }

  const statusText = {
    pending: ['tag-warning', '等待家长审核'],
    approved: ['tag-success', '已通过 🎉'],
    rejected: ['tag-danger', '被驳回']
  };

  el.innerHTML = `
    <div class="card">
      <h3>我的兑换申请</h3>
      ${state.redemptions.map((r) => {
        const [cls, text] = statusText[r.status] || ['tag', r.status];
        return `
          <div class="redemption-item">
            <div class="row">
              <span>${r.reward_emoji || '🎁'} ${escapeHtml(r.reward_name)}</span>
              <span class="tag ${cls}">${text}</span>
            </div>
            <span class="muted">⭐ ${r.stars_spent} · 申请时间 ${formatDateTime(r.created_at)}</span>
            ${r.review_notes ? `<span class="muted">家长说：${escapeHtml(r.review_notes)}</span>` : ''}
          </div>
        `;
      }).join('')}
    </div>
  `;
}

/* ============ 消息页签 ============ */

async function loadMessages({ silent = false } = {}) {
  const listEl = document.getElementById('message-list');
  if (listEl && !silent) listEl.innerHTML = '<p class="loading-text">加载中…</p>';

  const { success, data, error } = await getMessagesForUser(state.user.id, 50);
  if (!success) {
    if (silent) return warnSilent('留言', error);
    if (listEl) listEl.innerHTML = `<p class="empty-text">读取留言失败：${escapeHtml(error)}</p>`;
    return;
  }

  state.messages = data;
  renderMessages();

  // 已读标记放在「成功拿到最新列表并渲染出来」之后：孩子确实看到这些留言了才清红点。
  // （以前是在切页签时先标记已读、再判断要不要重新加载，会出现红点消失了却没看到新留言。）
  markMessagesReadSoon();
}

function renderMessages() {
  const el = document.getElementById('message-list');
  if (!el) return;

  if (!state.messages.length) {
    el.innerHTML = `
      <div class="empty-box">
        <p class="empty-emoji">💬</p>
        <p class="empty-text">还没有留言，先把今天的任务完成吧</p>
      </div>
    `;
    return;
  }

  el.innerHTML = state.messages.map((m) => `
    <div class="card message-item ${m.is_read ? '' : 'unread'}">
      <p class="message-content">${escapeHtml(m.content)}</p>
      <span class="message-meta">
        ${m.is_read ? '' : '<b class="unread-tag">新</b>'}${formatDateTime(m.created_at)}
      </span>
    </div>
  `).join('');
}

// 打开消息页后延迟一小会儿再标记已读：红点不会一闪就没，孩子来得及看见
function markMessagesReadSoon() {
  clearTimeout(markMessagesReadSoon.timer);
  markMessagesReadSoon.timer = setTimeout(async () => {
    if (!state.user?.id) return;

    const { success } = await markAllMessagesRead(state.user.id);
    if (!success) return;

    state.messages = state.messages.map((m) => ({ ...m, is_read: true }));
    await refreshUnreadDot();
  }, 1200);
}

// 未读红点（用户信息还没准备好就稍后再试）
async function refreshUnreadDot() {
  const dot = document.getElementById('message-dot');
  if (!dot) return;

  if (!state.user?.id) {
    clearTimeout(refreshUnreadDot.timer);
    refreshUnreadDot.timer = setTimeout(refreshUnreadDot, 800);
    return;
  }

  const { success, data } = await getUnreadCount(state.user.id);
  if (!success) return;

  dot.hidden = !data;
  dot.textContent = data > 9 ? '9+' : String(data || '');
}

// 进页面先查一次红点，之后每分钟刷新（家长随时可能发留言）
setTimeout(refreshUnreadDot, 600);
setInterval(refreshUnreadDot, 60000);



