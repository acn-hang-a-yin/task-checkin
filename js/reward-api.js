// 奖励模块 —— 对应数据库 rewards（奖励池）与 reward_redemptions（兑换申请）两张表
import { getSupabaseClient } from './supabase-config.js';
import { getCurrentUser, isAdmin } from './auth.js';
import { insertStarRecord, getStarBalance } from './star-api.js';

/* ============ 奖励池（家长维护） ============ */

// 读取奖励池；onlyActive=true 时只返回上架的（孩子端用）
export async function getRewards(onlyActive = false) {
  try {
    const supabase = await getSupabaseClient();
    let query = supabase.from('rewards').select('*').order('stars_required', { ascending: true });
    if (onlyActive) query = query.eq('is_active', true);

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return { success: true, data: data || [] };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// 新增奖励（仅家长）
export async function createReward({ name, description = '', starsRequired = 10, emoji = '🎁' }) {
  try {
    if (!(await isAdmin())) throw new Error('权限不足：只有家长可以新增奖励');

    const rewardName = String(name || '').trim();
    if (!rewardName) throw new Error('请填写奖励名称');

    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('rewards')
      .insert({
        name: rewardName,
        description: String(description || '').trim() || null,
        stars_required: Math.max(1, Number(starsRequired) || 1),
        emoji: emoji || '🎁'
      })
      .select();

    if (error) throw new Error(error.message);
    return { success: true, data: data[0] };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// 修改奖励（仅家长）
export async function updateReward(rewardId, patch) {
  try {
    if (!(await isAdmin())) throw new Error('权限不足：只有家长可以修改奖励');

    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('rewards')
      .update({
        name: patch.name,
        description: patch.description || null,
        stars_required: Math.max(1, Number(patch.starsRequired) || 1),
        emoji: patch.emoji || '🎁',
        is_active: patch.isActive !== false
      })
      .eq('id', rewardId)
      .select();

    if (error) throw new Error(error.message);
    return { success: true, data: data[0] };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// 删除奖励（仅家长；已产生的兑换申请会一起删掉，因为外键是 ON DELETE CASCADE）
export async function deleteReward(rewardId) {
  try {
    if (!(await isAdmin())) throw new Error('权限不足：只有家长可以删除奖励');

    const supabase = await getSupabaseClient();
    const { error } = await supabase.from('rewards').delete().eq('id', rewardId);
    if (error) throw new Error(error.message);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/* ============ 兑换申请 ============ */

// 读取兑换申请：孩子看自己的，家长看全部（可只筛待审核）
export async function getRedemptions({ userId = null, status = null, limit = 100 } = {}) {
  try {
    const supabase = await getSupabaseClient();
    let query = supabase
      .from('reward_redemptions')
      .select('*, rewards (id, name, emoji, stars_required)')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (userId) query = query.eq('user_id', userId);
    if (status) query = query.eq('status', status);

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    // 把关联查询出来的奖励名称 / 图标摊平，页面上直接用
    const list = (data || []).map((row) => ({
      ...row,
      reward_name: row.rewards?.name || '奖励',
      reward_emoji: row.rewards?.emoji || '🎁'
    }));

    return { success: true, data: list };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// 孩子提交兑换申请（星星不够 / 同一奖励已有待审核申请时会拦下来）
export async function requestRedemption(reward) {
  try {
    const user = await getCurrentUser();
    if (!user) throw new Error('用户未登录');

    const cost = Number(reward.stars_required) || 0;

    const balanceResult = await getStarBalance(user.id);
    if (!balanceResult.success) throw new Error(balanceResult.error);
    if (balanceResult.data < cost) {
      throw new Error(`星星不够哦，还差 ${cost - balanceResult.data} 颗`);
    }

    const supabase = await getSupabaseClient();
    const { data: pending } = await supabase
      .from('reward_redemptions')
      .select('id')
      .eq('user_id', user.id)
      .eq('reward_id', reward.id)
      .eq('status', 'pending');

    if (pending && pending.length > 0) {
      throw new Error('这个奖励已经申请过啦，等家长审核吧');
    }

    const { data, error } = await supabase
      .from('reward_redemptions')
      .insert({
        reward_id: reward.id,
        user_id: user.id,
        stars_spent: cost,
        status: 'pending'
      })
      .select();

    if (error) throw new Error(error.message);
    return { success: true, data: data[0] };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * 家长审核兑换申请
 * @param {object} redemption 兑换记录（需要 id / user_id / stars_spent / reward_name）
 * @param {'approved'|'rejected'} decision 通过 / 驳回
 * @param {string} notes 审核备注
 */
export async function reviewRedemption(redemption, decision, notes = '') {
  try {
    if (!(await isAdmin())) throw new Error('权限不足：只有家长可以审核兑换');
    if (!['approved', 'rejected'].includes(decision)) throw new Error('审核结果不正确');

    // 通过时先确认星星够，再扣星写流水（保证余额准确）
    if (decision === 'approved') {
      const balanceResult = await getStarBalance(redemption.user_id);
      if (!balanceResult.success) throw new Error(balanceResult.error);
      if (balanceResult.data < redemption.stars_spent) {
        throw new Error(`孩子星星不足：现有 ${balanceResult.data} 颗，需要 ${redemption.stars_spent} 颗`);
      }

      const starResult = await insertStarRecord({
        userId: redemption.user_id,
        starsChange: -Math.abs(redemption.stars_spent),
        reason: `兑换：${redemption.reward_name || '奖励'}`,
        changeType: 'redeem'
      });
      if (!starResult.success) throw new Error(starResult.error);
    }

    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('reward_redemptions')
      .update({
        status: decision,
        review_notes: String(notes || '').trim() || null,
        reviewed_at: new Date()
      })
      .eq('id', redemption.id)
      .select();

    if (error) throw new Error(error.message);
    return { success: true, data: data[0] };
  } catch (error) {
    return { success: false, error: error.message };
  }
}
