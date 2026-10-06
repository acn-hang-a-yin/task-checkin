# 任务打卡系统

一个基于 Supabase 的任务打卡管理系统，支持管理员创建任务、用户打卡功能。

## 功能特性

- **管理员功能**：
  - 创建、编辑、删除任务
  - 查看所有用户的打卡统计
  - 管理用户权限

- **普通用户功能**：
  - 查看任务列表
  - 打卡/取消打卡
  - 查看个人打卡记录

## 技术栈

- **前端**：HTML5, CSS3, JavaScript (ES6+)
- **数据库**：Supabase (PostgreSQL)
- **认证**：Supabase Auth
- **部署**：GitHub Pages

## 本地开发

1. 克隆项目到本地
2. 在 Supabase 项目设置中配置数据库表：
   - `tasks` 表：存储任务信息
   - `task_checkins` 表：存储打卡记录
3. 更新 `js/supabase-config.js` 中的 URL 和 Anon Key
4. 用浏览器打开 `index.html` 或 `login.html`

## 部署到 GitHub Pages

### 1. 创建 GitHub 仓库
- 将项目推送到 GitHub 仓库
- 确保仓库设置为 Public（GitHub Pages 仅支持 Public 仓库）

### 2. 启用 GitHub Pages
- 进入仓库的 Settings
- 找到 Pages 部分
- Source 选择 "Deploy from a branch"
- 选择 main/master 分支
- 点击 Save

### 3. 配置自定义域名（可选）
- 在 Pages 设置中配置自定义域名

### 4. 注意事项
- 确保所有文件路径正确
- 检查 JavaScript 模块导入路径
- 等待几分钟让 GitHub Pages 更新缓存

## 故障排除

### 常见问题

1. **`net::ERR_CONNECTION_RESET` 错误**
   - 检查网络连接
   - 尝试清除浏览器缓存（Ctrl+Shift+R）
   - 检查 Supabase 服务状态

2. **`favicon.ico 404` 错误**
   - 已通过内联 SVG favicon 解决
   - 不影响系统功能

3. **模块加载失败**
   - 检查 JavaScript 文件路径
   - 确保文件编码为 UTF-8
   - 检查 GitHub Pages 文件结构

### 调试步骤

1. 打开浏览器开发者工具 (F12)
2. 查看 Console 标签中的错误信息
3. 查看 Network 标签中的请求状态
4. 检查 Supabase 控制台中的错误日志

## 环境变量

在 `js/supabase-config.js` 中配置：

```javascript
const SUPABASE_URL = '你的 Supabase 项目 URL';
const SUPABASE_ANON_KEY = '你的 Supabase Anon Key';
```

## 贡献

欢迎提交 Issue 和 Pull Request！

## 许可证

MIT License
