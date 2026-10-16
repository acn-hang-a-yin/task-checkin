# 任务打卡系统 | 功能扩展设计文档（精简版）

> 本文档是「需求整理 + 精简设计方案」，**只做规划，不改代码**。
> 技术栈与现有一致：原生 HTML + 原生 CSS + 原生 JavaScript ES Module + Supabase（无框架、无打包、无 RLS、纯前端权限控制）。
> 设计原则：**前端能做的才做；表最少；不要视图；体验越简单越好。**

---

## 0. 精简取舍说明

### 0.1 去掉的功能（前端做不到 / 太复杂）

| 原需求 | 处理 | 原因 / 替代方案 |
|---|---|---|
| 前端「新建孩子账号」「重置孩子密码」 | ❌ 去掉 | 创建/改密码必须用 Supabase Service Role Key，**放前端等于泄露数据库**。改为：家长在 Supabase 控制台点几下创建（见第 7 章，一次性操作） |
| 真机推送提醒（手机通知栏） | ❌ 去掉 | 需要 Service Worker + Web Push，纯前端做不到。改为：**站内消息**（孩子打开页面就能看到红点提醒） |
| 短视频上传 | ❌ 去掉 | 简化流程、省流量。只保留「勾选 / 照片 / 文字」三种打卡形式 |
| 数据库视图（2 个） | ❌ 去掉 | 按要求不要视图；统计改由前端实时计算（家庭数据量小，完全够快） |
| 任务模板表 | ❌ 去掉 | 任务**完全自由创建**（想建什么就建什么）；另提供 4 个「一键填充」小按钮 + 浏览器本地保存「我的常用」（localStorage，**不占数据库表**） |
| 打卡统计表 `checkin_stats` | ❌ 去掉 | 连续天数、完成率由前端查询后即时计算，不落库 |
| 打卡证书表 `certificates` | ❌ 去掉 | 勋章／证书按「连续天数」前端动态展示（7/21/30 天自动点亮） |
| 账号表 `user_profiles` + `family_relations` | 🔁 合并 | 两张表合并成一张极简 `members`（昵称 + 头像），少 1 张表 |
| 提醒表 + 消息表 | 🔁 合并 | 合并成一张 `messages`，少 1 张表 |

### 0.2 保留并简化的功能

- 任务：名称、周期（每日 / 每周固定几天）、截止时间、描述、打卡形式、星星、暂停/结束、编辑、删除（二次确认）
- 打卡：勾选 / 传一张照片 / 写一句话，提交即得星
- 记录：按月日历（绿=完成 灰=未完成）、连续打卡天数、完成率、查看提交内容、导出 CSV（用 Excel 直接打开）
- 奖励：星星余额、奖励商店、兑换申请、家长审核、手动加星/扣星
- 消息：家长留言/点评、站内提醒
- 勋章：7 / 21 / 30 天坚持勋章（前端自动点亮）
- 实时时钟：所有页面右上角显示「年月日 时:分:秒」，每秒刷新

### 0.3 结论速览

| 问题 | 结论 |
|---|---|
| 新增页面 | **2 个**（家长端 `admin.html` + 孩子端 `child.html`，各自单页多页签） |
| 新建表 | **5 张**：`members`、`star_records`、`rewards`、`reward_redemptions`、`messages` |
| 修改现有表 | **2 张**：`tasks` 加 6 个字段；`task_checkins` 加 4 个字段并**修改唯一约束** |
| 视图 | **0 个** |
| 额外资源 | 1 个 Storage 桶（存打卡照片）+ 1 个前端时钟组件 |

---

## 1. 现有系统现状

### 1.1 现有页面（保留 / 改造）

| 文件 | 处理 |
|---|---|
| `index.html` | 改造为「登录后按角色分流」：家长 → `admin.html`，孩子 → `child.html` |
| `login.html` | 保留，登录成功后按角色跳转 |
| `edit-task.html` | 废弃（编辑任务并入 `admin.html` 弹窗） |

### 1.2 现有 JS 模块

`supabase-config.js`（客户端）、`auth.js`（登录/角色）、`task-api.js`（任务）、`checkin-api.js`（打卡）、`ui.js`（渲染）。

### 1.3 现有数据库表（2 张）

```sql
-- 任务表
CREATE TABLE public.tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  subject TEXT,
  description TEXT,
  due_date TIMESTAMPTZ,
  priority TEXT CHECK (priority IN ('low','normal','high')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 打卡表（注意：现有约束「一个任务一个用户只有一条记录」，必须改）
CREATE TABLE public.task_checkins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  is_checked BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(task_id, user_id)
);
```

### 1.4 现有角色

`admin`（写在 `auth.users..role`）与 `user`（缺省，视为孩子）。
user_metadata
---

## 2. 角色与权限（保持 2 种角色，最简单）

| 角色 | metadata | 登录后进入 | 能做什么 |
|---|---|---|---|
| 家长 | `{"role":"admin"}` | `admin.html` | 管任务、看记录、管奖励、发消息、手动加/扣星 |
| 孩子 | 不填（默认 user） | `child.html` | 打卡、看自己的记录/星星、申请兑换、看消息 |

> 说明：不新增 `parent` 角色，家长即 `admin`，孩子即 `user`，与现有系统完全兼容、零迁移成本。

### 2.1 权限规则（前端拦截）

- 孩子端**完全不渲染**任何「新增 / 编辑 / 删除任务」入口；直接调用写接口也会被 `task-api.js` 里的 `isAdmin()` 拦下。
- 孩子提交打卡后**不能自己删除**（孩子端没有删除按钮，只有家长端有）。
- 家长端可以删除打卡记录（用于纠正误操作）。

---

## 3. 页面设计（只加 2 个页面，单页多页签，免跳转）

### 3.1 页面清单

| 文件 | 角色 | 说明 |
|---|---|---|
| `index.html` | 公共 | 分流页：按角色自动跳转（改造现有） |
| `login.html` | 公共 | 登录（保留） |
| **`admin.html`** | 家长 | ★新增：家长控制台（单页 4 个页签） |
| **`child.html`** | 孩子 | ★新增：孩子打卡页（单页 4 个页签） |
| `css/style.css` | 公共 | 现有样式扩展 |
| `css/child.css` | 孩子 | ★新增：卡通大按钮风格 |

### 3.2 家长端 `admin.html`（页签式，点标签切换，不跳页）

顶部固定栏：`🏠 家庭打卡 · 家长端` + **实时时钟** + `👤 昵称` + `退出`

| 页签 | 内容 | 关键交互 |
|---|---|---|
| 📋 **任务** | 任务卡片列表（名称/周期/截止/星星/状态） | ✏️「**+ 新建任务**」弹窗：**所有字段自由填写，想建什么任务都行**；可选 4 个「一键填充」按钮 + 「存为我的常用」（本地保存）；每张卡有 编辑 / 暂停·恢复 / 结束 / 删除（删除需二次确认） |
| 📊 **记录** | 上方：孩子下拉切换 + 日历（绿=完成，灰=未完成）+ 连续天数/完成率；下方：打卡明细（缩略图 + 文字） | 点日历某天看当天提交；「导出 CSV」按钮；明细可删除（家长权限） |
| 🎁 **奖励** | 左：星星余额 + 加星/扣星；中：奖励池（增删改，emoji 图标）；右：待审核兑换申请（通过/驳回） | 审核通过后自动扣星并写流水 |
| 💬 **消息** | 给指定孩子发留言；历史消息列表 | 支持选择孩子、快捷短语（「记得今晚阅读打卡哦」） |

#### 3.2.1 「+ 新建任务」弹窗字段（**全部自由填写，无任何限制**）

| 字段 | 输入方式 | 说明 |
|---|---|---|
| 任务名称 * | 文本输入 | 想叫什么就叫什么，如「每日阅读」「背古诗」「整理书桌」 |
| 主题 / 分类 | 文本输入 | 可选，如 语文 / 数学 / 体育 / 家务 |
| 任务描述 | 多行文本 | 写要求，如「阅读 20 分钟，拍照上传」 |
| 周期 | 单选 | 每天 / 每周固定几天 |
| 周几 | 多选（周一 ~ 周日） | 选「每周固定几天」时才出现 |
| 截止时间 | 时间选择器 | 任意时刻，如 21:00 |
| 打卡形式 | 单选 | 仅勾选 / 上传照片 / 写文字 |
| 星星奖励 | 数字输入 | 完成一次得几颗星，自己填 |

底部按钮：`保存`（新建任务）/ `存为我的常用`（存本机，方便下次）/ 几个「一键填充」示例（**纯可选，可无视**）

### 3.3 孩子端 `child.html`（卡通、大字、大按钮）

顶部固定栏：`⭐ 我的星星：12` + **实时时钟** + `👤 头像昵称`

| 页签 | 内容 | 关键交互 |
|---|---|---|
| ✅ **今日** | 今日任务大卡片：待做 ⏳ / 已完成 ✅ | 点卡片 → 打卡弹窗（勾选/拍照/写一句话）→ 提交得 ⭐；显示今日进度 |
| 📅 **记录** | 彩色月历（绿=完成，灰=没完成）+ 连续打卡天数 | 点日期看当天上传的照片和文字 |
| 🎁 **奖励** | 我的星星大数字 + 勋章墙（7/21/30 天，达到即点亮）+ 奖励商店 | 点「我要兑换」→ 提交申请 → 显示「等待家长审批」 |
| 💬 **消息** | 家长留言列表 + 未读红点 | 打开自动标记已读 |

### 3.4 首次登录引导（让孩子自己填昵称，免去家长后台登记）

孩子第一次登录 `child.html` 时，若 `members` 表里没有自己的记录，弹一个可爱的小框：
「你叫什么名字呀？」+ 一排预设卡通头像 → 保存。
保存即往 `members` 插入一条（`user_id` = 自己）。之后家长端就能看到每个孩子的昵称，多孩子天然分开。
（家长端也走同样逻辑，首次登录填昵称即可。）

### 3.5 公共组件：实时时钟

所有页面右上角 `<span id="system-clock"></span>`，由 `clock.js` 每秒刷新：

```js
// js/clock.js
export function startClock(elId = 'system-clock') {
  const el = document.getElementById(elId);
  if (!el) return;
  const p = n => String(n).padStart(2, '0');
  const tick = () => {
    const d = new Date();
    el.textContent = `${d.getFullYear()}年${p(d.getMonth() + 1)}月${p(d.getDate())}日 ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  };
  tick();
  setInterval(tick, 1000);
}
```

---

## 4. 数据库设计（2 张改 + 5 张新，共 7 张表，0 视图）

### 4.1 修改 `tasks`（加 6 个字段）

| 新字段 | 类型 | 说明 |
|---|---|---|
| `cycle_type` | TEXT | `daily` 每天 / `weekly` 每周固定几天 |
| `cycle_days` | SMALLINT[] | 周几打卡，`1`=周一 … `7`=周日（`weekly` 用） |
| `deadline_time` | TIME | 当天截止时间，如 `21:00:00` |
| `checkin_type` | TEXT | `checkbox` 勾选 / `photo` 照片 / `text` 文字 |
| `star_reward` | INTEGER | 完成一次得几颗星 |
| `status` | TEXT | `active` 进行中 / `paused` 暂停 / `ended` 结束 |

```sql
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS cycle_type    TEXT      DEFAULT 'daily'
      CHECK (cycle_type IN ('daily','weekly')),
  ADD COLUMN IF NOT EXISTS cycle_days    SMALLINT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS deadline_time TIME      DEFAULT '21:00:00',
  ADD COLUMN IF NOT EXISTS checkin_type  TEXT      DEFAULT 'checkbox'
      CHECK (checkin_type IN ('checkbox','photo','text')),
  ADD COLUMN IF NOT EXISTS star_reward   INTEGER   DEFAULT 1,
  ADD COLUMN IF NOT EXISTS status        TEXT      DEFAULT 'active'
      CHECK (status IN ('active','paused','ended'));
```

### 4.2 修改 `task_checkins`（加 4 个字段 + 改唯一约束）

| 新字段 | 类型 | 说明 |
|---|---|---|
| `checkin_note` | TEXT | 孩子写的一句话 |
| `photo_url` | TEXT | 打卡照片地址（Storage 公网 URL） |
| `stars_earned` | INTEGER | 本次获得星星 |
| `checkin_date` | DATE | 打卡日期（日历 / 连续天数 / 去重靠它） |

```sql
-- 1) 加字段
ALTER TABLE public.task_checkins
  ADD COLUMN IF NOT EXISTS checkin_note TEXT,
  ADD COLUMN IF NOT EXISTS photo_url    TEXT,
  ADD COLUMN IF NOT EXISTS stars_earned INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS checkin_date DATE DEFAULT CURRENT_DATE;

-- 2) 给历史数据补日期（否则旧记录 checkin_date 为空）
UPDATE public.task_checkins
   SET checkin_date = (COALESCE(updated_at, created_at, now()) AT TIME ZONE 'UTC')::date
 WHERE checkin_date IS NULL;

-- 3) 删除旧的唯一约束
ALTER TABLE public.task_checkins
  DROP CONSTRAINT IF EXISTS task_checkins_task_id_user_id_key;

-- 4) 新唯一约束：同一任务、同一人、同一天只能有一条（每日打卡靠它）
ALTER TABLE public.task_checkins
  ADD CONSTRAINT task_checkins_task_user_date_key
  UNIQUE (task_id, user_id, checkin_date);
```

> ⚠️ 第 3、4 步是**最关键**的改动：不改的话「每天重复打卡」会插不进去。

### 4.3 新建 `members`（成员昵称 / 头像，合并了原 user_profiles + family_relations）

```sql
CREATE TABLE IF NOT EXISTS public.members (
  user_id    UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nickname   TEXT NOT NULL,
  avatar_key TEXT DEFAULT 'cat',           -- 预设卡通头像标识，不开放自定义上传
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

### 4.4 新建 `star_records`（星星流水：自动得星 + 家长手动加减）

```sql
CREATE TABLE IF NOT EXISTS public.star_records (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  stars_change INTEGER NOT NULL,            -- 得星为正，扣星为负
  reason       TEXT,                        -- 原因，如「完成：每日阅读」「表现好奖励」
  change_type  TEXT DEFAULT 'auto'
      CHECK (change_type IN ('auto','manual','deduct','redeem')),
  created_by   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ DEFAULT now()
);
```

### 4.5 新建 `rewards`（奖励池）

```sql
CREATE TABLE IF NOT EXISTS public.rewards (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name           TEXT NOT NULL,             -- 奖品名，如「看动画 30 分钟」
  description    TEXT,
  stars_required INTEGER NOT NULL DEFAULT 10,
  emoji          TEXT DEFAULT '🎁',         -- 用 emoji 当图标，省去图片上传
  is_active      BOOLEAN DEFAULT true,
  created_at     TIMESTAMPTZ DEFAULT now()
);
```

### 4.6 新建 `reward_redemptions`（兑换申请 + 审核）

```sql
CREATE TABLE IF NOT EXISTS public.reward_redemptions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reward_id    UUID NOT NULL REFERENCES public.rewards(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  stars_spent  INTEGER NOT NULL DEFAULT 0,
  status       TEXT DEFAULT 'pending'
      CHECK (status IN ('pending','approved','rejected')),
  review_notes TEXT,
  created_at   TIMESTAMPTZ DEFAULT now(),
  reviewed_at  TIMESTAMPTZ
);
```

### 4.7 新建 `messages`（家长留言 / 提醒，合并了原 reminders + messages）

```sql
CREATE TABLE IF NOT EXISTS public.messages (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL, -- 家长（系统消息可为空）
  to_user_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content      TEXT NOT NULL,
  is_read      BOOLEAN DEFAULT false,
  created_at   TIMESTAMPTZ DEFAULT now()
);
```

### 4.8 索引（只建必要的 4 个）

```sql
CREATE INDEX IF NOT EXISTS idx_checkins_user_date ON public.task_checkins (user_id, checkin_date DESC);
CREATE INDEX IF NOT EXISTS idx_star_user          ON public.star_records (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_msg_to_user        ON public.messages (to_user_id, is_read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_redemption_status  ON public.reward_redemptions (status, created_at DESC);
```

### 4.9 存储桶（存打卡照片）

```sql
-- 公开读、登录可写，前端上传后直接拿公网 URL 显示
INSERT INTO storage.buckets (id, name, public)
VALUES ('checkin-media', 'checkin-media', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "checkin_media_insert" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'checkin-media');

CREATE POLICY "checkin_media_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'checkin-media');

CREATE POLICY "checkin_media_delete" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'checkin-media' AND owner = auth.uid());
```

### 4.10 初始数据（可选，方便测试）

```sql
INSERT INTO public.rewards (name, description, stars_required, emoji) VALUES
  ('看动画 30 分钟', '兑换后当天可看 30 分钟动画', 10, '📺'),
  ('买一个小玩具',   '周末去店里挑一个',            50, '🧸'),
  ('周末去游乐场',   '和家长一起去游乐场',         100, '🎡');
```

### 4.11 一键执行顺序（在 Supabase SQL Editor 按此顺序粘贴执行）

1. 【4.1】`tasks` 加字段
2. 【4.2】`task_checkins` 加字段 + 补日期 + 换唯一约束
3. 【4.3】建 `members`
4. 【4.4】建 `star_records`
5. 【4.5】建 `rewards`
6. 【4.6】建 `reward_redemptions`
7. 【4.7】建 `messages`
8. 【4.8】建索引
9. 【4.9】建 Storage 桶与策略
10. 【4.10】插入示例奖励（可选）

> 全部都是「可重复执行」写法（`IF NOT EXISTS` / `OR REPLACE` / `DROP ... IF EXISTS`），执行失败可放心重跑。

---

## 5. 前端实现方案

### 5.1 JS 模块（新增 6 个 + 调整 3 个）

| 模块 | 类型 | 职责 |
|---|---|---|
| `js/supabase-config.js` | 保留 | 客户端初始化 |
| `js/auth.js` | 调整 | 加 `isAdmin()`、`getMyProfile()`、登录后按角色跳转 |
| `js/task-api.js` | 调整 | 任务增删改查、暂停/结束；非 admin 直接拦截 |
| `js/checkin-api.js` | 调整 | 按 `checkin_date` 打卡（每日一条）、上传照片、写 `stars_earned` |
| `js/clock.js` | ★新增 | 实时日期时间（第 3.5 节） |
| `js/member-api.js` | ★新增 | 昵称 / 头像（members 表）读取与保存 |
| `js/star-api.js` | ★新增 | 星星流水、余额计算、家长手动加/扣星 |
| `js/reward-api.js` | ★新增 | 奖励池增删改、兑换申请与审核 |
| `js/message-api.js` | ★新增 | 留言收发、未读计数 |
| `js/stats.js` | ★新增 | 连续天数、完成率、日历数据、**CSV 导出**（纯前端） |
| `js/admin-ui.js` | ★新增 | 家长端 4 个页签渲染 |
| `js/child-ui.js` | ★新增 | 孩子端 4 个页签渲染（卡通风格） |

### 5.2 关键逻辑（都在前端完成，无需视图/存储过程）

- **每日打卡**：`checkin_date = 今天`，用 `upsert`（onConflict: `task_id,user_id,checkin_date`）提交，天然防重复。
- **得星**：打卡成功后写 `task_checkins.stars_earned = tasks.star_reward`，同时往 `star_records` 记 `+n`（`change_type='auto'`）。
- **星星余额**：前端查询 `star_records` 求和（`SUM(stars_change)`）。数据量小，实时算即可。
- **连续打卡天数**：取某任务的 `checkin_date` 升序数组，从今天往回数连续天数；断卡即停、归零。
- **完成率**：`实际打卡天数 ÷ 应打卡天数`（应打卡天数按 `cycle_type/cycle_days` 从任务创建日算到今天）。
- **日历**：用 CSS Grid 手写月历，按 `checkin_date` 上色（绿=完成 / 灰=未完成）。
- **勋章**：连续天数 ≥7 / ≥21 / ≥30 时，对应勋章点亮（纯前端判断，不落库）。
- **导出 CSV**：把明细拼成 CSV 字符串 → `Blob` → `a[download]`，Excel 可直接打开，**不需要任何库**。
- **照片上传**：`supabase.storage.from('checkin-media').upload(...)` → `getPublicUrl()` 存入 `photo_url`。
- **任意创建任务（核心功能）**：`+ 新建任务` 弹窗里**所有字段全部自由填写** —— 任务名称、主题、描述、周期（每天 / 任意勾选周几）、截止时间（任意时刻）、打卡形式、星星数，**想建什么任务就建什么任务，没有任何预设限制**。
- **可选：一键填充 + 「我的常用」**（只为少打字，**不限制创建**，且**不占数据库表**）：
  ```js
  // 只是几个示例，点一下帮你预填表单；预填后照样可以随意改，也可以完全不用
  export const QUICK_FILL = [
    { title: '每日阅读', subject: '语文', description: '阅读 20 分钟，拍照上传', checkin_type: 'photo',    star_reward: 2 },
    { title: '每日口算', subject: '数学', description: '完成 1 页口算',        checkin_type: 'photo',    star_reward: 2 },
    { title: '每日跳绳', subject: '体育', description: '跳绳 300 个',          checkin_type: 'checkbox', star_reward: 1 },
    { title: '每日练字', subject: '语文', description: '练字 1 页',            checkin_type: 'photo',    star_reward: 2 }
  ];

  // 家长可把常建的任务「存为我的常用」——存浏览器本地，不新增数据库表
  const PRESET_KEY = 'my_task_presets';
  export const getMyPresets  = () => JSON.parse(localStorage.getItem(PRESET_KEY) || '[]');
  export const saveMyPreset  = (p) => {
    const list = getMyPresets(); list.unshift(p);                 // 最近用的排前面
    localStorage.setItem(PRESET_KEY, JSON.stringify(list.slice(0, 20)));
  };
  export const removeMyPreset = (i) => {
    const list = getMyPresets(); list.splice(i, 1);
    localStorage.setItem(PRESET_KEY, JSON.stringify(list));
  };
  ```
- ⚠️ 重要定位：**「+ 新建任务」永远是第一入口**；「一键填充 / 我的常用」只是可选的快捷按钮，家长可以完全无视、也可以随时清空。
- **预设卡通头像**（孩子端 / 家长端共用，不开放自定义上传）：
  ```js
  export const AVATARS = ['cat','dog','panda','rabbit','lion','fox','bear','penguin','dolphin','unicorn'];
  // 用 emoji 显示：🐱🐶🐼🐰🦁🦊🐻🐧🐬🦄
  ```

---

## 6. 账号创建说明（替代前端「新建 / 重置密码」）

> 前端做不到，但操作非常简单，**只需家长做一次**。

1. 打开 Supabase 控制台 → **Authentication → Users → Add user**
2. 输入孩子的**邮箱 + 密码** → 勾选「Auto Confirm User」→ 创建
3. 家长自己的账号：创建后点该用户 → **Raw User Meta Data** 填 `{"role":"admin"}`
4. 孩子的账号 **不用填**（默认就是孩子）
5. 孩子第一次登录 `child.html` 时，会自己填昵称 + 选头像（写入 `members`），家长端立刻可见

**重置孩子密码**：同样在 Users 列表里点该用户 → `Reset Password`。若孩子忘了密码，也可以让家长在控制台直接改一个。

---

## 7. 实现步骤建议（分 5 步）

| 步骤 | 内容 | 结果 |
|---|---|---|

| 第 2 步 | 新增 `clock.js`，改造 `auth.js`（角色跳转）、`index.html`/`login.html` | 登录后能各进各的页面 + 有时钟 |
| 第 3 步 | 新增 `member-api / star-api / reward-api / message-api / stats` | 数据能力就绪 |
| 第 4 步 | 做 `admin.html`（任务 → 记录 → 奖励 → 消息） | 家长端可用 |
| 第 5 步 | 做 `child.html`（今日 → 记录 → 奖励 → 消息）+ 卡通样式 | 孩子端可用 |

---

## 8. 精简对照（和上一版的区别）

| 项目 | 上一版 | 本精简版 | 变化 |
|---|---|---|---|
| 新增页面 | 13 个 | **2 个** | ↓ 11 |
| 新建表 | 10 张 | **5 张** | ↓ 5 |
| 修改表 | 2 张 | 2 张 | 不变 |
| 视图 | 2 个 | **0 个** | ↓ 2 |
| 前端做不到的功能 | 保留（需 Edge Function） | **全部去掉** | 架构不变 |
| 统计 / 证书 / 模板 | 各占 1 张表 | **前端算 / 前端显示 / 前端常量** | 更简单 |

---

## 9. 需求确认结论

用户已确认以下 3 点：

1. ✅ **页面结构**：家长端 1 个页面（`admin.html`）+ 孩子端 1 个页面（`child.html`），用页签切换
2. ✅ **账号创建**：家长在 Supabase 控制台创建孩子账号（前端做不到，操作步骤见第 6 章）
3. ✅ **打卡形式**：只保留「勾选 / 照片 / 文字」，去掉视频

### 9.1 补充确认（用户重点强调）

> **任务必须能「任意自由创建」，不能被固定模板限制。**

据此调整设计：

- `+ 新建任务` 是**唯一主入口**，表单所有字段全部自由填写：任务名称、主题、描述、周期（每天 / 任意勾选周几）、截止时间（任意时刻）、打卡形式、星星数 —— **想建什么就建什么，无任何限制**。
- 原来那 4 个「模板」**不再叫模板，只是可选的「一键填充」按钮**（帮家长少打字而已，点完照样能改，也能完全不用）。
- 家长还可把常建的任务「**存为我的常用**」，保存在**浏览器本地（localStorage）**，**不新增任何数据库表**，随时可删。
- 结论：新增表仍为 5 张，**任务创建完全自由**，功能、性能、复杂度都不受影响。

> 确认无误后，按第 7 章的 5 个步骤逐步实现代码。