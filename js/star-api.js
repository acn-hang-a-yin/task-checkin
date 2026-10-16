// 星星流水模块 —— 对应数据库 star_records 表
// 得星为正数（打卡自动得星 / 家长手动加星），扣星为负数（家长扣星 / 兑换扣星）
import { getSupabaseClient } from './supabase-config.js';
import { getCurrentUser, isAdmin } from './auth.js';

/**
 * 写一条星星流水（所有加星 / 扣星都走这里）
 * @param {{userId: string, starsChange: number, reason?: string, changeType?: 'auto'|'manual'|'deduct'|'redeem'}} params
 * @returns {Promise<{success: boolean, data?: object, error?: string}>}
 */
export async function insertStarRecord({ userId, starsChange, reason = '', changeType = 'auto' }) {
  try {
    if (!userId) throw new Error('缺少星星归属用户');
    if (!starsChange) throw new Error('星星数量不能为 0');

    const me = await getCurrentUser();
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('star_records')
      .insert({
        user_id: userId,
        stars_change: starsChange,
        reason,
        change_type: changeType,
        created_by: me?.id || null
      })
      .select();

    if (error) throw new Error(error.message);
    return { success: true, data: data[0] };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// 读取星星流水（最新在最前面）
export async function getStarRecords(userId, limit = 50) {
  try {
    if (!userId) throw new Error('缺少用户');

    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('star_records')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw new Error(error.message);
    return { success: true, data: data || [] };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// 星星余额：前端把所有流水的 stars_change 求和（家庭数据量小，实时算足够快）
export async function getStarBalance(userId) {
  try {
    if (!userId) throw new Error('缺少用户');

    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('star_records')
      .select('stars_change')
      .eq('user_id', userId);

    if (error) throw new Error(error.message);

    const total = (data || []).reduce((sum, row) => sum + (row.stars_change || 0), 0);
    return { success: true, data: total };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// 家长手动加星（批量传 userIds 也能用）
export async function addStars(userIds, stars, reason = '家长奖励') {
  try {
    if (!(await isAdmin())) throw new Error('权限不足：只有家长可以加星');

    const amount = Math.abs(Number(stars) || 0);
    if (!amount) throw new Error('请填写要加的星星数');

    const list = Array.isArray(userIds) ? userIds : [userIds];
    if (!list.length) throw new Error('请选择孩子');

    const results = [];
    for (const userId of list) {
      results.push(await insertStarRecord({ userId, starsChange: amount, reason, changeType: 'manual' }));
    }

    const failed = results.find((r) => !r.success);
    if (failed) throw new Error(failed.error);

    return { success: true, data: results.map((r) => r.data) };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// 家长手动扣星（写负数流水，余额实时减少）
export async function deductStars(userId, stars, reason = '家长扣星') {
  try {
    if (!(await isAdmin())) throw new Error('权限不足：只有家长可以扣星');

    const amount = Math.abs(Number(stars) || 0);
    if (!amount) throw new Error('请填写要扣的星星数');

    return insertStarRecord({ userId, starsChange: -amount, reason, changeType: 'deduct' });
  } catch (error) {
    return { success: false, error: error.message };
  }
}
