# 任务打卡系统 | 项目文档
## 技术栈
原生 HTML + CSS + 原生 JavaScript ES Module + Supabase
无框架、无打包、无RLS、纯前端权限控制、适合新手维护

## 项目说明
本系统分为两种角色：管理员、普通用户
1. 管理员：可以新增、编辑、删除任务，查看所有人打卡记录
2. 普通用户：只能查看任务、给自己打卡/取消打卡，**不能新增、修改、删除任何任务**
3. 权限全部前端控制，不使用数据库RLS，逻辑简单易懂
4. 用户角色存储在 Supabase 用户 metadata：admin / user

# 1. 系统功能
## 管理员功能
- 新增任务
- 编辑已有任务
- 删除任务
- 查看全部任务
- 查看所有用户的打卡记录

## 普通用户功能
- 查看全部任务列表
- 对自己的任务进行打卡 / 取消打卡
- 只能查看自己的打卡状态
- **完全隐藏任务新增、编辑、删除功能**
- 前端拦截所有越权操作

## 公共功能
- 邮箱密码登录
- 退出登录
- 自动识别角色渲染对应界面

# 2. 数据库结构（仅两张表、无RLS、无策略）
请在 Supabase SQL Editor 执行以下 SQL

### 创建表结构（如果表不存在）
```sql
-- 任务表（管理员管理）
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

-- 用户打卡表（所有人只能操作自己的）
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

### 修改现有表结构（添加updated_at字段）
```sql
-- 为现有tasks表添加updated_at字段
ALTER TABLE public.tasks 
ADD COLUMN updated_at TIMESTAMPTZ DEFAULT now();

-- 为现有task_checkins表添加updated_at字段（如果需要）
ALTER TABLE public.task_checkins 
ADD COLUMN updated_at TIMESTAMPTZ DEFAULT now();
```

# 3. 用户角色配置方式（非常简单）
1. 进入 Supabase - Authentication - Users
2. 新建账号
3. 管理员账号 metadata 填写：
{"role":"admin"}
4. 普通用户不用填，默认普通用户

# 4. 项目目录结构（必须严格遵守）
```
task-checkin-system/
├── index.html
├── login.html
├── css/style.css
├── js/
│   ├── supabase-config.js
│   ├── auth.js
│   ├── task-api.js
│   ├── checkin-api.js
│   └── ui.js
└── docs/
    ├── README.md
    └── code-docs.md
```

# 5. 各文件功能说明
## supabase-config.js
- 引入 Supabase CDN SDK
- 预留 URL、AnonKey 配置位置
- 导出客户端实例

## auth.js
- 登录、退出
- 获取当前用户角色
- 登录状态检测、未登录跳转登录页

## task-api.js（带前端权限拦截）
- 获取所有任务（所有人可读）
- 新增任务：仅 admin 可操作
- 修改任务：仅 admin 可操作
- 删除任务：仅 admin 可操作
- 普通用户调用直接拦截，不发请求

## checkin-api.js
- 获取自己的打卡记录
- 管理员可查看全部打卡记录
- 打卡/取消打卡自动新增或更新记录

## ui.js
- 根据角色渲染页面
- 管理员：显示任务表单、编辑删除按钮、全部打卡
- 普通用户：只显示任务 + 打卡按钮
- 弹窗提示、渲染列表

## login.html
- 登录界面
- 错误提示

## index.html
- 主页面动态角色视图

## style.css
- 全局样式、卡片、按钮、响应式

# 6. 页面渲染规则
1. 管理员视图
- 显示【新增任务表单】
- 每个任务显示【编辑、删除】按钮
- 显示全部用户打卡统计

2. 普通用户视图
- **完全隐藏任务新增、编辑、删除**
- 每个任务只显示【打卡/取消打卡】
- 只看自己的打卡状态

# 7. 代码规范
- 使用 ES Module
- 所有 JS 文件分离，不写死在 HTML
- 代码注释完整
- 错误捕获、友好提示
- 不使用 RLS、不使用任何数据库权限策略

# 任务打卡系统｜最终定稿需求文档（Cline专用）
## 技术栈
原生 HTML + CSS + 原生 JavaScript ES Module + Supabase
无框架、无打包、无RLS、纯前端权限控制、适合新手维护

## 项目说明
本系统分为两种角色：管理员、普通用户
1. 管理员：可以新增、编辑、删除任务，查看所有人打卡记录
2. 普通用户：只能查看任务、给自己打卡/取消打卡，**不能新增、修改、删除任何任务**
3. 权限全部前端控制，不使用数据库RLS，逻辑简单易懂
4. 用户角色存储在 Supabase 用户 metadata：admin / user

# 1. 系统功能
## 管理员功能
- 新增任务
- 编辑已有任务
- 删除任务
- 查看全部任务
- 查看所有用户的打卡记录

## 普通用户功能
- 查看全部任务列表
- 对自己的任务进行打卡 / 取消打卡
- 只能查看自己的打卡状态
- **完全隐藏任务新增、编辑、删除功能**
- 前端拦截所有越权操作

## 公共功能
- 邮箱密码登录
- 退出登录
- 自动识别角色渲染对应界面

# 2. 数据库结构（仅两张表、无RLS、无策略）
请在 Supabase SQL Editor 执行以下 SQL
```sql
-- 任务表（管理员管理）
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

-- 用户打卡表（所有人只能操作自己的）
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

# 3. 用户角色配置方式（非常简单）
1. 进入 Supabase - Authentication - Users
2. 新建账号
3. 管理员账号 metadata 填写：
{"role":"admin"}
4. 普通用户不用填，默认普通用户

# 4. 项目目录结构（必须严格遵守）
```
task-checkin-system/
├── index.html
├── login.html
├── css/style.css
├── js/
│   ├── supabase-config.js
│   ├── auth.js
│   ├── task-api.js
│   ├── checkin-api.js
│   └── ui.js
└── docs/
    ├── README.md
    └── code-docs.md
```

# 5. 各文件功能说明
## supabase-config.js
- 引入 Supabase CDN SDK
- 预留 URL、AnonKey 配置位置
- 导出客户端实例

## auth.js
- 登录、退出
- 获取当前用户角色
- 登录状态检测、未登录跳转登录页

## task-api.js（带前端权限拦截）
- 获取所有任务（所有人可读）
- 新增任务：仅 admin 可操作
- 修改任务：仅 admin 可操作
- 删除任务：仅 admin 可操作
- 普通用户调用直接拦截，不发请求

## checkin-api.js
- 获取自己的打卡记录
- 管理员可查看全部打卡记录
- 打卡/取消打卡自动新增或更新记录

## ui.js
- 根据角色渲染页面
- 管理员：显示任务表单、编辑删除按钮、全部打卡
- 普通用户：只显示任务 + 打卡按钮
- 弹窗提示、渲染列表

## login.html
- 登录界面
- 错误提示

## index.html
- 主页面动态角色视图

## style.css
- 全局样式、卡片、按钮、响应式

# 6. 页面渲染规则
1. 管理员视图
- 显示【新增任务表单】
- 每个任务显示【编辑、删除】按钮
- 显示全部用户打卡统计

2. 普通用户视图
- **完全隐藏任务新增、编辑、删除**
- 每个任务只显示【打卡/取消打卡】
- 只看自己的打卡状态

# 7. 代码规范
- 使用 ES Module
- 所有 JS 文件分离，不写死在 HTML
- 代码注释完整
- 错误捕获、友好提示
- 不使用 RLS、不使用任何数据库权限策略
