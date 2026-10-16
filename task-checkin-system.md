# 家庭打卡系统 · 项目文档（合并版）

> 本文档由根目录原来的两份文档合并而来：
> - `ask-checkin-system.md`（功能扩展设计文档）—— 已删除，内容并入本文件
> - 旧版 `task-checkin-system.md`（初版「两张表 + ui.js」说明）—— 已删除，重复和过期的部分不再保留
>
> **约定：以后每次改代码，请顺手更新本文件**（第 12 章「更新日志」+ 对应章节）。
> 最后更新：2026-10-17

---

## 0. 这个系统是什么

给一个家庭用的「任务打卡 + 星星奖励」系统：家长建任务、看记录、批奖励、发留言；孩子打卡、看自己的日历和星星、申请兑换。

| 角色 | Supabase 里的标识 | 登录后进入 | 能做什么 |
|---|---|---|---|
| 家长 | `user_metadata.role = 'admin'` | `admin.html` | 建/改/删/暂停任务、看打卡记录与完成率、导出 CSV、加/扣星星、审核兑换、发留言 |
| 孩子 | 不填（默认 `user`） | `child.html` | 打卡（勾选/照片/文字）、看日历与连续天数、看勋章、申请兑换、收留言 |

- 权限全部在**前端**判断（`auth.js` 的 `requireAuth()`、各 `*-api.js` 里的 `isAdmin()`），数据库没有开 RLS。
- 角色不匹配会自动跳回自己的首页：家长进不了 `child.html`，孩子进不了 `admin.html`。

---

## 1. 技术栈

原生 HTML + 原生 CSS + 原生 JavaScript（ES Module）+ Supabase（PostgreSQL + Auth + Storage）。
无框架、无打包、无 RLS、纯前端权限控制，适合新手维护。

- 页面之间**不跳页**：家长端 / 孩子端各自是一个页面 + 4 个页签。
- 所有统计都在前端实时算（不建视图、不落统计表）。
- Supabase SDK 已整包放到本地 `js/vendor/supabase/`，**不依赖外网 CDN**（升级方式见 `tools/vendor-supabase.mjs`）。

---

## 2. 快速开始

### 2.1 配置 Supabase
1. 在 Supabase 建项目。
2. 打开 `js/supabase-config.js`，填好 `SUPABASE_URL` / `SUPABASE_ANON_KEY`。
3. 在 SQL Editor 里按第 4 章的顺序建表（一次性操作，可重复执行）。
4. 建 Storage 桶 `checkin-media`（存打卡照片，见 4.9）。

### 2.2 建账号（前端做不到，家长在控制台做一次）
1. Supabase 控制台 → Authentication → Users → Add user。
2. 填孩子的**邮箱 + 密码** → 勾选 Auto Confirm User → 创建。
3. 家长自己的账号：创建后点开该用户 → **Raw User Meta Data** 填 `{"role":"admin"}`。
4. 孩子的账号**不用填**（默认就是孩子）。
5. 孩子第一次打开 `child.html` 会自己填昵称 + 选头像（写进 `members` 表），家长端立刻可见。
6. 忘记密码：Users 列表点该用户 → `Reset Password`。

### 2.3 打开系统
浏览器打开 `index.html`（分流页）或 `login.html`（登录页）即可；也可以直接部署到 GitHub Pages。
登录成功后：家长 → `admin.html`，孩子 → `child.html`。
想先看看怎么用，可以直接打开 `guide.html`（使用说明，纯静态页面，不需要登录）。它是独立文件，系统页面上不放入口，发给家人 / 收藏成书签 / 打印出来都可以。

---

## 3. 目录结构（当前实际文件）

```
task-checkin-system/
├── index.html                  # 分流页：按角色自动跳转
├── login.html                  # 登录页
├── admin.html                  # 家长端（4 个页签）
├── child.html                  # 孩子端（4 个页签）
├── guide.html                  # ★ 使用说明（给人看的，不参与业务流程）
├── task-checkin-system.md      # ★ 本文档（合并版）
├── README.md                   # GitHub 首页说明（很简短）
├── css/
│   ├── style.css               # 老样式（登录页等仍在用）
│   ├── app.css                 # 新页面共用样式（类名 app- / tab- / panel- / card-）
│   └── child.css               # 孩子端卡通样式
├── js/
│   ├── supabase-config.js      # Supabase 客户端（单例）
│   ├── auth.js                 # 登录 / 退出 / 角色 / 页面守卫
│   ├── clock.js                # 顶部实时时钟
│   ├── idle-logout.js          # 5 分钟无操作自动登出
│   ├── ui-common.js            # 通知条 / 弹窗 / 二次确认 / 资料弹窗预览 / 转义 / 时间格式化
│   ├── task-api.js             # tasks 表
│   ├── checkin-api.js          # task_checkins 表 + 照片上传
│   ├── member-api.js           # members 表（昵称 / 头像）
│   ├── star-api.js             # star_records 表（星星流水 / 余额）
│   ├── reward-api.js           # rewards + reward_redemptions 表
│   ├── message-api.js          # messages 表
│   ├── stats.js                # 纯函数统计：连续天数 / 完成率 / 日历 / 勋章 / CSV
│   ├── presets.js              # 一键填充 +「我的常用」（只存在浏览器 localStorage）
│   ├── admin-ui.js             # 家长端页面逻辑
│   ├── child-ui.js             # 孩子端页面逻辑
│   └── vendor/supabase/        # 本地化的 supabase-js（不依赖 CDN）
├── docs/
│   ├── README.md               # 已合并，只留指路
│   └── code-docs.md            # 已合并，只留指路
└── tools/
    └── vendor-supabase.mjs     # 下载 / 升级本地 supabase-js 的脚本
```

### 3.1 已删除的历史文件（旧代码在 git 历史里，需要可以随时找回）

| 文件 | 为什么删 |
|---|---|
| `edit-task.html` | 「编辑任务」早就并进 `admin.html` 的弹窗了，这个页面没有任何入口链接（孤儿页） |
| `js/ui.js` | 旧版单页面（一个 `index.html` 干所有事）的渲染模块，只被上面的 `edit-task.html` 引用 |
| `js/ui.js.bak` | `ui.js` 的手工备份 |
| `ask-checkin-system.md` | 内容已并入本文件 |

---

## 4. 数据库（7 张表 + 1 个 Storage 桶，0 视图）

### 4.0 全新安装：先建两张老表，再加新字段

```sql
-- ① 任务表
CREATE TABLE IF NOT EXISTS public.tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  subject TEXT,
  description TEXT,
  due_date TIMESTAMPTZ,
  priority TEXT CHECK (priority IN ('low','normal','high')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ② 打卡表（唯一约束下一步会换成「同一天一条」）
CREATE TABLE IF NOT EXISTS public.task_checkins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  is_checked BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(task_id, user_id)
);
```

### 4.1 `tasks`（任务表，新增 6 个字段）

| 字段 | 类型 | 含义 / 谁在用 |
|---|---|---|
| `id` | UUID | 主键 |
| `title` | TEXT | 任务名称（任务卡、完成率列表用） |
| `subject` | TEXT | 主题 / 分类（语文、数学、家务…） |
| `description` | TEXT | 任务要求 |
| `cycle_type` | TEXT | `daily` 每天 / `weekly` 每周固定几天 |
| `cycle_days` | SMALLINT[] | 周几打卡：`1`=周一 … `7`=周日（只给 `weekly` 用，空数组=不打卡） |
| `deadline_time` | TIME | 当天截止时间，如 `21:00:00` |
| `checkin_type` | TEXT | `checkbox` 勾选 / `photo` 照片 / `text` 文字 |
| `star_reward` | INTEGER | 完成一次得几颗星 |
| `status` | TEXT | `active` 进行中 / `paused` 暂停 / `ended` 结束 ★ 今日列表、日历、完成率都看它 |
| `created_at` | TIMESTAMPTZ | ★ 完成率「应打卡天数」的起点 |
| `updated_at` | TIMESTAMPTZ | 任何修改都会写（`updateTask` / `setTaskStatus`）；★ **暂停任务用它当统计截止日** |
| `due_date` / `priority` | TIMESTAMPTZ / TEXT | 老字段，新界面基本不用（保留兼容） |

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

### 4.2 `task_checkins`（打卡表，新增 4 个字段 + 换唯一约束）

| 字段 | 类型 | 含义 / 谁在用 |
|---|---|---|
| `id` | UUID | 主键 |
| `task_id` | UUID | 哪个任务（删任务时一起删） |
| `user_id` | UUID | 哪个孩子 |
| `checkin_date` | DATE | ★ 打卡日期：日历上色、连续天数、完成率、去重全靠它 |
| `is_checked` | BOOLEAN | 是否完成（打卡写入 `true`；页面判断统一写 `is_checked !== false`） |
| `checkin_note` | TEXT | 孩子写的一句话 |
| `photo_url` | TEXT | 照片公网地址（Storage） |
| `stars_earned` | INTEGER | 本次获得星星（= 提交时的 `tasks.star_reward`） |
| `created_at` / `updated_at` | TIMESTAMPTZ | 打卡时间 / 最后修改时间 |

```sql
-- 1) 加字段
ALTER TABLE public.task_checkins
  ADD COLUMN IF NOT EXISTS checkin_note TEXT,
  ADD COLUMN IF NOT EXISTS photo_url    TEXT,
  ADD COLUMN IF NOT EXISTS stars_earned INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS checkin_date DATE DEFAULT CURRENT_DATE;

-- 2) 给历史数据补日期（否则旧记录 checkin_date 为空，日历上不会亮）
UPDATE public.task_checkins
   SET checkin_date = (COALESCE(updated_at, created_at, now()) AT TIME ZONE 'UTC')::date
 WHERE checkin_date IS NULL;

-- 3) 删掉旧的唯一约束（一个任务一个孩子只能一条 → 变成「每天一条」）
ALTER TABLE public.task_checkins
  DROP CONSTRAINT IF EXISTS task_checkins_task_id_user_id_key;

-- 4) 新的唯一约束：同一任务 + 同一人 + 同一天只能有一条（每日打卡靠它防重复）
ALTER TABLE public.task_checkins
  ADD CONSTRAINT task_checkins_task_user_date_key
  UNIQUE (task_id, user_id, checkin_date);
```

> ⚠️ 第 3、4 步最关键：不改的话「今天打过卡，明天再打」会插不进去。

### 4.3 `members`（成员昵称 / 头像，替代原计划的 user_profiles + family_relations）

| 字段 | 类型 | 含义 |
|---|---|---|
| `user_id` | UUID | 主键，= `auth.users.id` |
| `nickname` | TEXT | 昵称（家长端孩子下拉框、留言收件人取名都靠它） |
| `avatar_key` | TEXT | 预设卡通头像标识（`cat`/`dog`/`panda`… 见 `member-api.js` 的 `AVATARS`） |
| `created_at` / `updated_at` | TIMESTAMPTZ | 创建 / 修改时间 |

```sql
CREATE TABLE IF NOT EXISTS public.members (
  user_id    UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nickname   TEXT NOT NULL,
  avatar_key TEXT DEFAULT 'cat',           -- 预设卡通头像标识，不开放自定义上传
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

> 家长端的「孩子列表」= `members` 里**去掉自己**的全部成员（`getChildren()`）。

### 4.4 `star_records`（星星流水：打卡自动得星 + 家长手动加减 + 兑换扣星）

| 字段 | 类型 | 含义 |
|---|---|---|
| `user_id` | UUID | 这颗星属于谁 |
| `stars_change` | INTEGER | 得星为正、扣星为负（**余额 = 这个字段求和**） |
| `reason` | TEXT | 原因，如「完成：每日阅读」「主动帮妈妈洗碗」「兑换：看动画 30 分钟」 |
| `change_type` | TEXT | `auto` 打卡自动 / `manual` 家长加星 / `deduct` 扣星（家长扣、撤销打卡） / `redeem` 兑换扣星 |
| `created_by` | UUID | 谁操作的（家长手动时记家长；系统自动时记孩子） |
| `created_at` | TIMESTAMPTZ | 时间（流水按它倒序显示） |

```sql
CREATE TABLE IF NOT EXISTS public.star_records (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  stars_change INTEGER NOT NULL,            -- 得星为正，扣星为负
  reason       TEXT,
  change_type  TEXT DEFAULT 'auto'
      CHECK (change_type IN ('auto','manual','deduct','redeem')),
  created_by   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ DEFAULT now()
);
```

### 4.5 `rewards`（奖励池）

| 字段 | 类型 | 含义 |
|---|---|---|
| `name` | TEXT | 奖品名，如「看动画 30 分钟」 |
| `description` | TEXT | 说明 |
| `stars_required` | INTEGER | 兑换需要几颗星（孩子端星星不够时按钮是灰的） |
| `emoji` | TEXT | 用 emoji 当图标，省去图片上传 |
| `is_active` | BOOLEAN | `false` = 已下架（孩子端看不到，家长端显示「已下架」） |

```sql
CREATE TABLE IF NOT EXISTS public.rewards (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name           TEXT NOT NULL,
  description    TEXT,
  stars_required INTEGER NOT NULL DEFAULT 10,
  emoji          TEXT DEFAULT '🎁',
  is_active      BOOLEAN DEFAULT true,
  created_at     TIMESTAMPTZ DEFAULT now()
);
```

### 4.6 `reward_redemptions`（兑换申请 + 家长审核）

| 字段 | 类型 | 含义 |
|---|---|---|
| `reward_id` | UUID | 兑换哪个奖励（删奖励时申请一起删） |
| `user_id` | UUID | 谁申请的 |
| `stars_spent` | INTEGER | 申请时该奖励要几颗星（**通过时按这个数扣**） |
| `status` | TEXT | `pending` 待审核 / `approved` 已通过 / `rejected` 已驳回 |
| `review_notes` | TEXT | 审核备注（页面显示为「家长说：…」） |
| `created_at` / `reviewed_at` | TIMESTAMPTZ | 申请时间 / 审核时间 |

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

> 页面上显示的 `reward_name` / `reward_emoji` **不是表里的字段**，而是 `reward-api.js` 关联查询 `rewards` 后摊平加上的。

### 4.7 `messages`（家长留言 / 站内提醒）

| 字段 | 类型 | 含义 |
|---|---|---|
| `from_user_id` | UUID | 谁发的（家长） |
| `to_user_id` | UUID | 发给谁（孩子）★ 未读红点按它统计 |
| `content` | TEXT | 留言内容 |
| `is_read` | BOOLEAN | 孩子打开「消息」页后置为 `true`（红点消失） |
| `created_at` | TIMESTAMPTZ | 时间 |

```sql
CREATE TABLE IF NOT EXISTS public.messages (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
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

### 4.9 Storage 桶 `checkin-media`（存打卡照片）

```sql
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

- 路径规则：`{user_id}/{task_id}/{checkin_date}-{时间戳}.{后缀}`，单张照片上限 **5MB**（前端先拦一道）。
- 上传后把公网 URL 存进 `task_checkins.photo_url`。

### 4.10 初始数据（可选，方便测试）

```sql
INSERT INTO public.rewards (name, description, stars_required, emoji) VALUES
  ('看动画 30 分钟', '兑换后当天可看 30 分钟动画', 10, '📺'),
  ('买一个小玩具',   '周末去店里挑一个',            50, '🧸'),
  ('周末去游乐场',   '和家长一起去游乐场',         100, '🎡');
```

### 4.11 一键执行顺序（在 Supabase SQL Editor 里依次粘贴）

1. 【4.0】建 `tasks` / `task_checkins`
2. 【4.1】`tasks` 加 6 个字段
3. 【4.2】`task_checkins` 加字段 + 补日期 + 换唯一约束
4. 【4.3】`members`
5. 【4.4】`star_records`
6. 【4.5】`rewards`
7. 【4.6】`reward_redemptions`
8. 【4.7】`messages`
9. 【4.8】索引
10. 【4.9】Storage 桶与策略
11. 【4.10】示例奖励（可选）

> 全部都是「可重复执行」写法（`IF NOT EXISTS` / `DROP ... IF EXISTS`），执行失败可以放心重跑。

---

## 5. 家长端 `admin.html`（页签式，点标签切换，不跳页）

顶部固定栏：`🏠 家庭打卡 · 家长端` + 实时时钟 + `👤 昵称`（点一下可改昵称/头像，**弹窗顶部会显示当前昵称和当前头像**）+ `退出`。

| 页签 | 上面有什么 | 能做什么 |
|---|---|---|
| 📋 **任务** | 任务卡片列表，卡片上写：任务名、状态标签（进行中/已暂停/已结束）、📚 主题 · 周期 · ⏰ 截止 · ⭐ 星星 · 🖊 打卡形式、任务描述 | 「+ 新建任务」弹窗；每张卡：编辑 / 暂停 / 恢复 / 结束 / 删除（删除要二次确认，**它的打卡记录会一起删掉**） |
| 📊 **记录** | 孩子下拉框 + 4 个概览数字 + 月历（🟢🟡⚪）+ 当天明细 + 「任务完成率」列表 | 切换孩子、翻月份、点某天看当天提交（照片/文字）、删除某条打卡（**已发的星星会一起扣回**）、导出 CSV |
| 🎁 **奖励** | 左：孩子星星余额 + 加/扣星星 + 最近 12 条流水；中：奖励池（几个、增删改、下架）；右：兑换申请（待审核几个、同意/驳回） | 手动加星/扣星（要二次确认、原因会写进流水）；同意兑换 = 扣星 + 写流水；驳回 = 不扣星 |
| 💬 **消息** | 发留言的表单（选孩子 + 快捷短语）+ 历史留言列表（已读/未读标签） | 发留言、删除留言 |

### 5.1 任务卡片排序
`进行中 → 已暂停 → 已结束`，同一状态内按任务名（中文拼音序）排。已暂停 / 已结束的卡片整体变灰。

### 5.2 「+ 新建任务」弹窗字段（**所有字段自由填写，没有任何预设限制**）

| 字段 | 输入方式 | 说明 |
|---|---|---|
| 任务名称 * | 文本（最多 30 字） | 想叫什么就叫什么 |
| 主题 / 分类 | 文本 | 可选，如 语文 / 数学 / 体育 / 家务 |
| 任务描述 | 多行文本 | 写要求，如「阅读 20 分钟，拍照上传」 |
| 周期 | 单选 | 每天 / 每周固定几天 |
| 周几 | 多选（周一 ~ 周日） | 只在「每周固定几天」时出现；**一天都没勾会报错** |
| 截止时间 | 时间选择器 | 任意时刻，默认 `21:00` |
| 打卡形式 | 单选 | 勾选 / 照片 / 文字 |
| 星星奖励 | 数字 | 完成一次得几颗星（可以填 0 = 不发星） |
| 状态 | 单选 | 进行中 / 已暂停 / 已结束 |

- 「快捷填充」4 个按钮（`presets.js` 的 `QUICK_FILL`）只是帮你少打字，点完照样能改，也可以完全不用。
- 「我的常用」保存在**这台设备的浏览器里**（`localStorage` 的 `my_task_presets`，最多 20 条、同名的只留最新），不占数据库表；可以逐条点「×」删掉。

---

## 6. 孩子端 `child.html`（卡通、大字、大按钮）

顶部固定栏：`⭐ 我的星星：12` + 实时时钟 + `👤 头像昵称`（点一下可改，**弹窗顶部会显示当前昵称和当前头像**）+ `退出`。

| 页签 | 上面有什么 | 能做什么 |
|---|---|---|
| ✅ **今日** | 今天该做的任务大卡片（⭕ 待做 / ✅ 已完成）+ 右上角「已完成 x/y」 | 点卡片 → 打卡弹窗：拍照（任务要求照片时必选）、写一句话 → 提交得 ⭐；已完成的可以「重新记录」 |
| 📅 **记录** | 月历（有打卡的日子亮绿点）+ 「🔥 连续打卡 N 天」 | 点日期看当天打卡（任务名 / ⭐ +n / 文字 / 照片，点照片看大图） |
| 🎁 **奖励** | 勋章墙（7/21/30 天）+ 星星流水（最近 20 条）+ 奖励商店 + 我的兑换申请 | 星星够就点「兑换」提交申请；不够按钮是灰的；同一奖励有「等待家长审核」时不能再申请 |
| 💬 **消息** | 家长留言列表 | 打开这一页就算看过了：列表拉回来之后自动把留言标记已读，页签上的红点消失 |

- **首次登录引导**：`members` 里还没有自己 → 弹「欢迎第一次登录，先给自己起个名字吧～」，填昵称 + 从 10 个 emoji 头像里挑一个 → 保存（写进 `members` 表，家长端立刻能看到）。
- 孩子端**没有**任何「新增 / 编辑 / 删除任务」入口，**也没有删除打卡**的按钮（纠正记录只能在家长端做）；即使硬调接口，`task-api.js` / `checkin-api.js` 里的 `isAdmin()` 也会拦下来。
- 打卡弹窗里备注最多 200 字；照片超过 5MB 会被前端拦下并提示。

---

## 7. ★ 每个显示是怎么算出来的（口径总表）

### 7.0 三条通用约定（先看这里）

1. **日期按浏览器本地时区算**（`stats.js` 的 `toDateKey()`，把时间转成 `YYYY-MM-DD`）。存进数据库的 `checkin_date` 就是这个本地日期，所以不会出现「差一天」。
2. **「打卡了」= `task_checkins` 里有一条该孩子、该任务的记录，且 `is_checked !== false`**（正常流程打卡写的是 `true`；取消打卡 / 纠正错误都是**直接删记录**，不是改成 false）。
3. **「该打卡」= `isTaskScheduledOn(task, 某天)`**，只看 `tasks` 表：
   - `status === 'ended'` → 一律**不算**；
   - `cycle_type === 'weekly'` → 看 `cycle_days`（`1`=周一 … `7`=周日）包不包含这一天的星期几；**空数组 = 永远不算**；
   - 其它（`daily` 或老数据没有值）→ **每天都算**。

### 7.1 孩子端「今日」右上角：已完成 x / y

代码：`child-ui.js` → `renderTodayProgress()`

| 符号 | 怎么算 | 数据来源 |
|---|---|---|
| `y` | 今天该打卡的任务数：`tasks` 里 `status='active'` 且 `isTaskScheduledOn(task, 今天)` 的条数 | `tasks`（`getTodayTasks()`） |
| `x` | 上述任务里，今天（`checkin_date = 今天`）有打卡且 `is_checked === true` 的任务数（按 `task_id` 匹配） | `task_checkins` |

- 全都完成时数字会变绿（`.all-done`）。
- 今天没有任务时，这一行不显示文字，页面显示「今天没有任务，好好休息一下吧！」。

### 7.2 连续打卡 N 天（孩子端「记录」「奖励」，家长端「记录」概览）

代码：`stats.js` → `getOverallStreak()`

1. 取这名孩子**全部**打卡记录的 `checkin_date`（去重）。
2. 从**今天**往前数：今天有打卡就从今天数；今天还没打卡就**从昨天开始数**（这样早上不会因为还没打卡而显示 0）。
3. 哪一天没有打卡就**停**（断卡即归零）。

特点：**与任务周期无关** —— 当天完成过任意一个任务，这一天就算「打卡日」。

### 7.3 完成率（家长端「记录」页底部「任务完成率」）

代码：`stats.js` → `getRateRange()` + `getCompletionRate()`，页面在 `admin-ui.js` → `renderTaskCompletionRow()`

```
完成率 = round( 实际打卡天数 ÷ 应打卡天数 × 100 )      // 分母为 0 时算 0%（页面显示 —，见下）
```

- **分母 ← `tasks` 表**：从统计起点到统计终点**逐天**遍历，用 `isTaskScheduledOn()` 数出「该打卡」的天数（看 `created_at` / `cycle_type` / `cycle_days` / `status`）。
- **分子 ← `task_checkins` 表**：这些天里有打卡的天数，**同一天多条只算 1 天**（`Set` 去重）→ 所以单位是**天**，页面写的是 `完成/应打卡 天`（旧版误写成「次」，已修正）。

**统计区间（起点都是任务创建日 `tasks.created_at`，区别在终点）：**

| 任务状态 | 终点 | 页面显示 |
|---|---|---|
| `active` 进行中 | 今天 | `NN%` + `x/y 天` |
| `paused` 已暂停 | **暂停那天**（= `tasks.updated_at` 的日期，暂停时 `setTaskStatus()` 会写这个时间） | `NN%` + 灰标签「已暂停（算到 2026-10-10）」 |
| `ended` 已结束 | **最后一次打卡那天** | `NN%` + 标签「已结束」 |
| `ended` 已结束但一次都没打过卡 | —— | 百分比显示 `—`，副文字「结束前没有打卡记录」（旧版会显示一个永远 0%、且分母还在涨的 0%，已修正） |

**举例**（周一 / 三 / 五 的任务，10-01 创建，只在 10-02、10-05 打了卡）：

- 进行中：应打卡日 = 10-02、10-05、10-07、10-09、10-12、10-14、10-16 → **7 天**，完成 2 天 → **29%**（10-17 是周六，不统计）。
- 若它在 10-10 暂停：分母只剩 10-02、10-05、10-07、10-09 → **4 天**，完成 2 天 → **50%**（暂停之后不再往分母里加天数）。
- 若它在 10-16 结束、最后一次打卡是 10-12：分母 = 10-02、10-05、10-07、10-09、10-12 → 5 天 → 60%。

> ⚠️ **已知限制**：数据库里没有「暂停历史」，暂停只能靠 `tasks.updated_at` 近似。所以
> ① 暂停之后如果再**编辑**这个任务（名字/周期等，`updated_at` 被刷新），或
> ② 把它**恢复**成进行中，
> 暂停期间的那些天会重新算回分母，百分比会掉下来。要精确记录需要再加一张暂停历史表（当前不做）。

### 7.4 家长端日历上的点（🟢 / 🟡 / ⚪）

代码：`admin-ui.js` → `renderRecordCalendar()`

每天的颜色只看两件事：**当天完成了几条** vs **当天有几个「进行中」的任务该打卡**。

| 变量 | 怎么算 | 数据来源 |
|---|---|---|
| `doneCount` | 这一天该孩子的打卡**条数**（`is_checked !== false`） | `task_checkins.checkin_date` |
| `expected` | `tasks` 里 `status='active'` 且 `isTaskScheduledOn(task, 这一天)` 的**条数** | `tasks.status` + 周期字段 |

判定：

- `doneCount === 0` → **没有点**（灰）
- `0 < doneCount < expected` → **🟡 黄点**（`partial-dot`，颜色 `--color-warning` `#f39c12`）＝ 只完成了一部分
- 其它情况（含 `doneCount >= expected`，或当天有打卡但当天没有任何进行中任务）→ **🟢 绿点**（`dot`，颜色 `--color-success` `#2ecc71`）

要点：比较的是**任务条数**，不是百分比。因此**事后新增 / 删除 / 暂停任务会让过去某一天的颜色跟着变**（例：当天完成了 1 个任务、当时只有 1 个进行中任务 → 绿；后来又建了 2 个进行中的任务 → 这天变黄）。这是「用今天的任务清单回看历史」的设计取舍。

鼠标悬停格子会显示提示：`日期 完成 n 次`；日历标题是 `孩子昵称 · 年 月`；图例写在日历下方。

### 7.5 孩子端日历与当天明细

代码：`child-ui.js` → `renderChildCalendar()` / `renderChildDayDetail()`

- **绿点**：这一天至少有 1 条打卡（不区分完成几个、也**不看任务清单**）→ 孩子端只有「有 / 没有」两态，没有黄点、没有灰点。
- 点某天 → 列出 `checkin_date = 这天` 的记录：任务名、`⭐ +n`（`stars_earned`）、「有照片」标签、备注（`checkin_note`）、照片缩略图（点开看大图）。

### 7.6 家长端「记录」页顶部 4 个概览数字

代码：`admin-ui.js` → `renderRecordOverview()`

| 显示 | 怎么算 | 表 / 字段 |
|---|---|---|
| **连续打卡（天）** | `getOverallStreak(所有打卡日期)` | `task_checkins.checkin_date` |
| **累计打卡（天）** | 打卡日期**去重**后的个数（`new Set(keys).size`） | `task_checkins.checkin_date` |
| **累计完成任务（次）** | 打卡记录的**条数**（同一天做了 3 个任务 = 3 次） | `task_checkins` 的行数 |
| **累计获得星星 ⭐** | 这些打卡记录的 `stars_earned` 求和 | `task_checkins.stars_earned` |

> 注意：「累计获得星星」**不扣**家长扣星和兑换扣星，只看打卡赚了多少（要看净余额请去「奖励」页）。

### 7.7 星星余额与星星流水

代码：`star-api.js` → `getStarBalance()` / `getStarRecords()` / `insertStarRecord()`

- **余额 = `star_records` 里该孩子所有 `stars_change` 相加**（正数得星、负数扣星），前端实时求和，不落库。
- 显示位置：孩子端顶部「我的星星：N」、孩子端奖励页「我有 N ⭐」、家长端奖励页星星卡的大数字。
- **流水**：孩子端显示最近 20 条、家长端显示最近 12 条，内容 = `reason` + `stars_change`（带 +/-）+ 时间。

星星什么时候变（每一笔都会写一条流水，所以余额永远对得上）：

| 时机 | stars_change | change_type | reason |
|---|---|---|---|
| 孩子第一次打卡成功且 `tasks.star_reward > 0` | `+star_reward` | `auto` | `完成：任务名` |
| 同一天重复提交（改照片 / 改文字） | 不写流水（不会重复得星） | —— | —— |
| 家长手动加星 | `+n` | `manual` | 家长填的原因（默认「家长奖励」） |
| 家长手动扣星 | `-n` | `deduct` | 家长填的原因（默认「家长扣星」） |
| 家长删除一条打卡记录 | `-stars_earned` | `deduct` | `撤销打卡：任务名` |
| 家长同意兑换申请 | `-stars_spent` | `redeem` | `兑换：奖励名` |

### 7.8 勋章墙（孩子端「奖励」页）

代码：`stats.js` → `BADGES` / `getBadgeStates()`

- 用 **7.2 的连续打卡天数**去比较：

| 勋章 | 点亮条件 |
|---|---|
| 🌟 坚持 7 天 | 连续天数 ≥ 7 |
| 🏅 坚持 21 天 | 连续天数 ≥ 21 |
| 🏆 坚持 30 天 | 连续天数 ≥ 30 |

- 未点亮显示「还差 N 天」（`勋章天数 − 当前连续天数`）。**纯前端判断，不落库**，所以删掉打卡后勋章会立刻灭掉。

### 7.9 消息红点与已读

代码：`message-api.js`（`getUnreadCount()` / `markAllMessagesRead()`）+ `child-ui.js`（`refreshUnreadDot()`）

- **红点**（孩子端「💬 消息」页签上的小圆点）= `messages` 里 `to_user_id = 我` 且 `is_read = false` 的**条数 > 0**。
- 检查时机：进页面 600ms 后查一次，之后**每 60 秒**查一次（家长随时可能发留言）。
- **标记已读**：打开「消息」页 → 先把最新列表查回来并渲染出来 → 再把我收到的未读留言全部置 `is_read = true`（延迟 1.2 秒）→ 红点消失。顺序是刻意这样排的，避免「红点没了但孩子没看到新留言」。
- 家长端历史列表里的「已读 / 未读」标签 = `messages.is_read`。

### 7.10 兑换申请的状态文字

| `status` | 孩子端显示 | 家长端显示 |
|---|---|---|
| `pending` | 等待家长审核（黄） | 待审核（黄）+「同意（扣 n 星）」「驳回」按钮 |
| `approved` | 已通过 🎉（绿） | 已通过（绿） |
| `rejected` | 被驳回（红） | 已驳回（红） |

家长端的「📮 兑换申请（待审核 N）」里的 N = 列表里 `status === 'pending'` 的条数。

### 7.11 速查表：显示 ↔ 表 ↔ 字段 ↔ 代码

| 页面上的显示 | 数据来源表 | 关键字段 | 代码位置 |
|---|---|---|---|
| 今日任务卡片（⭕/✅） | `tasks` | `status` `cycle_type` `cycle_days` `deadline_time` `star_reward` `checkin_type` | `child-ui.js renderTodayList()` |
| 已完成 x/y | `tasks` + `task_checkins` | `tasks.status` + `task_checkins.checkin_date` | `child-ui.js renderTodayProgress()` |
| 连续打卡 N 天 | `task_checkins` | `checkin_date` | `stats.js getOverallStreak()` |
| 孩子端日历绿点 | `task_checkins` | `checkin_date` | `child-ui.js renderChildCalendar()` |
| 勋章墙 | `task_checkins` | `checkin_date` | `stats.js getBadgeStates()` |
| 星星余额 | `star_records` | `stars_change` | `star-api.js getStarBalance()` |
| 星星流水 | `star_records` | `reason` `stars_change` `created_at` | `star-api.js getStarRecords()` |
| 奖励商店 | `rewards` | `name` `emoji` `stars_required` `is_active` | `child-ui.js renderShop()` |
| 我的兑换申请 | `reward_redemptions`（+ `rewards`） | `status` `stars_spent` `review_notes` | `child-ui.js renderMyRedemptions()` |
| 消息红点 | `messages` | `is_read` `to_user_id` | `message-api.js getUnreadCount()` |
| 家长端任务卡 | `tasks` | 同「今日任务卡片」+ `description` | `admin-ui.js renderTaskItem()` |
| 家长端 4 个概览数字 | `task_checkins` | `checkin_date` `stars_earned` | `admin-ui.js renderRecordOverview()` |
| 家长端日历 🟢🟡⚪ | `task_checkins` + `tasks` | `checkin_date` + `status`/周期 | `admin-ui.js renderRecordCalendar()` |
| 完成率 | `tasks` + `task_checkins` | `created_at` `status` `updated_at` `cycle_*` `checkin_date` | `stats.js getRateRange()` / `getCompletionRate()` |
| 奖励池（N 个） | `rewards` | `is_active` | `admin-ui.js renderRewardPool()` |
| 待审核 N | `reward_redemptions` | `status = 'pending'` | `admin-ui.js renderRedemptionCard()` |
| 孩子下拉框（记录/奖励/消息） | `members` | `nickname` | `member-api.js getChildren()` |
| 顶部头像昵称 | `members` | `nickname` `avatar_key` | `member-api.js getMember()` |
| 顶部实时时钟 | 本机时间（不查库） | —— | `clock.js startClock()` |
| CSV 导出内容 | `task_checkins` + `tasks` | `checkin_date` `tasks.title` `tasks.subject` `is_checked` `stars_earned` `checkin_note` `photo_url` `created_at` | `admin-ui.js exportCurrentChildCheckins()` |

---

## 8. JS 模块职责（`js/`）

| 文件 | 对应表 | 主要导出函数 | 说明 |
|---|---|---|---|
| `supabase-config.js` | —— | `getSupabaseClient()` | 单例客户端；从本地 `vendor/` 引入，不走外网 CDN |
| `auth.js` | `auth.users` | `login` / `logout` / `getCurrentUser` / `getUserRole` / `isAdmin` / `homePageForRole` / `redirectByRole` / `requireAuth` / `getMyProfile` | 角色取自 `user_metadata.role`（缺省 = 孩子） |
| `clock.js` | —— | `startClock(elId)` | 顶部实时时钟，每秒刷新 |
| `idle-logout.js` | —— | `startIdleLogout({ timeoutMs })` / `IDLE_TIMEOUT_MS` | 5 分钟无操作自动登出 |
| `ui-common.js` | —— | `showNotification` / `escapeHtml` / `showModal` / `confirmDialog` / `profilePreviewHtml` / `bindProfilePreview` / `formatDateTime` / `formatTimeLabel` / `setButtonLoading` | 家长端 / 孩子端共用 |
| `task-api.js` | `tasks` | `getAllTasks` / `getActiveTasks` / `getTodayTasks` / `createTask` / `updateTask` / `deleteTask` / `setTaskStatus` / `normalizeTaskForm` | 写操作先 `isAdmin()` 拦截；`updateTask`、`setTaskStatus` 都会写 `updated_at` |
| `checkin-api.js` | `task_checkins` | `uploadCheckinPhoto` / `getCheckinsByDate` / `getCheckinsByUser` / `submitCheckin` / `deleteCheckin` | 打卡用 `upsert(onConflict: 'task_id,user_id,checkin_date')`；`deleteCheckin` 会写一条扣星流水 |
| `member-api.js` | `members` | `getMember` / `getMyProfile` / `saveProfile` / `getAllMembers` / `getChildren` / `AVATARS` / `avatarEmoji` | 昵称 + 预设头像 |
| `star-api.js` | `star_records` | `insertStarRecord` / `getStarRecords` / `getStarBalance` / `addStars` / `deductStars` | 所有星星变动都走 `insertStarRecord` |
| `reward-api.js` | `rewards` + `reward_redemptions` | `getRewards` / `createReward` / `updateReward` / `deleteReward` / `getRedemptions` / `requestRedemption` / `reviewRedemption` | `getRedemptions` 关联查询奖励名，摊平成 `reward_name` / `reward_emoji` |
| `message-api.js` | `messages` | `sendMessage` / `getMessagesForUser` / `getUnreadCount` / `markAllMessagesRead` / `getSentMessages` / `deleteMessage` | 未读计数用 `count: 'exact', head: true` |
| `stats.js` | **只算不存** | `toDateKey` / `todayKey` / `parseDateKey` / `addDays` / `getWeekday` / `isTaskScheduledOn` / `getOverallStreak` / `getRateRange` / `getCompletionRate` / `buildMonthMatrix` / `BADGES` / `getBadgeStates` / `downloadCsv` | 除了 `downloadCsv()` 都是**纯函数**，可以直接用 node 跑测试 |
| `presets.js` | 浏览器 `localStorage` | `QUICK_FILL` / `getMyPresets` / `saveMyPreset` / `removeMyPreset` | 不占数据库表 |
| `admin-ui.js` | —— | `initAdminPage()` | 家长端 4 个页签的全部渲染与交互 |
| `child-ui.js` | —— | `initChildPage()` | 孩子端 4 个页签的全部渲染与交互 |

> 约定：**页面代码不直接调 `supabase.from(...)`**，一律经过上表的 `*-api.js`；接口统一返回 `{ success, data?, error? }`，页面只负责渲染和提示。

---

## 9. 公共机制

### 9.1 顶部实时时钟（`clock.js`）
- 所有页面右上角（分流页在中间）显示 `2026年10月16日 21:05:07`，每秒刷新，纯本机时间，不查库。

### 9.2 5 分钟无操作自动登出（`idle-logout.js`）
- 监听 7 个「还在用」的事件：`mousedown` / `mousemove` / `keypress` / `keydown` / `scroll` / `touchstart` / `click`（**capture 阶段**绑定，页面里 `stopPropagation` 也拦不住）。
- 5 分钟（`IDLE_TIMEOUT_MS = 300000`）没有任何动作 → 调 `logout()` → 提示「由于长时间未操作，已自动退出登录」→ `localStorage.clear()` → 1.2 秒后回到 `login.html`。
- 退出失败（比如刚好断网）不会把人干晾在页面上，会**重新开始计时**。
- 家长端 / 孩子端都在 `initXxxPage()` 里调用 `startIdleLogout()`；一个页面只启动一次。

### 9.3 切回页面自动刷新（`bindAutoRefresh()`）
- 监听 `visibilitychange`（手机切出去再切回来）和 `focus`（桌面切窗口）。
- 触发时：先刷新顶部星星数和消息红点，再**静默**重拉当前页签的数据（不显示「加载中…」、失败也不覆盖已有画面，只在控制台留一条 warn）。
- 3 秒内不重复刷新，免得来回切换时狂发请求。

### 9.4 页签切换的数据策略
- 第一次打开某个页签：正常加载，显示「加载中…」。
- 之后再打开：先把上次的数据摆出来，**同时在后台静默拉一次最新**（点了页签也算刷过一次）。

### 9.5 提示 / 弹窗 / 二次确认（`ui-common.js`）
- `showNotification(text, type)`：顶部提示条，3 秒自动消失；`type` = `info` / `success` / `error`。
- `showModal(html, { title })` + `confirmDialog(message)`：删除任务、删打卡、加/扣星、审核兑换等**危险操作都会先弹二次确认**。
- `profilePreviewHtml({ nickname, avatar, tip })` + `bindProfilePreview(root, { avatars })`：昵称 / 头像弹窗顶部的**「当前昵称 + 当前头像」预览块**。打开时按 `state.profile` 回填（家长端在 `initAdminPage()` 里读一次并缓存，保存成功后同步更新），改昵称或换头像时预览**实时跟着变**；一旦动过就变成橙色边 + 「已修改，点「保存」后才会生效」。
- 所有用户输入上屏前都过 `escapeHtml()`，避免把脚本写进页面。

### 9.6 导出 CSV
- 家长端「记录」页点「⬇ 导出 CSV」：把当前孩子的全部打卡拼成 CSV → `Blob` → 浏览器下载（加了 BOM，Excel 打开不乱码），文件名 `孩子昵称-打卡记录-2026-10-17.csv`。
- 列：`日期` / `任务` / `科目` / `是否完成` / `获得星星` / `打卡说明` / `照片链接` / `打卡时间`，按日期升序。

### 9.7 打卡照片（Storage）
- 只允许一张照片、5MB 以内；路径 `{user_id}/{task_id}/{checkin_date}-{时间戳}.{后缀}`，桶 `checkin-media`（公开读）。
- 上传成功后把公网 URL 写进 `task_checkins.photo_url`；页面上点缩略图可以看大图。

### 9.8 入口守卫与角色跳转
- `index.html`：`getCurrentUser()` → 有登录就 `redirectByRole()`（家长 → `admin.html`，孩子 → `child.html`），没登录就去 `login.html`。
- `admin.html` / `child.html`：`requireAuth(['admin'])` / `requireAuth(['user'])`；未登录跳登录页，**角色不对**会提示「权限不足：正在为你跳转到正确的页面」并 800ms 后跳回自己的首页。

### 9.9 登录失败提示（`auth.js` 的 `friendlyAuthError()`）
把 Supabase 的英文错误码翻译成看得懂的中文，常见几种：密码不对、邮箱没验证、账号被禁用、密码太弱、试太多次、Key 填错、网络失败。原始错误（code / status / message）会打到控制台，方便排查。

---

## 10. 代码规范（沿用初版文档的约定）

1. 使用 **ES Module**：页面 HTML 里只留挂载点和一行入口脚本，业务逻辑全部在 `js/` 里。
2. 新增 / 修改数据库字段时，**同步改这几处**：对应的 `*-api.js`（读写）、`stats.js`（如果参与统计）、`admin-ui.js` / `child-ui.js`（渲染与提示）、本文档相关章节。
3. 注释写「**为什么这么做**」，不写「这一行做了什么」；踩过的坑要写清来龙去脉（例如 `idle-logout.js`、`child-ui.js` 顶部那段说明）。
4. 所有取数都走 `js/*-api.js`，返回 `{ success, data?, error? }`，错误用提示条告诉用户、原始错误打到控制台。
5. 用户输入一律 `escapeHtml()` 后再拼进 HTML。
6. **不使用 RLS、不使用数据库权限策略**，权限全部在前端判断（家庭内部使用，逻辑简单为先）。
7. 统计逻辑尽量写成**纯函数**放在 `stats.js`，这样能直接用 node 跑验证，不用开浏览器。
8. 改完代码顺手更新本文档（第 12 章更新日志 + 受影响的章节）和 `guide.html`。

---

## 11. 常见问题 & 维护提示

| 问题 | 原因 / 怎么办 |
|---|---|
| 改了代码，页面还是老的 | 浏览器缓存了 ES Module，按 **Ctrl + Shift + R** 强制刷新 |
| 直接双击 `admin.html` 打不开 / 白屏 | ES Module 需要 `http://` 协议（浏览器不允许 `file://` 加载模块）。用本地服务器（VS Code Live Server、`python -m http.server`）或部署到 GitHub Pages |
| 完成率和我算的差几天 | 分母是「按当前周期从创建日回算」（见 7.3）；**暂停 / 结束 / 改周期 / 改创建日**都会影响它。暂停任务的分母只算到暂停那天 |
| 过去某天的日历颜色变了 | 正常现象：颜色比的是「当天完成条数 vs 当前进行中任务数」（见 7.4），事后加/删/暂停任务会按新清单重算 |
| 孩子看不到某个任务 | ① 任务不是「进行中」；② 是每周任务但没勾周几；③ 今天不是勾选的星期（见 7.0 第 3 条） |
| 孩子一天能打几次卡 | 一个任务一天只留一条记录（`task_id + user_id + checkin_date` 唯一）。再点「重新记录」是同一天覆盖，**不会重复得星** |
| 星星数量不对 | 家长端「奖励」页看星星流水：每一笔都有原因（完成/奖励/扣星/撤销打卡/兑换）。余额就是流水求和 |
| 打卡记录打错了 | 家长端「记录」页 → 点那一天 → 点「删除」，**星星会自动扣回**（孩子端没有删除按钮） |
| 停用的任务想留着看历史 | 用「暂停」而不是「删除」；删任务会连带删掉它的全部打卡记录（外键 `ON DELETE CASCADE`） |
| 怎么加第二个孩子 | Supabase 控制台再建一个账号（不用填 role），孩子第一次登录自己填昵称即可；家长端下拉框会自动出现 |
| 忘记密码 | Supabase 控制台 → Users → 点该用户 → `Reset Password`（前端做不到，也不该做） |
| 页面上出现「读取失败」 | 多半是网络 / Supabase 临时问题。静默刷新失败**不会清空已有画面**，可以刷新页面重试；详细错误看浏览器控制台 |
| 5 分钟没动就退出登录 | 这是设计如此（防止平板放着不管），见 9.2；要改时长就改 `idle-logout.js` 的 `IDLE_TIMEOUT_MS` |
| 孩子端页签上的红点 | 家长发过留言且孩子还没打开「消息」页，见 7.9 |

---

## 12. 更新日志

| 日期 / 提交 | 内容 |
|---|---|
| **2026-10-17（追加）** | **修复：改昵称 / 头像弹窗**现在会显示**当前昵称 + 当前头像**：家长端原来昵称框是空白、头像永远默认预选 🐱（`admin.html` 侧没有缓存自己的资料），孩子端也补上预览块；改名字 / 换头像时顶部预览**实时跟着变**，未保存显示橙色提醒（`ui-common.js` 新增 `profilePreviewHtml()` / `bindProfilePreview()`） |
| **2026-10-17（本次）** | **修复：完成率单位**由「次」改为「天」（它统计的是天数，不是打卡条数）<br>**修复：已暂停任务**不再被计入「应打卡」分母（算到暂停那天），与日历「只算进行中任务」口径一致；标签显示「已暂停（算到 YYYY-MM-DD）」<br>**修复：已结束且从未打卡**的任务显示 `—` 而不是永远 0%（旧版分母还会一直涨）<br>**整理：删除孤儿文件** `edit-task.html` / `js/ui.js` / `js/ui.js.bak`，并清理 10 个没有任何页面调用的函数（见附录 A）<br>**新增：** `guide.html` 使用说明页（独立静态文件，双击 / 浏览器直接打开，不在业务页面上放入口）；两份 MD 合并为本文件 |
| `71c4b69` | 5 分钟无操作自动登出恢复生效（`js/idle-logout.js`）；连续打卡天数 BUG 修正（孩子端勋章墙不再显示已被删除的打卡） |
| `8357998` | 页签点击时才加载对应数据（懒加载 + 静默刷新） |
| `66986fe` | supabase-js 本地化（去掉 CDN 依赖） |
| `42a1ae0` | 重构为家长端 / 孩子端双角色页面（`admin.html` + `child.html`） |
| 更早 | 初版单页面（`index.html` + `js/ui.js`，两张表），任务列表重复、自动 LOGOUT 等问题修复 |

---

## 附录 A：本次删除的文件与函数

**文件**

| 文件 | 为什么可以删 |
|---|---|
| `edit-task.html` | 「编辑任务」早已并进 `admin.html` 弹窗；这个页面没有任何入口链接（孤儿页） |
| `js/ui.js` | 旧版单页面的渲染模块，唯一引用者就是 `edit-task.html` |
| `js/ui.js.bak` | `ui.js` 的手工备份 |
| `ask-checkin-system.md` | 内容已并入本文档 |

**函数（都没有任何页面调用；git 历史里可找回）**

| 位置 | 函数 | 说明 |
|---|---|---|
| `checkin-api.js` | `getUserCheckins()` / `getAllUserCheckins()` | 旧单页面的读记录方式；现在用 `getCheckinsByUser()` / `getCheckinsByDate()` |
| `checkin-api.js` | `isChecked()` / `toggleCheckin()` | 旧版「点一下切换打卡」；现在统一走 `submitCheckin()` |
| `auth.js` | `checkAuth()` / `isUser()` | 旧的登录状态判断；现在页面用 `requireAuth()` |
| `clock.js` | `stopClock()` | 定时器随页面关闭自动清理，不需要手动停 |
| `presets.js` | `clearMyPresets()` | 一键清空「我的常用」；现在可以逐条点「×」删 |
| `stats.js` | `countScheduledDays()` / `getStreakForTask()` | 前者已并入 `getCompletionRate()` 的循环；后者（单任务连续天数）页面没用到，统一显示 `getOverallStreak()`（当天完成任意任务即算打卡日） |
| `supabase-config.js` | `export { supabase }` 兼容导出 | 只有已删除的 `edit-task.html` 用它 |

---

## 附录 B：原来的设计取舍（来自已删除的 `ask-checkin-system.md`）

### B.1 去掉的需求（前端做不到 / 太复杂）

| 原需求 | 处理 | 原因 / 替代方案 |
|---|---|---|
| 前端「新建孩子账号 / 重置孩子密码」 | ❌ 去掉 | 需要 Service Role Key，放前端等于泄露数据库 → 改到 Supabase 控制台（第 2.2 节） |
| 真机推送提醒 | ❌ 去掉 | 纯前端做不到 → 改成站内消息（孩子打开页面看红点） |
| 短视频上传 | ❌ 去掉 | 只保留「勾选 / 照片 / 文字」三种打卡形式 |
| 数据库视图 | ❌ 去掉 | 统计改由前端实时计算（家庭数据量小，够快） |
| 任务模板表 | ❌ 去掉 | 任务完全自由创建；另给 4 个「一键填充」+ 浏览器本地「我的常用」 |
| 打卡统计表 `checkin_stats` | ❌ 去掉 | 连续天数、完成率前端算，不落库 |
| 打卡证书表 `certificates` | ❌ 去掉 | 勋章按连续天数前端点亮（7/21/30 天） |
| `user_profiles` + `family_relations` | 🔁 合并 | 合并成一张极简 `members` |
| 提醒表 + 消息表 | 🔁 合并 | 合并成一张 `messages` |

### B.2 需求确认结论

1. ✅ 页面结构：家长端 1 个（`admin.html`）+ 孩子端 1 个（`child.html`），用页签切换。
2. ✅ 账号创建：家长在 Supabase 控制台建孩子账号。
3. ✅ 打卡形式：只保留「勾选 / 照片 / 文字」，去掉视频。
4. ✅ **任务必须能完全自由创建**，不能被固定模板限制：「+ 新建任务」是唯一主入口，所有字段自由填写；「一键填充 / 我的常用」只是可选的快捷按钮，可完全不用，也不占数据库表。

### B.3 结果速览

| 项目 | 结果 |
|---|---|
| 页面 | 2 个（`admin.html` + `child.html`），另有一个不参与业务的 `guide.html` |
| 新增表 | 5 张（`members` / `star_records` / `rewards` / `reward_redemptions` / `messages`） |
| 修改表 | 2 张（`tasks` 加 6 个字段；`task_checkins` 加 4 个字段并换唯一约束） |
| 视图 | 0 个 |
| 额外资源 | 1 个 Storage 桶（存打卡照片） |


