// Supabase 配置文件
// 请在 Supabase 项目设置中获取您的 URL 和 Anon Key
// 留空，后续手动填写
const SUPABASE_URL = 'https://rsjpwsqkfqxzaixenruf.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_T3P67NEf2NUh8JKyyReG3A_-bKphn50';

// 引入 Supabase CDN
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

// 创建 Supabase 客户端
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export { supabase };