// 任务API模块
import { getSupabaseClient } from './supabase-config.js';
import { isAdmin } from './auth.js';
import { isTaskScheduledOn, todayKey } from './stats.js';

// 获取所有任务
export async function getAllTasks() {
  try {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (error) {
      throw new Error(error.message);
    }
    
    return { success: true, data };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// 新增任务（仅管理员可操作）
export async function createTask(taskData) {
  try {
    const isAdminUser = await isAdmin();
    
    if (!isAdminUser) {
      throw new Error('权限不足：只有管理员可以新增任务');
    }
    
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('tasks')
      .insert([taskData])
      .select();
    
    if (error) {
      throw new Error(error.message);
    }
    
    return { success: true, data: data[0] };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// 更新任务（仅管理员可操作）
export async function updateTask(taskId, taskData) {
  try {
    const isAdminUser = await isAdmin();
    
    if (!isAdminUser) {
      throw new Error('权限不足：只有管理员可以编辑任务');
    }
    
    const supabase = await getSupabaseClient();
    // 确保updated_at字段被更新
    const updateData = { ...taskData, updated_at: new Date() };
    
    const { data, error } = await supabase
      .from('tasks')
      .update(updateData)
      .eq('id', taskId)
      .select();
    
    if (error) {
      throw new Error(error.message);
    }
    
    return { success: true, data: data[0] };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// 删除任务（仅管理员可操作）
export async function deleteTask(taskId) {
  try {
    const isAdminUser = await isAdmin();
    
    if (!isAdminUser) {
      throw new Error('权限不足：只有管理员可以删除任务');
    }
    
    const supabase = await getSupabaseClient();
    const { error } = await supabase
      .from('tasks')
      .delete()
      .eq('id', taskId);
    
    if (error) {
      throw new Error(error.message);
    }
    
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// 只取「进行中」的任务（孩子端今日任务用）
export async function getActiveTasks() {
  try {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .eq('status', 'active')
      .order('created_at', { ascending: false });

    if (error) throw new Error(error.message);
    return { success: true, data: data || [] };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// 取「今天该打卡」的任务（进行中 + 周期匹配今天）
export async function getTodayTasks(dateKey = todayKey()) {
  const { success, data, error } = await getActiveTasks();
  if (!success) return { success: false, error };

  return { success: true, data: data.filter((task) => isTaskScheduledOn(task, dateKey)) };
}

/**
 * 把页面表单整理成数据库要的字段（任务字段全部自由填写，这里只做基本校验）
 * @param {object} form 表单收集到的值
 * @returns {object} 可以直接交给 createTask / updateTask 的数据
 */
export function normalizeTaskForm(form) {
  const title = String(form.title || '').trim();
  if (!title) throw new Error('请填写任务名称');

  const cycleType = form.cycle_type === 'weekly' ? 'weekly' : 'daily';
  let cycleDays = [];

  if (cycleType === 'weekly') {
    cycleDays = (Array.isArray(form.cycle_days) ? form.cycle_days : [])
      .map(Number)
      .filter((n) => n >= 1 && n <= 7);

    if (!cycleDays.length) throw new Error('每周任务至少要勾选一天（周一 ~ 周日）');
  }

  return {
    title,
    subject: String(form.subject || '').trim() || null,
    description: String(form.description || '').trim() || null,
    cycle_type: cycleType,
    cycle_days: cycleDays,
    // 表单的 time 控件给的是 'HH:MM'，数据库是 TIME 类型，补上秒
    deadline_time: form.deadline_time ? `${String(form.deadline_time).slice(0, 5)}:00` : '21:00:00',
    checkin_type: ['checkbox', 'photo', 'text'].includes(form.checkin_type) ? form.checkin_type : 'checkbox',
    star_reward: Math.max(0, Number(form.star_reward) || 0),
    status: ['active', 'paused', 'ended'].includes(form.status) ? form.status : 'active',
    due_date: form.due_date || null,
    priority: ['low', 'normal', 'high'].includes(form.priority) ? form.priority : 'normal'
  };
}

// 暂停 / 恢复 / 结束任务（仅家长）
export async function setTaskStatus(taskId, status) {
  try {
    if (!(await isAdmin())) throw new Error('权限不足：只有家长可以修改任务状态');
    if (!['active', 'paused', 'ended'].includes(status)) throw new Error('任务状态不正确');

    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('tasks')
      .update({ status, updated_at: new Date() })
      .eq('id', taskId)
      .select();

    if (error) throw new Error(error.message);
    return { success: true, data: data[0] };
  } catch (error) {
    return { success: false, error: error.message };
  }
}