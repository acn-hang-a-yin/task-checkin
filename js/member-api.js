// 成员模块（昵称 / 头像）—— 对应数据库 members 表
import { getSupabaseClient } from './supabase-config.js';

// 预设卡通头像（不开放自定义上传，省去 Storage 使用）
export const AVATARS = [
  { key: 'cat', emoji: '🐱', label: '小猫' },
  { key: 'dog', emoji: '🐶', label: '小狗' },
  { key: 'panda', emoji: '🐼', label: '熊猫' },
  { key: 'rabbit', emoji: '🐰', label: '兔子' },
  { key: 'lion', emoji: '🦁', label: '狮子' },
  { key: 'fox', emoji: '🦊', label: '狐狸' },
  { key: 'bear', emoji: '🐻', label: '小熊' },
  { key: 'penguin', emoji: '🐧', label: '企鹅' },
  { key: 'dolphin', emoji: '🐬', label: '海豚' },
  { key: 'unicorn', emoji: '🦄', label: '独角兽' }
];

// 头像标识 → emoji
export function avatarEmoji(key) {
  const found = AVATARS.find((a) => a.key === key);
  return found ? found.emoji : '🐱';
}

// 内部小函数：取当前登录用户 id（直接问 Supabase，避免和 auth.js 互相引用）
async function currentUserId() {
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase.auth.getUser();
  if (error) return null;
  return data?.user?.id || null;
}

// 读取某个成员的资料（不传 userId 就是读自己）
export async function getMember(userId = null) {
  try {
    const id = userId || (await currentUserId());
    if (!id) throw new Error('用户未登录');

    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('members')
      .select('*')
      .eq('user_id', id)
      .maybeSingle();

    if (error) throw new Error(error.message);
    return { success: true, data: data || null };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// 读取当前登录用户自己的资料（auth.js 里也有同名导出，方便按文档调用）
export async function getMyProfile() {
  return getMember(null);
}

// 保存昵称 + 头像（首次登录是新增，之后是修改；upsert 一个接口搞定两件事）
export async function saveProfile({ nickname, avatarKey = 'cat' }) {
  try {
    const id = await currentUserId();
    if (!id) throw new Error('用户未登录');

    const name = String(nickname || '').trim();
    if (!name) throw new Error('请填写昵称');

    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('members')
      .upsert(
        { user_id: id, nickname: name, avatar_key: avatarKey, updated_at: new Date() },
        { onConflict: 'user_id' }
      )
      .select();

    if (error) throw new Error(error.message);
    return { success: true, data: data[0] };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// 读取全部成员（家长端「孩子下拉框」用）
export async function getAllMembers() {
  try {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('members')
      .select('*')
      .order('created_at', { ascending: true });

    if (error) throw new Error(error.message);
    return { success: true, data: data || [] };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// 家长端：读取「孩子列表」（= 全部成员里去掉自己）
export async function getChildren() {
  try {
    const me = await currentUserId();
    const { success, data, error } = await getAllMembers();
    if (!success) throw new Error(error);

    return { success: true, data: data.filter((m) => m.user_id !== me) };
  } catch (error) {
    return { success: false, error: error.message };
  }
}
