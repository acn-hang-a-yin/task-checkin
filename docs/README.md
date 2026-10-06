# 任务打卡系统

一个基于原生HTML、CSS和JavaScript的任务打卡系统，使用Supabase作为后端服务。

## 功能特点

- **双角色系统**：管理员和普通用户
- **权限控制**：前端权限控制，不使用数据库RLS
- **任务管理**：管理员可以新增、编辑、删除任务
- **打卡功能**：用户可以对自己任务进行打卡/取消打卡
- **统计功能**：管理员可以查看所有用户的打卡统计

## 目录结构

```
task-checkin-system/
├── index.html          # 主页面
├── login.html          # 登录页面
├── css/
│   └── style.css       # 样式文件
├── js/
│   ├── supabase-config.js  # Supabase配置
│   ├── auth.js         # 认证模块
│   ├── task-api.js     # 任务API
│   ├── checkin-api.js  # 打卡API
│   └── ui.js          # UI渲染模块
└── docs/
    ├── README.md       # 项目说明
    └── code-docs.md    # 代码文档
```

## 快速开始

1. 在Supabase中创建项目
2. 在 `js/supabase-config.js` 中填写您的SUPABASE_URL和SUPABASE_ANON_KEY
3. 在Supabase中执行建表SQL
4. 创建用户并设置管理员角色
5. 运行项目

## 用户角色

- **管理员**：metadata中设置 `{"role":"admin"}`
- **普通用户**：默认角色，无需设置metadata

## 技术栈

- 原生HTML5
- 原生CSS3
- 原生JavaScript (ES Module)
- Supabase (PostgreSQL数据库)
- Supabase Auth (用户认证)

## 开发说明

- 使用ES Module模块化开发
- 所有JavaScript文件分离，不写死在HTML中
- 完整的错误处理和用户提示
- 响应式设计，支持移动端访问

## 贡献

欢迎提交Issue和Pull Request来改进这个项目。