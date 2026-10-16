// 消息模块 —— 对应数据库 messages 表（家长留言 / 站内提醒）
import { getSupabaseClient } from './supabase-config.js';
import { getCurrentUser, isAdmin } from './auth.js';

// 家长发留言给孩子
export async function sendMessage(toUserId, content) {
  try {
    if (!(await isAdmin())) throw new Error('权限不足：只有家长可以发留言');

    const me = await getCurrentUser();
    const text = String(content || '').trim();
    if (!toUserId) throw new Error('请选择接收的孩子');
    if (!text) throw new Error('请输入留言内容');

    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('messages')
      .insert({
        from_user_id: me?.id || null,
        to_user_id: toUserId,
        content: text,
        is_read: false
      })
      .select();

    if (error) throw new Error(error.message);
    return { success: true, data: data[0] };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// 读取某个用户收到的留言（孩子端）
export async function getMessagesForUser(userId, limit = 50) {
  try {
    if (!userId) throw new Error('缺少用户');

    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('to_user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw new Error(error.message);
    return { success: true, data: data || [] };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// 未读数量（孩子端顶部红点用）
export async function getUnreadCount(userId) {
  try {
    if (!userId) throw new Error('缺少用户');

    const supabase = await getSupabaseClient();
    const { count, error } = await supabase
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('to_user_id', userId)
      .eq('is_read', false);

    if (error) throw new Error(error.message);
    return { success: true, data: count || 0 };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// 把孩子收到的留言全部标记为已读
export async function markAllMessagesRead(userId) {
  try {
    if (!userId) throw new Error('缺少用户');

    const supabase = await getSupabaseClient();
    const { error } = await supabase
      .from('messages')
      .update({ is_read: true })
      .eq('to_user_id', userId)
      .eq('is_read', false);

    if (error) throw new Error(error.message);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// 家长端：读取自己发出的留言历史
export async function getSentMessages(limit = 50) {
  try {
    const me = await getCurrentUser();
    if (!me) throw new Error('用户未登录');

    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('from_user_id', me.id)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw new Error(error.message);
    return { success: true, data: data || [] };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// 删除留言（家长端历史列表里可以清理）
export async function deleteMessage(messageId) {
  try {
    if (!(await isAdmin())) throw new Error('权限不足：只有家长可以删除留言');

    const supabase = await getSupabaseClient();
    const { error } = await supabase.from('messages').delete().eq('id', messageId);
    if (error) throw new Error(error.message);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}
