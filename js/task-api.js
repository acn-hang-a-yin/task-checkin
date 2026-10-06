// 任务API模块
import { supabase } from './supabase-config.js';
import { isAdmin } from './auth.js';

// 获取所有任务
export async function getAllTasks() {
  try {
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