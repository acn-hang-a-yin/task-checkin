# 代码文档

## 文件说明

### supabase-config.js
- 引入Supabase CDN SDK
- 预留URL和AnonKey配置位置
- 导出客户端实例供其他模块使用

### auth.js
- 用户认证相关功能
- login(): 用户登录
- logout(): 退出登录
- getCurrentUser(): 获取当前用户
- getUserRole(): 获取用户角色
- checkAuth(): 检查登录状态
- isAdmin(): 检查是否为管理员
- isUser(): 检查是否为普通用户

### task-api.js
- 任务相关API操作
- getAllTasks(): 获取所有任务
- createTask(): 新增任务（仅管理员）
- updateTask(): 更新任务（仅管理员）
- deleteTask(): 删除任务（仅管理员）
- 前端权限控制，普通用户调用会被拦截

### checkin-api.js
- 打卡相关API操作
- getUserCheckins(): 获取用户自己的打卡记录
- getAllUserCheckins(): 获取所有用户打卡记录（仅管理员）
- toggleCheckin(): 打卡/取消打卡
- isChecked(): 检查是否已打卡

### ui.js
- 用户界面渲染和交互
- showNotification(): 显示通知消息
- renderTaskList(): 渲染任务列表
- createTaskElement(): 创建任务元素
- renderAdminTaskForm(): 渲染管理员任务表单
- renderAdminCheckinStats(): 渲染管理员打卡统计
- renderPageByRole(): 根据角色渲染页面
- initPage(): 初始化页面

## 函数说明

### 通知系统
```javascript
showNotification(message, type = 'info')
```
- 显示通知消息
- type: 'info', 'success', 'error'

### 任务列表渲染
```javascript
renderTaskList()
```
- 根据用户角色渲染任务列表
- 管理员显示编辑删除按钮
- 普通用户显示打卡按钮

### 打卡操作
```javascript
toggleCheckin(taskId)
```
- 切换任务的打卡状态
- 自动处理新增或更新记录

### 页面初始化
```javascript
initPage()
```
- 检查登录状态
- 根据角色渲染相应界面
- 添加事件监听器

## 样式说明

### 基础样式
- 全局重置和盒模型
- 容器布局
- 响应式设计

### 组件样式
- 头部导航
- 登录表单
- 任务卡片
- 表单元素
- 统计图表
- 通知提示

### 主题色
- 主色：#4a6cf7 (蓝色)
- 成功色：#2ecc71 (绿色)
- 错误色：#e74c3c (红色)
- 警告色：#f57f17 (橙色)

## 数据库结构

### tasks 表
- id: UUID 主键
- title: 任务标题
- subject: 任务主题
- description: 任务描述
- due_date: 截止日期
- priority: 优先级 (low/normal/high)
- created_at: 创建时间

### task_checkins 表
- id: UUID 主键
- task_id: 任务ID (外键)
- user_id: 用户ID (外键)
- is_checked: 是否已打卡
- created_at: 创建时间
- updated_at: 更新时间
- 唯一约束：task_id + user_id

## 安全说明

- 所有敏感操作都有前端权限检查
- 管理员操作需要验证角色
- 用户只能操作自己的打卡记录
- SQL注入防护（使用Supabase参数化查询）

## 性能优化

- 模块化加载，按需引入
- 缓存用户信息
- 优化DOM操作
- 响应式图片和布局

## 兼容性

- 支持现代浏览器 (Chrome, Firefox, Safari, Edge)
- 移动端适配
- 无需polyfill，使用原生JavaScript

## 扩展建议

- 添加任务分类
- 增加搜索功能
- 添加任务提醒
- 支持任务附件
- 添加数据导出功能

## 调试技巧

- 使用浏览器开发者工具
- 检查网络请求
- 查看控制台错误
- 调试 Supabase 客户端

## 部署说明

- 静态文件可以直接部署到任何Web服务器
- 需要Supabase后端服务
- 配置CORS设置
- 设置正确的 Supabase URL 和 Anon Key

## 更新日志

- v1.0: 初始版本
- 支持基本任务管理和打卡功能
- 双角色权限系统
- 响应式设计

## 联系方式

如有问题或建议，请提交Issue或联系维护者。