// 打卡API模块
import { getSupabaseClient } from './supabase-config.js';
import { getCurrentUser, isAdmin } from './auth.js';

// 获取用户的打卡记录
export async function getUserCheckins() {
  try {
    const user = await getCurrentUser();

    if (!user) {
      throw new Error('用户未登录');
    }

    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('task_checkins')
      .select(`
        id,
        is_checked,
        created_at,
        updated_at,
        tasks (id, title, subject, description, due_date, priority)
      `)
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false });

    if (error) {
      throw new Error(error.message);
    }

    return { success: true, data };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// 获取所有用户的打卡记录（仅管理员可操作）
export async function getAllUserCheckins() {
  try {
    const isAdminUser = await isAdmin();

    if (!isAdminUser) {
      throw new Error('权限不足：只有管理员可以查看所有用户的打卡记录');
    }

    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('task_checkins')
      .select(`
        id,
        is_checked,
        created_at,
        updated_at,
        user_id,
        tasks (id, title, subject, description, due_date, priority)
      `)
      .order('updated_at', { ascending: false });

    if (error) {
      throw new Error(error.message);
    }

    return { success: true, data };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// 打卡/取消打卡
export async function toggleCheckin(taskId) {
  try {
    const user = await getCurrentUser();

    if (!user) {
      throw new Error('用户未登录');
    }

    const supabase = await getSupabaseClient();
    // 检查是否已存在打卡记录
    const { data: existingCheckin, error: checkError } = await supabase
      .from('task_checkins')
      .select('id, is_checked')
      .eq('task_id', taskId)
      .eq('user_id', user.id)
      .single();

    if (checkError && checkError.code !== 'PGRST116') {
      throw new Error(checkError.message);
    }

    let result;

    if (existingCheckin) {
      // 更新现有记录
      const newIsChecked = !existingCheckin.is_checked;
      const { data, error } = await supabase
        .from('task_checkins')
        .update({ is_checked: newIsChecked, updated_at: new Date() })
        .eq('id', existingCheckin.id)
        .select();

      if (error) {
        throw new Error(error.message);
      }

      result = { success: true, data: data[0], action: newIsChecked ? 'checked' : 'unchecked' };
    } else {
      // 创建新记录
      const { data, error } = await supabase
        .from('task_checkins')
        .insert({
          task_id: taskId,
          user_id: user.id,
          is_checked: true
        })
        .select();

      if (error) {
        throw new Error(error.message);
      }

      result = { success: true, data: data[0], action: 'checked' };
    }

    return result;
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// 检查是否已打卡
export async function isChecked(taskId) {
  try {
    const user = await getCurrentUser();

    if (!user) {
      return false;
    }

    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('task_checkins')
      .select('is_checked')
      .eq('task_id', taskId)
      .eq('user_id', user.id)
      .single();

    if (error && error.code !== 'PGRST116') {
      throw new Error(error.message);
    }

    return data?.is_checked || false;
  } catch (error) {
    console.error('检查打卡状态失败:', error);
    return false;
  }
}