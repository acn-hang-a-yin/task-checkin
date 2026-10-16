// Supabase 配置文件
// 说明 1：不用动态 import。动态 import 一旦失败会被 try/catch 吞掉，页面最后只会
//   看到笼统的「无法连接到数据库服务」，反而看不出真正原因；静态 import 在页面
//   加载阶段就把依赖解析好，点登录时直接可用。
// 说明 2：supabase-js 已经整包放到本地 js/vendor/supabase/（见该目录 README.md），
//   因此这里完全不依赖外网 CDN —— CDN 被墙、DNS 污染、跨域被拦截都不会再导致登录失败。
//   升级方式见 tools/vendor-supabase.mjs。
import { createClient } from './vendor/supabase/supabase-js.js';

// 这两个值在 Supabase 项目设置里获取
const SUPABASE_URL = 'https://rsjpwsqkfqxzaixenruf.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_T3P67NEf2NUh8JKyyReG3A_-bKphn50';

// 单例客户端：全站所有模块共用同一个实例
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true
  }
});

/**
 * 取 Supabase 客户端
 * 说明：以前是 async 函数（内部做动态 import），现在直接返回同一个客户端。
 * 所有调用点写的都是 `await getSupabaseClient()`，而 await 一个普通对象是合法的，
 * 所以不需要改动任何调用代码。
 * @returns {object} SupabaseClient 实例
 */
export function getSupabaseClient() {
  return supabase;
}

// 兼容性导出（edit-task.html 里是 `import { supabase }`，现在拿到的是客户端本体）
export { supabase };