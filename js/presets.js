// 任务快捷填充 /「我的常用」模块
// 注意：这些只是帮家长少打字的「可选」按钮，任务永远可以完全自由创建
// 「我的常用」只存在浏览器本地 localStorage，不新增任何数据库表

const PRESET_KEY = 'my_task_presets';

// 4 个示例，点一下帮你预填表单（预填后照样可以随意改，也可以完全不用）
export const QUICK_FILL = [
  { title: '每日阅读', subject: '语文', description: '阅读 20 分钟，拍照上传', checkin_type: 'photo', star_reward: 2 },
  { title: '每日口算', subject: '数学', description: '完成 1 页口算', checkin_type: 'photo', star_reward: 2 },
  { title: '每日跳绳', subject: '体育', description: '跳绳 300 个', checkin_type: 'checkbox', star_reward: 1 },
  { title: '每日练字', subject: '语文', description: '练字 1 页', checkin_type: 'photo', star_reward: 2 }
];

// 读取「我的常用」
export function getMyPresets() {
  try {
    const list = JSON.parse(localStorage.getItem(PRESET_KEY) || '[]');
    return Array.isArray(list) ? list : [];
  } catch (error) {
    console.warn('读取「我的常用」失败:', error);
    return [];
  }
}

// 存为「我的常用」：同名的只留最新一条，最多保存 20 条
export function saveMyPreset(preset) {
  const list = getMyPresets().filter((p) => p.title !== preset.title);
  list.unshift(preset);
  localStorage.setItem(PRESET_KEY, JSON.stringify(list.slice(0, 20)));
  return list.slice(0, 20);
}

// 删除第 index 条常用
export function removeMyPreset(index) {
  const list = getMyPresets();
  list.splice(index, 1);
  localStorage.setItem(PRESET_KEY, JSON.stringify(list));
  return list;
}

// 清空「我的常用」
export function clearMyPresets() {
  localStorage.removeItem(PRESET_KEY);
  return [];
}
