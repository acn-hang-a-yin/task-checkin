// 统计模块：连续打卡天数 / 完成率 / 月历数据 / 导出 CSV / 勋章
// 全部在前端实时计算：不建视图、不落统计表（家庭数据量小，完全够快）
// 说明：本模块除了 downloadCsv() 以外都是纯函数，方便单独测试

/** 数字补零：7 -> '07' */
const pad = (n) => String(n).padStart(2, '0');

/** 把 Date 或时间字符串转成 'YYYY-MM-DD'（本地时区，避免 UTC 偏移导致日期差一天） */
export function toDateKey(value = new Date()) {
  if (typeof value === 'string') {
    // 已经是 'YYYY-MM-DD' 就直接返回，避免被当成 UTC 时间解析
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return '';
    return `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}`;
  }

  const d = value instanceof Date ? value : new Date(value);
  if (!d || Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 'YYYY-MM-DD' -> 本地 0 点的 Date */
export function parseDateKey(key) {
  const [y, m, d] = String(key).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

/** 日期加减天数，返回新的 Date */
export function addDays(date, days) {
  const d = new Date(date.getTime());
  d.setDate(d.getDate() + days);
  return d;
}

/** 今天 'YYYY-MM-DD' */
export function todayKey() {
  return toDateKey(new Date());
}

/** 周几：1=周一 … 7=周日（和数据库 cycle_days 的约定一致） */
export function getWeekday(dateKey) {
  return ((parseDateKey(dateKey).getDay() + 6) % 7) + 1;
}

/** 这个任务在某天要不要打卡 */
export function isTaskScheduledOn(task, dateKey) {
  if (!task) return false;
  if (task.status === 'ended') return false;
  if (task.cycle_type === 'weekly') {
    const days = Array.isArray(task.cycle_days) ? task.cycle_days.map(Number) : [];
    if (!days.length) return false; // 每周任务没勾周几 = 不打卡
    return days.includes(getWeekday(dateKey));
  }
  return true; // 默认每天
}

/** 任务从 fromKey 到 toKey 之间「应打卡」的天数 */
export function countScheduledDays(task, fromKey, toKey) {
  let count = 0;
  let cursor = parseDateKey(fromKey);
  let guard = 0;

  while (toDateKey(cursor) <= toKey && guard < 3660) {
    if (isTaskScheduledOn(task, toDateKey(cursor))) count++;
    cursor = addDays(cursor, 1);
    guard++;
  }

  return count;
}

/**
 * 某一个任务的「当前连续打卡天数」
 * 规则：从今天往回数；今天还没打卡就从昨天开始数（避免早上显示 0）；
 *       遇到「应打卡但没打」的天就停；非应打卡日（如每周任务没安排的那天）自动跳过。
 */
export function getStreakForTask(task, checkinDateKeys) {
  const done = new Set(checkinDateKeys || []);
  let cursor = parseDateKey(todayKey());

  if (!done.has(toDateKey(cursor))) cursor = addDays(cursor, -1);

  let streak = 0;
  for (let guard = 0; guard < 3660; guard++) {
    const key = toDateKey(cursor);

    if (done.has(key)) {
      streak++;
      cursor = addDays(cursor, -1);
      continue;
    }

    if (!isTaskScheduledOn(task, key)) {
      cursor = addDays(cursor, -1);
      continue;
    }

    break; // 应打卡却没打 → 断卡
  }

  return streak;
}

/** 综合连续打卡天数：只要当天完成过任意一个任务就算打卡日 */
export function getOverallStreak(checkinDateKeys) {
  const done = new Set(checkinDateKeys || []);
  let cursor = parseDateKey(todayKey());

  if (!done.has(toDateKey(cursor))) cursor = addDays(cursor, -1);

  let streak = 0;
  for (let guard = 0; guard < 3660; guard++) {
    if (!done.has(toDateKey(cursor))) break;
    streak++;
    cursor = addDays(cursor, -1);
  }

  return streak;
}

/**
 * 完成率
 * @returns {{expected: number, done: number, rate: number}} expected=应打卡天数，done=实际打卡天数，rate=百分比
 */
export function getCompletionRate(task, checkinDateKeys, options = {}) {
  const fromKey = options.fromKey || toDateKey(task.created_at) || todayKey();
  const toKey = options.toKey || todayKey();
  const done = new Set(checkinDateKeys || []);

  let expected = 0;
  let doneCount = 0;
  let cursor = parseDateKey(fromKey);

  for (let guard = 0; guard < 3660 && toDateKey(cursor) <= toKey; guard++) {
    const key = toDateKey(cursor);
    if (isTaskScheduledOn(task, key)) {
      expected++;
      if (done.has(key)) doneCount++;
    }
    cursor = addDays(cursor, 1);
  }

  return { expected, done: doneCount, rate: expected ? Math.round((doneCount / expected) * 100) : 0 };
}

/** 生成月历数据（周一起始、固定 6 行 × 7 列），用 CSS Grid 手写月历 */
export function buildMonthMatrix(year, month) {
  const first = new Date(year, month - 1, 1);
  const startOffset = (first.getDay() + 6) % 7; // 周一 = 0
  const start = addDays(first, -startOffset);

  const weeks = [];
  for (let w = 0; w < 6; w++) {
    const week = [];
    for (let i = 0; i < 7; i++) {
      const d = addDays(start, w * 7 + i);
      const key = toDateKey(d);
      week.push({
        date: key,
        day: d.getDate(),
        inMonth: d.getMonth() === month - 1,
        isToday: key === todayKey(),
        weekday: getWeekday(key)
      });
    }
    weeks.push(week);
  }

  return weeks;
}

/** 勋章墙：7 / 21 / 30 天，达到即点亮（纯前端判断，不落库） */
export const BADGES = [
  { days: 7, emoji: '🌟', name: '坚持 7 天' },
  { days: 21, emoji: '🏅', name: '坚持 21 天' },
  { days: 30, emoji: '🏆', name: '坚持 30 天' }
];

/** 根据连续天数算出勋章点亮情况 */
export function getBadgeStates(streak) {
  return BADGES.map((badge) => ({ ...badge, unlocked: (streak || 0) >= badge.days }));
}

/** 单个 CSV 单元格：统一加双引号并转义内部引号 */
function csvCell(value) {
  const text = value === null || value === undefined ? '' : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

/** 把二维数组拼成 CSV 文本 */
export function buildCsvContent(rows) {
  return (rows || []).map((row) => row.map(csvCell).join(',')).join('\r\n');
}

/** 导出 CSV 并直接下载（加 BOM，Excel 打开不乱码，不需要任何库） */
export function downloadCsv(filename, rows) {
  const content = '\uFEFF' + buildCsvContent(rows);
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();

  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
