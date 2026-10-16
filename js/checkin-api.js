// 打卡API模块
// 规则：同一任务、同一个人、同一天只保留一条记录（靠数据库唯一约束 task_id + user_id + checkin_date）
import { getSupabaseClient } from './supabase-config.js';
import { getCurrentUser, isAdmin } from './auth.js';
import { insertStarRecord } from './star-api.js';
import { todayKey } from './stats.js';

// 存打卡照片的 Storage 桶（第 7 章第 1 步已创建）
const BUCKET = 'checkin-media';
// 照片大小上限 5MB（前端先拦一道，省得白等上传）
const MAX_PHOTO_SIZE = 5 * 1024 * 1024;
// 打卡记录统一带出的任务字段
const CHECKIN_SELECT = '*, tasks (id, title, subject, description, cycle_type, cycle_days, deadline_time, checkin_type, star_reward, status, created_at)';

/**
 * 上传打卡照片到 Storage，返回公网 URL
 * @param {File} file 用户选的照片
 * @param {{userId?: string, taskId?: string, dateKey?: string}} options
 */
export async function uploadCheckinPhoto(file, { userId = null, taskId = 'task', dateKey = todayKey() } = {}) {
  try {
    if (!file) throw new Error('请先选择一张照片');
    if (file.size > MAX_PHOTO_SIZE) throw new Error('照片太大了，请选择 5MB 以内的照片');

    const me = userId || (await getCurrentUser())?.id;
    if (!me) throw new Error('用户未登录');

    const supabase = await getSupabaseClient();
    const ext = (String(file.name).split('.').pop() || 'jpg').toLowerCase();
    const path = `${me}/${taskId}/${dateKey}-${Date.now()}.${ext}`;

    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(path, file, { upsert: true, cacheControl: '3600' });

    if (error) throw new Error(`照片上传失败：${error.message}`);

    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
    return { success: true, data: data.publicUrl };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// 读取某个用户某一天的打卡记录（孩子端「今日」页用）
export async function getCheckinsByDate(userId, dateKey = todayKey()) {
  try {
    if (!userId) throw new Error('缺少用户');

    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('task_checkins')
      .select(CHECKIN_SELECT)
      .eq('user_id', userId)
      .eq('checkin_date', dateKey);

    if (error) throw new Error(error.message);
    return { success: true, data: data || [] };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// 读取某个用户的打卡记录（家长端「记录」页、孩子端日历用），可按日期区间过滤
export async function getCheckinsByUser(userId, { from = null, to = null, limit = 800 } = {}) {
  try {
    if (!userId) throw new Error('缺少用户');

    const supabase = await getSupabaseClient();
    let query = supabase
      .from('task_checkins')
      .select(CHECKIN_SELECT)
      .eq('user_id', userId)
      .order('checkin_date', { ascending: false })
      .limit(limit);

    if (from) query = query.gte('checkin_date', from);
    if (to) query = query.lte('checkin_date', to);

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return { success: true, data: data || [] };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// 说明：旧版单页面（js/ui.js）用的 getUserCheckins() / getAllUserCheckins() 已随它一起删除。
// 现在家长端用 getCheckinsByUser()、孩子端用 getCheckinsByDate() 读记录，submitCheckin() 写记录。

/**
 * 提交打卡（勾选 / 照片 / 文字）
 * 用 upsert（冲突列：task_id + user_id + checkin_date），同一天重复提交只会覆盖，不会产生重复记录
 * @param {{task: object, note?: string, photoFile?: File|null}} params
 * @returns {Promise<{success: boolean, data?: object, starAdded?: number, error?: string}>}
 */
export async function submitCheckin({ task, note = '', photoFile = null }) {
  try {
    const user = await getCurrentUser();
    if (!user) throw new Error('用户未登录');
    if (!task || !task.id) throw new Error('缺少任务信息');

    const dateKey = todayKey();
    const supabase = await getSupabaseClient();

    // 1) 先看今天这条有没有打过卡（用来判断要不要发星星，避免重复得星）
    const { data: existing } = await supabase
      .from('task_checkins')
      .select('id, stars_earned')
      .eq('task_id', task.id)
      .eq('user_id', user.id)
      .eq('checkin_date', dateKey)
      .maybeSingle();

    // 2) 有照片就先上传，拿到公网 URL
    let photoUrl = null;
    if (photoFile) {
      const uploadResult = await uploadCheckinPhoto(photoFile, { userId: user.id, taskId: task.id, dateKey });
      if (!uploadResult.success) throw new Error(uploadResult.error);
      photoUrl = uploadResult.data;
    }

    // 3) 写入 / 更新今天的打卡记录
    const starsEarned = Math.max(0, Number(task.star_reward) || 0);
    const payload = {
      task_id: task.id,
      user_id: user.id,
      checkin_date: dateKey,
      is_checked: true,
      checkin_note: String(note || '').trim() || null,
      stars_earned: starsEarned,
      updated_at: new Date()
    };
    if (photoUrl) payload.photo_url = photoUrl;

    const { data, error } = await supabase
      .from('task_checkins')
      .upsert(payload, { onConflict: 'task_id,user_id,checkin_date' })
      .select();

    if (error) throw new Error(error.message);

    // 4) 只有「第一次」打卡才自动发星星（重复提交不会重复发）
    let starAdded = 0;
    const alreadyEarned = Number(existing?.stars_earned) || 0;

    if (starsEarned > 0 && alreadyEarned <= 0) {
      const starResult = await insertStarRecord({
        userId: user.id,
        starsChange: starsEarned,
        reason: `完成：${task.title || '任务'}`,
        changeType: 'auto'
      });

      if (starResult.success) starAdded = starsEarned;
    }

    return { success: true, data: data[0], starAdded };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * 家长端：删除打卡记录（用于纠正误操作）
 * 如果这条记录发过星星，会同时写一条扣星流水，保证星星余额对得上
 */
export async function deleteCheckin(checkin) {
  try {
    if (!(await isAdmin())) throw new Error('权限不足：只有家长可以删除打卡记录');
    if (!checkin || !checkin.id) throw new Error('缺少打卡记录');

    const supabase = await getSupabaseClient();
    const { error } = await supabase.from('task_checkins').delete().eq('id', checkin.id);
    if (error) throw new Error(error.message);

    const stars = Math.abs(Number(checkin.stars_earned) || 0);
    if (stars > 0) {
      await insertStarRecord({
        userId: checkin.user_id,
        starsChange: -stars,
        reason: `撤销打卡：${checkin.tasks?.title || '任务'}`,
        changeType: 'deduct'
      });
    }

    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// 说明：旧版单页面的 isChecked() / toggleCheckin()（一次点一下切换打卡）已随 js/ui.js 一起删除。
// 孩子端「今日」卡片的已完成状态来自 getCheckinsByDate()，打卡统一走 submitCheckin()。
