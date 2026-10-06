// UI 渲染模块
import { supabase } from './supabase-config.js';
import { getUserRole, logout, getCurrentUser } from './auth.js';
import { getAllTasks, createTask, updateTask, deleteTask } from './task-api.js';
import { getUserCheckins, getAllUserCheckins, toggleCheckin, isChecked } from './checkin-api.js';

// 显示提示信息
export function showNotification(message, type = 'info') {
  const notification = document.createElement('div');
  notification.className = `notification ${type}`;
  notification.textContent = message;

  document.body.appendChild(notification);

  setTimeout(() => {
    notification.remove();
  }, 3000);
}

// 渲染任务列表
export async function renderTaskList() {
  const taskList = document.getElementById('task-list');
  const role = await getUserRole();

  if (!taskList) return;

  // 清空现有内容
  taskList.innerHTML = '';

  try {
    const { success, data, error } = await getAllTasks();

    if (!success) {
      throw new Error(error);
    }

    if (data.length === 0) {
      taskList.innerHTML = '<p class="no-tasks">暂无任务</p>';
      return;
    }

    // 等待所有任务元素创建完成
    const taskElements = await Promise.all(data.map(task => createTaskElement(task, role)));

    taskElements.forEach(taskElement => {
      taskList.appendChild(taskElement);
    });

  } catch (error) {
    showNotification(`加载任务失败: ${error.message}`, 'error');
  }
}

// 创建任务元素
async function createTaskElement(task, role) {
  const taskElement = document.createElement('div');
  taskElement.className = 'task-card';
  taskElement.dataset.taskId = task.id;

  // 确保 isCheckedStatus 是已解析的值，而不是 Promise
  const isCheckedStatus = role === 'user' ? await isChecked(task.id) : null;

  let taskContent = `
    <div class="task-header">
      <h3 class="task-title">${task.title}</h3>
      ${task.subject ? `<span class="task-subject">${task.subject}</span>` : ''}
      <span class="task-priority priority-${task.priority}">${task.priority}</span>
    </div>
    ${task.description ? `<p class="task-description">${task.description}</p>` : ''}
    ${task.due_date ? `<p class="task-due-date">截止日期: ${new Date(task.due_date).toLocaleDateString()}</p>` : ''}
  `;

  if (role === 'admin') {
    // 管理员视图：显示编辑和删除按钮
    taskContent += `
      <div class="task-actions">
        <button class="btn edit-task" data-task-id="${task.id}">编辑</button>
        <button class="btn delete-task" data-task-id="${task.id}">删除</button>
      </div>
    `;
  } else {
    // 普通用户视图：显示打卡按钮
    taskContent += `
      <div class="task-actions">
        <button class="btn checkin-btn ${isCheckedStatus ? 'checked' : ''}" data-task-id="${task.id}">
          ${isCheckedStatus ? '✓ 已打卡' : '打卡'}
        </button>
      </div>
    `;
  }

  taskElement.innerHTML = taskContent;

  // 添加事件监听器
  if (role === 'admin') {
    taskElement.querySelector('.edit-task').addEventListener('click', () => editTask(task));
    taskElement.querySelector('.delete-task').addEventListener('click', () => deleteTaskHandler(task));
  } else {
    taskElement.querySelector('.checkin-btn').addEventListener('click', () => toggleCheckinHandler(task));
  }

  return taskElement;
}

// 编辑任务
async function editTask(task) {
  // 打开编辑页面，传递任务ID
  window.location.href = `edit-task.html?id=${task.id}`;
}

// 删除任务
async function deleteTaskHandler(task) {
  if (!confirm(`确定要删除任务 "${task.title}" 吗？`)) return;

  try {
    const { success, error } = await deleteTask(task.id);

    if (!success) {
      throw new Error(error);
    }

    showNotification('任务删除成功', 'success');
    renderTaskList();
  } catch (error) {
    showNotification(`删除任务失败: ${error.message}`, 'error');
  }
}

// 打卡/取消打卡
async function toggleCheckinHandler(task) {
  try {
    const { success, error, action } = await toggleCheckin(task.id);

    if (!success) {
      throw new Error(error);
    }

    // 重新渲染任务列表以同步按钮状态
    await renderTaskList();

    // 显示成功提示
    showNotification(
      action === 'checked' ? '打卡成功！' : '取消打卡成功！',
      'success'
    );

  } catch (error) {
    showNotification(`打卡操作失败: ${error.message}`, 'error');
  }
}

// 渲染管理员任务表单
export function renderAdminTaskForm() {
  const taskForm = document.getElementById('task-form');

  if (!taskForm) return;

  taskForm.innerHTML = `
    <h2>新增任务</h2>
    <form id="new-task-form">
      <div class="form-group">
        <label for="task-title">任务标题 *</label>
        <input type="text" id="task-title" required>
      </div>
      <div class="form-group">
        <label for="task-subject">任务主题</label>
        <input type="text" id="task-subject">
      </div>
      <div class="form-group">
        <label for="task-description">任务描述</label>
        <textarea id="task-description" rows="3"></textarea>
      </div>
      <div class="form-group">
        <label for="task-due-date">截止日期</label>
        <input type="date" id="task-due-date">
      </div>
      <div class="form-group">
        <label for="task-priority">优先级</label>
        <select id="task-priority">
          <option value="low">低</option>
          <option value="normal" selected>中</option>
          <option value="high">高</option>
        </select>
      </div>
      <button type="submit" class="btn submit-btn">创建任务</button>
    </form>
  `;

  // 添加表单提交事件
  document.getElementById('new-task-form').addEventListener('submit', async (e) => {
    e.preventDefault();

    const title = document.getElementById('task-title').value;
    const subject = document.getElementById('task-subject').value;
    const description = document.getElementById('task-description').value;
    const dueDate = document.getElementById('task-due-date').value;
    const priority = document.getElementById('task-priority').value;

    try {
      const { success, error, data } = await createTask({
        title,
        subject: subject || null,
        description: description || null,
        due_date: dueDate ? new Date(dueDate).toISOString() : null,
        priority
      });

      if (!success) {
        throw new Error(error);
      }

      showNotification('任务创建成功', 'success');
      renderTaskList();
      e.target.reset();
    } catch (error) {
      showNotification(`创建任务失败: ${error.message}`, 'error');
    }
  });
}

// 渲染管理员打卡统计
export async function renderAdminCheckinStats() {
  const statsContainer = document.getElementById('checkin-stats');

  if (!statsContainer) return;

  try {
    const { success, data, error } = await getAllUserCheckins();

    if (!success) {
      throw new Error(error);
    }

    // 统计每个任务的打卡情况
    const taskStats = {};

    data.forEach(checkin => {
      const taskId = checkin.tasks.id;
      const taskTitle = checkin.tasks.title;

      if (!taskStats[taskId]) {
        taskStats[taskId] = {
          title: taskTitle,
          total: 0,
          checked: 0
        };
      }

      taskStats[taskId].total++;
      if (checkin.is_checked) {
        taskStats[taskId].checked++;
      }
    });

    // 清空并重新渲染统计区域
    statsContainer.innerHTML = '<h2>打卡统计</h2>';

    if (Object.keys(taskStats).length === 0) {
      statsContainer.innerHTML += '<p class="no-stats">暂无打卡数据</p>';
      return;
    }

    Object.values(taskStats).forEach(stat => {
      const percentage = stat.total > 0 ? Math.round((stat.checked / stat.total) * 100) : 0;

      const statElement = document.createElement('div');
      statElement.className = 'stat-item';
      statElement.innerHTML = `
        <div class="stat-title">${stat.title}</div>
        <div class="stat-progress">
          <div class="progress-bar" style="width: ${percentage}%"></div>
        </div>
        <div class="stat-count">${stat.checked}/${stat.total} (${percentage}%)</div>
      `;

      statsContainer.appendChild(statElement);
    });

  } catch (error) {
    showNotification(`加载打卡统计失败: ${error.message}`, 'error');
    statsContainer.innerHTML = '<h2>打卡统计</h2><p class="no-stats">加载数据失败</p>';
  }
}

// 根据角色渲染页面
export async function renderPageByRole() {
  const role = await getUserRole();
  const loginBtn = document.getElementById('login-btn');
  const logoutBtn = document.getElementById('logout-btn');
  const adminOnlyElements = document.querySelectorAll('.admin-only');
  const userOnlyElements = document.querySelectorAll('.user-only');

  // 更新登录/退出按钮
  if (role) {
    loginBtn.style.display = 'none';
    logoutBtn.style.display = 'block';
  } else {
    loginBtn.style.display = 'block';
    logoutBtn.style.display = 'none';
  }

  // 根据角色显示/隐藏元素
  adminOnlyElements.forEach(element => {
    element.style.display = role === 'admin' ? 'block' : 'none';
  });

  userOnlyElements.forEach(element => {
    element.style.display = role === 'user' ? 'block' : 'none';
  });

  // 渲染任务列表
  await renderTaskList();

  // 如果是管理员，渲染任务表单和统计
  if (role === 'admin') {
    renderAdminTaskForm();
    await renderAdminCheckinStats();
  }
}

// 初始化页面
export async function initPage() {
  // 检查登录状态
  const isLoggedIn = await checkAuth();

  if (!isLoggedIn) {
    // 未登录，重定向到登录页
    window.location.href = 'login.html';
    return;
  }

  // 渲染页面
  await renderPageByRole();

  // 添加退出登录事件
  document.getElementById('logout-btn').addEventListener('click', async () => {
    const { success, error } = await logout();

    if (success) {
      window.location.href = 'login.html';
    } else {
      showNotification(`退出登录失败: ${error}`, 'error');
    }
  });
}

// 检查登录状态
async function checkAuth() {
  const user = await getCurrentUser();
  return user !== null;
}