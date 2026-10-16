// 用户认证模块
import { getSupabaseClient } from './supabase-config.js';
import { showNotification } from './ui-common.js';

/**
 * 把 Supabase 返回的英文报错翻译成看得懂的中文
 * 说明：原始错误（code / status / message）一律打到控制台，方便排查
 * @param {object} error Supabase 返回的 error 对象
 * @returns {string} 面向用户的中文提示
 */
function friendlyAuthError(error) {
  const code = error?.code || '';
  const msg = error?.message || '';

  console.error('Supabase 登录原始错误:', { code, status: error?.status, message: msg });

  const codeMap = {
    invalid_credentials: '邮箱或密码不正确，请重新输入',
    email_not_confirmed: '该邮箱还没有验证：请到 Supabase → Authentication → Users 里确认这个账号',
    user_banned: '该账号已被禁用，请联系管理员',
    weak_password: '密码强度不够，请换一个更复杂的密码',
    over_request_rate_limit: '尝试次数过多，请等一会儿再试',
    over_email_send_rate_limit: '操作太频繁了，请稍后再试',
    validation_failed: '邮箱格式不正确，请检查后重试',
    signup_disabled: '该项目已关闭注册，请在 Supabase 后台手动建账号'
  };

  if (codeMap[code]) return codeMap[code];

  if (/invalid api key|no api key/i.test(msg)) {
    return 'Supabase Key 不正确，请检查 js/supabase-config.js';
  }
  if (/failed to fetch|network|load failed|timeout|err_/i.test(msg)) {
    return '网络连接失败，请检查网络后刷新页面重试';
  }

  return msg || '登录失败，请重试';
}

// 登录函数
export async function login(email, password) {
  try {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (error) {
      throw new Error(friendlyAuthError(error));
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