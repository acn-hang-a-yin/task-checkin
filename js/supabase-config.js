// Supabase 配置文件
// 请在 Supabase 项目设置中获取您的 URL 和 Anon Key
const SUPABASE_URL = 'https://rsjpwsqkfqxzaixenruf.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_T3P67NEf2NUh8JKyyReG3A_-bKphn50';

// 创建 Supabase 客户端 - 增强版本，支持重试和错误处理
let supabase = null;

export async function getSupabaseClient() {
  if (supabase) return supabase;
  
  try {
    // 动态导入，避免ESM加载问题
    const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm');
    
    supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true
      },
      global: {
        headers: {
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        }
      }
    });
    
    return supabase;
  } catch (error) {
    console.error('Supabase客户端初始化失败:', error);
    throw new Error('无法连接到数据库服务，请刷新页面重试');
  }
}

// 兼容性导出
export { getSupabaseClient as supabase };