# js/vendor/supabase —— 本地化的 supabase-js

这里放的是 `@supabase/supabase-js` 的 ESM 版本（含全部依赖），**不是为了好看，而是因为项目
不能再依赖外网 CDN**：之前 `import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm')`
在某些网络环境下会失败（CDN 被墙 / DNS 污染 / 浏览器插件拦截），页面只会显示
「无法连接到数据库服务，请刷新页面重试」，查不出原因。

## 内容

| 本地文件 | 来源包 | 版本 |
| --- | --- | --- |
| `supabase-js.js` | `@supabase/supabase-js` | 2.118.0 |
| `auth-js.js` | `@supabase/auth-js` | 2.118.0 |
| `postgrest-js.js` | `@supabase/postgrest-js` | 2.118.0 |
| `realtime-js.js` | `@supabase/realtime-js` | 2.118.0 |
| `storage-js.js` | `@supabase/storage-js` | 2.118.0 |
| `functions-js.js` | `@supabase/functions-js` | 2.118.0 |
| `phoenix.js` | `@supabase/phoenix` | 0.4.5 |
| `tslib.js` | `tslib` | 2.8.1 |
| `iceberg-js.js` | `iceberg-js` | 0.8.1 |

- 入口：`js/vendor/supabase/supabase-js.js`，被 `js/supabase-config.js` 以**相对路径**静态 import。
- 原始文件来自 jsDelivr 的 `+esm` 打包产物，已把其中 jsDelivr 内部的根路径说明符
  （如 `/npm/@supabase/auth-js@2.118.0/+esm`）改写为同目录下的相对路径，所以
  **运行时不会再发出任何外部请求**。
- 许可证：以上包均为 **MIT**，许可证原文见各包 npm 页面（`https://www.npmjs.com/package/<包名>`）。
- 文件顶部的 `Bundled by jsDelivr using Rollup ...` 注释是原包自带的，未做修改。

## 怎么升级

```powershell
# 在项目根目录执行，会重新下载并改写说明符（默认固定到 2.118.0）
node tools/vendor-supabase.mjs
```

升级后请刷新页面，用家长/孩子账号各登录一次确认正常。
