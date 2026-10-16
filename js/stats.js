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

// 说明：原来的 countScheduledDays()（算区间内应打卡天数）已并入 getCompletionRate() 的循环，
// getStreakForTask()（单个任务的连续天数）没有任何页面在用 —— 页面统一显示
// getOverallStreak()（当天完成过任意任务就算打卡日），这两个函数已删除。

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
 * 算出「完成率」该统计哪一段时间（口径要和日历的「应打卡」一致：只算任务处于进行中的那些天）
 * - 已结束：统计到最后一次打卡那天（一次都没打过卡 → 返回 null，页面显示「—」，不显示 0%）
 * - 已暂停：统计到「暂停那一刻」——暂停时 task-api.js 会写 tasks.updated_at，所以暂停日之后
 *   不再往分母里加天数（库里没有暂停历史，这是最贴近的做法；详见文档第 7.3 节）
 * - 进行中：从任务创建日统计到今天
 * @param {object} task 任务（需要 created_at / status / updated_at）
 * @param {string[]} checkinDateKeys 这个任务的打卡日期列表
 * @returns {{fromKey: string, toKey: string}|null} null 表示「没有可统计的历史」
 */
export function getRateRange(task, checkinDateKeys = []) {
  const keys = [...new Set((checkinDateKeys || []).filter(Boolean))].sort();
  const fromKey = toDateKey(task?.created_at) || todayKey();

  if (task?.status === 'ended') {
    if (!keys.length) return null;
    return { fromKey, toKey: keys[keys.length - 1] };
  }

  if (task?.status === 'paused') {
    const pausedAt = toDateKey(task?.updated_at);
    // 异常数据（updated_at 早于创建日 / 读不到）就退回今天，宁可多算也不要算错区间
    return { fromKey, toKey: pausedAt && pausedAt >= fromKey ? pausedAt : todayKey() };
  }

  return { fromKey, toKey: todayKey() };
}

/**
 * 完成率
 * 分母 = 区间内「该打卡」的天数，分子 = 区间内真正打过卡的天数（同一任务同一天只算 1 天）
 * @param {object} task 任务
 * @param {string[]} checkinDateKeys 打卡日期列表
 * @param {{fromKey?: string, toKey?: string}} options 统计区间，一般由 getRateRange() 算好
 * @returns {{expected: number, done: number, rate: number}} expected=应打卡天数，done=实际打卡天数，rate=百分比
 */
export function getCompletionRate(task, checkinDateKeys, options = {}) {
  // 不传区间时直接按 getRateRange() 的口径算：
  // 进行中 → 到今天；已暂停 → 到暂停那天；已结束 → 到最后一次打卡
  // （这样即使调用方只传两个参数，也不会再出现「暂停任务分母一直涨」的老问题）
  const range = getRateRange(task, checkinDateKeys);

  const fromKey = options.fromKey || range?.fromKey || toDateKey(task?.created_at) || todayKey();
  const toKey = options.toKey || range?.toKey || todayKey();
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
