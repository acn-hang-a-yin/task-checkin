// 用户认证模块
import { getSupabaseClient } from './supabase-config.js';

// 登录函数
export async function login(email, password) {
  try {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (error) {
      throw new Error(error.message);
    }

    return { success: true, user: data.user };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// 退出登录
export async function logout() {
  try {
    const supabase = await getSupabaseClient();
    const { error } = await supabase.auth.signOut();

    if (error) {
      throw new Error(error.message);
    }

    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// 获取当前用户
export async function getCurrentUser() {
  try {
    const supabase = await getSupabaseClient();
    const { data: { user }, error } = await supabase.auth.getUser();

    if (error) {
      throw new Error(error.message);
    }

    return user;
  } catch (error) {
    return null;
  }
}

// 获取用户角色
export async function getUserRole() {
  try {
    const user = await getCurrentUser();

    if (!user) {
      return null;
    }

    // 直接从 user 对象获取 metadata 中的角色
    return user.user_metadata?.role || 'user';
  } catch (error) {
    console.error('获取用户角色失败:', error);
    return null;
  }
}

// 检查登录状态
export async function checkAuth() {
  const user = await getCurrentUser();
  return user !== null;
}

// 检查是否为管理员
export async function isAdmin() {
  const role = await getUserRole();
  return role === 'admin';
}

// 检查是否为普通用户
export async function isUser() {
  const role = await getUserRole();
  return role === 'user';
}