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
    const editBtn = taskElement.querySelector('.edit-task');
    const deleteBtn = taskElement.querySelector('.delete-task');
    
    if (editBtn) {
      editBtn.addEventListener('click', () => {
        console.log('编辑按钮被点击，任务ID:', task.id);
        editTask(task);
      });
      console.log('编辑按钮事件监听器已添加');
    } else {
      console.error('找不到编辑按钮');
    }
    
    if (deleteBtn) {
      deleteBtn.addEventListener('click', () => deleteTaskHandler(task));
      console.log('删除按钮事件监听器已添加');
    } else {
      console.error('找不到删除按钮');
    }
  } else {
    const checkinBtn = taskElement.querySelector('.checkin-btn');
    if (checkinBtn) {
      checkinBtn.addEventListener('click', () => toggleCheckinHandler(task));
      console.log('打卡按钮事件监听器已添加');
    } else {
      console.error('找不到打卡按钮');
    }
  }

  return taskElement;
}

// 编辑任务
async function editTask(task) {
  console.log('编辑任务:', task);
  try {
    // 打开编辑页面，传递任务ID
    const editUrl = `edit-task.html?id=${task.id}`;
    console.log('跳转到编辑页面:', editUrl);
    window.location.href = editUrl;
  } catch (error) {
    console.error('编辑任务失败:', error);
    showNotification(`编辑任务失败: ${error.message}`, 'error');
  }
}

// 删除任务
async function deleteTaskHandler(task) {
  if (!confirm(`确定要删除任务"${task.title}"吗？`)) {
    return;
  }

  try {
    const { success, error } = await deleteTask(task.id);

    if (success) {
      showNotification('任务删除成功！', 'success');
      await renderTaskList();
    } else {
      throw new Error(error);
    }
  } catch (error) {
    showNotification(`删除任务失败: ${error.message}`, 'error');
  }
}

// 打卡处理
async function toggleCheckinHandler(task) {
  try {
    const { success, error, action } = await toggleCheckin(task.id);

    if (success) {
      const message = action === 'checked' ? '打卡成功！' : '取消打卡成功！';
      showNotification(message, 'success');
      await renderTaskList();
    } else {
      throw new Error(error);
    }
  } catch (error) {
    showNotification(`打卡操作失败: ${error.message}`, 'error');
  }
}

// 渲染管理员任务表单
export function renderAdminTaskForm() {
  const taskForm = document.getElementById('task-form');

  if (!taskForm) return;

  taskForm.innerHTML = `
    <h2>创建新任务</h2>
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
        <textarea id="task-description"></textarea>
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
      
      <div class="form-actions">
        <button type="submit" class="submit-btn">创建任务</button>
        <button type="reset" class="btn">重置</button>
      </div>
    </form>
  `;

  // 添加表单提交事件
  const form = document.getElementById('new-task-form');
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const title = document.getElementById('task-title').value.trim();
      const subject = document.getElementById('task-subject').value.trim();
      const description = document.getElementById('task-description').value.trim();
      const dueDate = document.getElementById('task-due-date').value;
      const priority = document.getElementById('task-priority').value;
      
      if (!title) {
        showNotification('请输入任务标题', 'error');
        return;
      }
      
      try {
        const { success, error } = await createTask({
          title,
          subject,
          description,
          due_date: dueDate ? new Date(dueDate).toISOString() : null,
          priority
        });
        
        if (success) {
          showNotification('任务创建成功！', 'success');
          form.reset();
          await renderTaskList();
        } else {
          throw new Error(error);
        }
      } catch (error) {
        showNotification(`创建任务失败: ${error.message}`, 'error');
      }
    });
    
    console.log('管理员任务表单事件监听器已添加');
  } else {
    console.error('找不到新任务表单');
  }
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
  console.log('开始初始化页面');
  try {
    // 检查登录状态
    console.log('检查登录状态...');
    const isLoggedIn = await checkAuth();
    console.log('登录状态:', isLoggedIn);
    
    if (!isLoggedIn) {
      // 未登录，重定向到登录页
      console.log('用户未登录，跳转到登录页');
      window.location.href = 'login.html';
      return;
    }
    
    // 渲染页面
    console.log('开始渲染页面...');
    await renderPageByRole();
    console.log('页面渲染完成');
    
    // 添加退出登录事件
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', async () => {
        console.log('退出登录按钮被点击');
        const { success, error } = await logout();
        
        if (success) {
          window.location.href = 'login.html';
        } else {
          showNotification(`退出登录失败: ${error}`, 'error');
        }
      });
      console.log('退出登录按钮事件监听器已添加');
    } else {
      console.error('找不到退出登录按钮');
    }
  } catch (error) {
    console.error('页面初始化失败:', error);
    showNotification(`页面初始化失败: ${error.message}`, 'error');
  }
}

// 检查登录状态
async function checkAuth() {
  const user = await getCurrentUser();
  return user !== null;
}