# 家庭打卡系统

一个给家庭用的「任务打卡 + 星星奖励」小系统：家长建任务、看记录、批奖励，孩子打卡、赚星星、换奖励。
原生 HTML / CSS / JavaScript（ES Module）+ Supabase（数据库 + 登录 + 图片存储），无框架、无打包、无 RLS。

## 两种角色

| 角色 | 登录后进入 | 能做什么 |
|---|---|---|
| 家长（`user_metadata.role = "admin"`） | `admin.html`（4 个页签：任务 / 记录 / 奖励 / 消息） | 建 / 改 / 暂停 / 结束 / 删除任务；看打卡记录、完成率、日历；导出 CSV；手动加星、扣星；审核兑换；发留言 |
| 孩子（不填，默认 `user`） | `child.html`（4 个页签：今日 / 记录 / 奖励 / 消息） | 打卡（勾选 / 照片 / 文字）得星星；看日历、连续天数、勋章；申请兑换；看家长留言 |

## 快速开始

1. 在 Supabase 建项目，把 URL 和 Anon Key 填进 `js/supabase-config.js`。
2. 在 Supabase SQL Editor 里按 **`task-checkin-system.md` 第 4 章** 的顺序建表（7 张表 + 1 个 Storage 桶，SQL 全部可重复执行）。
3. 在 Supabase → Authentication → Users 建账号：孩子账号勾选 Auto Confirm User 即可；家长账号再在 Raw User Meta Data 里填 `{"role":"admin"}`。
4. 用本地服务器打开 `index.html`（例如 VS Code Live Server 或 `python -m http.server`）。
   ⚠️ 直接双击 html 文件会因为浏览器限制 ES Module 而白屏，需要 `http://` 协议。

## 文档

| 文件 | 说明 |
|---|---|
| **`task-checkin-system.md`** | ★ 项目技术文档（合并版）：数据库、页面、**每个数字的计算口径**、模块职责、更新日志 |
| **`guide.html`** | ★ 使用说明（给家人看的独立静态文件，浏览器直接打开，不需要登录；不在页面上放入口） |
| `docs/` | 已合并到上面两份文档，只留一个指路文件 |

## 目录结构（主要文件）

```
index.html / login.html      # 分流页 / 登录页
admin.html / child.html      # 家长端 / 孩子端（各 4 个页签）
guide.html                   # 使用说明（独立静态文件，页面里不放入口）
css/  style.css app.css child.css
js/   supabase-config.js auth.js clock.js idle-logout.js ui-common.js
      task-api.js checkin-api.js member-api.js star-api.js
      reward-api.js message-api.js stats.js presets.js
      admin-ui.js child-ui.js
      vendor/supabase/       # 本地化的 supabase-js（不依赖 CDN）
```

## 部署到 GitHub Pages

1. 推送到 GitHub 仓库（Public）。
2. Settings → Pages → Source 选 main 分支 → Save。
3. 等几分钟，访问 `https://<用户名>.github.io/<仓库名>/index.html`。

## 故障排除

| 现象 | 处理 |
|---|---|
| 改完代码页面没变化 | 浏览器缓存了 ES Module，按 `Ctrl + Shift + R` 强刷 |
| 直接双击 html 白屏 | 用本地服务器（需 `http://` 协议），或部署到 GitHub Pages |
| 登录失败 | 看浏览器控制台里的原始错误（`auth.js` 会把英文错误翻译成中文提示）；确认 `js/supabase-config.js` 里的 URL / Key 正确 |
| 页面提示「读取失败」 | 多半是网络或 Supabase 临时问题，刷新重试；数据没丢 |
| `favicon.ico 404` | 各页面已用内联 SVG 图标，不影响功能 |

## 许可证

MIT License
