// 用户认证模块
import { getSupabaseClient } from './supabase-config.js';
import { showNotification } from './ui-common.js';

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

// 按角色算出该进哪个页面：家长 → admin.html，孩子 → child.html
export function homePageForRole(role) {
  return role === 'admin' ? 'admin.html' : 'child.html';
}

// 登录成功后按角色跳转（login.html 和 index.html 分流用）
export async function redirectByRole() {
  const role = await getUserRole();
  window.location.href = homePageForRole(role);
  return role;
}

/**
 * 页面入口守卫
 * 没登录 → 跳登录页；角色不匹配 → 跳回自己的首页
 * @param {string[]|null} allowedRoles 允许进入本页的角色，如 ['admin']；传 null 表示登录即可
 * @returns {Promise<{user: object, role: string}|null>} 通过校验返回 { user, role }，否则返回 null
 */
export async function requireAuth(allowedRoles = null) {
  const user = await getCurrentUser();

  if (!user) {
    console.log('未登录，跳转到登录页');
    window.location.href = 'login.html';
    return null;
  }

  const role = user.user_metadata?.role || 'user';

  if (allowedRoles && !allowedRoles.includes(role)) {
    showNotification('权限不足：正在为你跳转到正确的页面', 'error');
    setTimeout(() => {
      window.location.href = homePageForRole(role);
    }, 800);
    return null;
  }

  return { user, role };
}

/**
 * 读取当前用户的昵称 / 头像（members 表）
 * 说明：用动态 import 引入 member-api.js，避免 auth.js 和 member-api.js 互相引用
 * @returns {Promise<object|null>} 没有填过昵称时返回 null（页面会弹首次登录引导）
 */
export async function getMyProfile() {
  const { getMyProfile: loadProfile } = await import('./member-api.js');
  const { success, data, error } = await loadProfile();

  if (!success) {
    console.error('读取成员资料失败:', error);
    return null;
  }

  return data;
}