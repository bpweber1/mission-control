const API = '';

let agents = [];
let tasks = [];
let projects = [];
let currentAgentFilter = '';
let currentProjectFilter = '';

// DOM Elements
const agentFilter = document.getElementById('agent-filter');
const projectFilter = document.getElementById('project-filter');
const newTaskBtn = document.getElementById('new-task-btn');
const newProjectBtn = document.getElementById('new-project-btn');
const newAgentBtn = document.getElementById('new-agent-btn');
const notificationsBtn = document.getElementById('notifications-btn');
const taskModal = document.getElementById('task-modal');
const projectModal = document.getElementById('project-modal');
const agentModal = document.getElementById('agent-modal');
const notificationsPanel = document.getElementById('notifications-panel');
const taskForm = document.getElementById('task-form');
const projectForm = document.getElementById('project-form');
const agentForm = document.getElementById('agent-form');
const statsBar = document.getElementById('stats-bar');

// Initialize
async function init() {
  await loadAgents();
  await loadProjects();
  await loadTasks();
  await loadStats();
  await loadNotifications();
  setupEventListeners();
  setupDragAndDrop();
}

async function loadAgents() {
  const res = await fetch(`${API}/api/agents`);
  agents = await res.json();
  
  agentFilter.innerHTML = '<option value="">All Agents</option>' +
    agents.map(a => `<option value="${a.id}">${a.emoji} ${a.name}</option>`).join('');
  
  document.getElementById('task-assignee').innerHTML = '<option value="">Unassigned</option>' +
    agents.map(a => `<option value="${a.id}">${a.emoji} ${a.name}</option>`).join('');
}

async function loadProjects() {
  const res = await fetch(`${API}/api/projects`);
  projects = await res.json();
  
  projectFilter.innerHTML = '<option value="">All Projects</option>' +
    projects.map(p => `<option value="${p.id}">${p.name}${p.client ? ` (${p.client})` : ''}</option>`).join('');
  
  document.getElementById('task-project').innerHTML = '<option value="">No Project</option>' +
    projects.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
}

async function loadTasks() {
  let url = `${API}/api/tasks`;
  const params = [];
  if (currentAgentFilter) params.push(`assignee=${currentAgentFilter}`);
  if (currentProjectFilter) params.push(`project=${currentProjectFilter}`);
  if (params.length) url += '?' + params.join('&');
  
  const res = await fetch(url);
  tasks = await res.json();
  renderTasks();
}

async function loadStats() {
  const res = await fetch(`${API}/api/stats`);
  const stats = await res.json();
  
  const projectStats = stats.byProject.map(p => 
    `<div class="project-stat"><span class="project-dot" style="background:${p.color}"></span>${p.name}: <strong>${p.count}</strong></div>`
  ).join('');
  
  statsBar.innerHTML = `
    <div class="stat">
      <span class="stat-value">${stats.total}</span>
      <span class="stat-label">Total Tasks</span>
    </div>
    <div class="stat">
      <span class="stat-value">${stats.byStatus.parked || 0}</span>
      <span class="stat-label">🅿️ Parked</span>
    </div>
    <div class="stat">
      <span class="stat-value">${stats.byStatus.backlog || 0}</span>
      <span class="stat-label">Backlog</span>
    </div>
    <div class="stat">
      <span class="stat-value">${(stats.byStatus['in-progress'] || 0) + (stats.byStatus['todo'] || 0)}</span>
      <span class="stat-label">Active</span>
    </div>
    <div class="stat">
      <span class="stat-value">${stats.byStatus.done || 0}</span>
      <span class="stat-label">Completed</span>
    </div>
    ${stats.byAgent.filter(a => a.count > 0).map(a => `
      <div class="stat">
        <span class="stat-value">${a.emoji} ${a.count}</span>
        <span class="stat-label">${a.name}</span>
      </div>
    `).join('')}
    ${projectStats}
  `;
}

async function loadNotifications() {
  const res = await fetch(`${API}/api/notifications?unread=true`);
  const notifications = await res.json();
  
  const countEl = document.getElementById('notif-count');
  if (notifications.length > 0) {
    countEl.textContent = notifications.length;
    countEl.classList.remove('hidden');
  } else {
    countEl.classList.add('hidden');
  }
  
  const list = document.getElementById('notifications-list');
  if (notifications.length === 0) {
    list.innerHTML = '<div style="color:#666;text-align:center;padding:2rem;">No new notifications</div>';
  } else {
    list.innerHTML = notifications.map(n => `
      <div class="notification-item ${n.read ? 'read' : ''}" data-id="${n.id}" data-task="${n.task_id}">
        <div class="message">${escapeHtml(n.message)}</div>
        <div class="time">${formatTime(n.created_at)}</div>
      </div>
    `).join('');
  }
}

function renderTasks() {
  document.querySelectorAll('.column .tasks').forEach(el => el.innerHTML = '');
  document.querySelectorAll('.column .count').forEach(el => el.textContent = '0');
  
  const byStatus = {};
  tasks.forEach(task => {
    if (!byStatus[task.status]) byStatus[task.status] = [];
    byStatus[task.status].push(task);
  });
  
  Object.entries(byStatus).forEach(([status, statusTasks]) => {
    const column = document.querySelector(`.column[data-status="${status}"]`);
    if (!column) return;
    
    const tasksContainer = column.querySelector('.tasks');
    const countEl = column.querySelector('.count');
    
    countEl.textContent = statusTasks.length;
    
    statusTasks.forEach(task => {
      const card = document.createElement('div');
      card.className = `task-card priority-${task.priority}`;
      card.draggable = true;
      card.dataset.id = task.id;
      
      if (task.project_color) {
        card.style.borderLeftColor = task.project_color;
      }
      
      let projectHtml = '';
      if (task.project_name) {
        projectHtml = `<span class="project-tag" style="background:${task.project_color}">${escapeHtml(task.project_name)}</span>`;
      }
      
      let tagsHtml = '';
      if (task.tags) {
        const tagList = task.tags.split(',').map(t => t.trim()).filter(t => t);
        tagsHtml = `<div class="tags">${tagList.map(t => `<span class="tag">${escapeHtml(t)}</span>`).join('')}</div>`;
      }
      
      let dueDateHtml = '';
      if (task.due_date) {
        const isOverdue = new Date(task.due_date) < new Date() && task.status !== 'done';
        dueDateHtml = `<div class="due-date ${isOverdue ? 'overdue' : ''}">📅 ${task.due_date}</div>`;
      }
      
      card.innerHTML = `
        ${projectHtml}
        <div class="title">${escapeHtml(task.title)}</div>
        ${tagsHtml}
        <div class="meta">
          <span class="assignee">${task.assignee_emoji ? task.assignee_emoji + ' ' + task.assignee_name : '—'}</span>
          <span class="priority ${task.priority}">${task.priority}</span>
        </div>
        ${dueDateHtml}
      `;
      
      card.addEventListener('click', () => openEditTaskModal(task.id));
      tasksContainer.appendChild(card);
    });
  });
}

function setupEventListeners() {
  agentFilter.addEventListener('change', (e) => {
    currentAgentFilter = e.target.value;
    loadTasks();
  });
  
  projectFilter.addEventListener('change', (e) => {
    currentProjectFilter = e.target.value;
    loadTasks();
  });
  
  // Task modal
  newTaskBtn.addEventListener('click', openNewTaskModal);
  document.getElementById('close-task-modal').addEventListener('click', () => taskModal.classList.add('hidden'));
  document.getElementById('cancel-btn').addEventListener('click', () => taskModal.classList.add('hidden'));
  document.getElementById('delete-btn').addEventListener('click', deleteTask);
  taskForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    await saveTask();
  });
  
  // Project modal
  newProjectBtn.addEventListener('click', openNewProjectModal);
  document.getElementById('cancel-project-btn').addEventListener('click', () => projectModal.classList.add('hidden'));
  document.getElementById('delete-project-btn').addEventListener('click', deleteProject);
  projectForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    await saveProject();
  });
  
  // Agent modal
  newAgentBtn.addEventListener('click', openNewAgentModal);
  document.getElementById('cancel-agent-btn').addEventListener('click', () => agentModal.classList.add('hidden'));
  document.getElementById('delete-agent-btn').addEventListener('click', deleteAgent);
  agentForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    await saveAgent();
  });
  
  // Notifications
  notificationsBtn.addEventListener('click', toggleNotifications);
  document.getElementById('mark-all-read').addEventListener('click', markAllNotificationsRead);
  
  // Comments
  document.getElementById('add-comment-btn').addEventListener('click', addComment);
  
  // Close modals on outside click
  [taskModal, projectModal, agentModal].forEach(modal => {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.classList.add('hidden');
    });
  });
  
  // Notification clicks
  document.getElementById('notifications-list').addEventListener('click', async (e) => {
    const item = e.target.closest('.notification-item');
    if (item) {
      const taskId = item.dataset.task;
      const notifId = item.dataset.id;
      
      await fetch(`${API}/api/notifications/${notifId}/read`, { method: 'PATCH' });
      
      if (taskId) {
        openEditTaskModal(taskId);
      }
      
      loadNotifications();
      notificationsPanel.classList.add('hidden');
    }
  });
}

function setupDragAndDrop() {
  document.addEventListener('dragstart', (e) => {
    if (e.target.classList.contains('task-card')) {
      e.target.classList.add('dragging');
      e.dataTransfer.setData('text/plain', e.target.dataset.id);
    }
  });
  
  document.addEventListener('dragend', (e) => {
    if (e.target.classList.contains('task-card')) {
      e.target.classList.remove('dragging');
    }
  });
  
  document.querySelectorAll('.column').forEach(column => {
    column.addEventListener('dragover', (e) => {
      e.preventDefault();
      column.classList.add('drag-over');
    });
    
    column.addEventListener('dragleave', () => {
      column.classList.remove('drag-over');
    });
    
    column.addEventListener('drop', async (e) => {
      e.preventDefault();
      column.classList.remove('drag-over');
      
      const taskId = e.dataTransfer.getData('text/plain');
      const newStatus = column.dataset.status;
      
      await fetch(`${API}/api/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      });
      
      await loadTasks();
      await loadStats();
    });
  });
}

// Task functions
function openNewTaskModal() {
  document.getElementById('modal-title').textContent = 'New Task';
  document.getElementById('task-id').value = '';
  document.getElementById('task-title').value = '';
  document.getElementById('task-description').value = '';
  document.getElementById('task-tags').value = '';
  document.getElementById('task-priority').value = 'medium';
  document.getElementById('task-assignee').value = '';
  document.getElementById('task-project').value = '';
  document.getElementById('task-status').value = 'backlog';
  document.getElementById('task-due-date').value = '';
  document.getElementById('delete-btn').style.display = 'none';
  document.getElementById('task-sidebar').style.display = 'none';
  taskModal.classList.remove('hidden');
}

async function openEditTaskModal(taskId) {
  const res = await fetch(`${API}/api/tasks/${taskId}`);
  const task = await res.json();
  
  document.getElementById('modal-title').textContent = 'Edit Task';
  document.getElementById('task-id').value = task.id;
  document.getElementById('task-title').value = task.title;
  document.getElementById('task-description').value = task.description || '';
  document.getElementById('task-tags').value = task.tags || '';
  document.getElementById('task-priority').value = task.priority;
  document.getElementById('task-assignee').value = task.assignee_id || '';
  document.getElementById('task-project').value = task.project_id || '';
  document.getElementById('task-status').value = task.status;
  document.getElementById('task-due-date').value = task.due_date || '';
  document.getElementById('delete-btn').style.display = 'block';
  document.getElementById('task-sidebar').style.display = 'block';
  
  // Render comments
  const commentsList = document.getElementById('comments-list');
  if (task.comments && task.comments.length > 0) {
    commentsList.innerHTML = task.comments.map(c => `
      <div class="comment">
        <div class="author">${escapeHtml(c.author)}</div>
        <div class="content">${escapeHtml(c.content)}</div>
        <div class="time">${formatTime(c.created_at)}</div>
      </div>
    `).join('');
  } else {
    commentsList.innerHTML = '<div style="color:#666;font-size:0.85rem;">No comments yet</div>';
  }
  
  // Render history
  const historyList = document.getElementById('history-list');
  if (task.history && task.history.length > 0) {
    historyList.innerHTML = task.history.map(h => `
      <div class="history-item">
        <span class="action">${formatHistoryAction(h)}</span>
        <div class="time">${formatTime(h.created_at)}</div>
      </div>
    `).join('');
  } else {
    historyList.innerHTML = '<div style="color:#666;font-size:0.85rem;">No history</div>';
  }
  
  taskModal.classList.remove('hidden');
}

async function saveTask() {
  const id = document.getElementById('task-id').value;
  const data = {
    title: document.getElementById('task-title').value,
    description: document.getElementById('task-description').value,
    tags: document.getElementById('task-tags').value,
    priority: document.getElementById('task-priority').value,
    assignee_id: document.getElementById('task-assignee').value || null,
    project_id: document.getElementById('task-project').value || null,
    status: document.getElementById('task-status').value,
    due_date: document.getElementById('task-due-date').value || null
  };
  
  if (id) {
    await fetch(`${API}/api/tasks/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
  } else {
    await fetch(`${API}/api/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
  }
  
  taskModal.classList.add('hidden');
  await loadTasks();
  await loadStats();
  await loadNotifications();
}

async function deleteTask() {
  const id = document.getElementById('task-id').value;
  if (!id) return;
  
  if (confirm('Delete this task?')) {
    await fetch(`${API}/api/tasks/${id}`, { method: 'DELETE' });
    taskModal.classList.add('hidden');
    await loadTasks();
    await loadStats();
  }
}

async function addComment() {
  const taskId = document.getElementById('task-id').value;
  if (!taskId) return;
  
  const author = document.getElementById('comment-author').value || 'Anonymous';
  const content = document.getElementById('comment-content').value;
  
  if (!content.trim()) return;
  
  await fetch(`${API}/api/tasks/${taskId}/comments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ author, content })
  });
  
  document.getElementById('comment-content').value = '';
  await openEditTaskModal(taskId);
}

// Project functions
function openNewProjectModal() {
  document.getElementById('project-modal-title').textContent = 'New Project';
  document.getElementById('project-id').value = '';
  document.getElementById('project-name').value = '';
  document.getElementById('project-client').value = '';
  document.getElementById('project-description').value = '';
  document.getElementById('project-color').value = '#6366f1';
  document.getElementById('delete-project-btn').style.display = 'none';
  projectModal.classList.remove('hidden');
}

async function saveProject() {
  const id = document.getElementById('project-id').value;
  const data = {
    name: document.getElementById('project-name').value,
    client: document.getElementById('project-client').value,
    description: document.getElementById('project-description').value,
    color: document.getElementById('project-color').value
  };
  
  if (id) {
    await fetch(`${API}/api/projects/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
  } else {
    await fetch(`${API}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
  }
  
  projectModal.classList.add('hidden');
  await loadProjects();
  await loadStats();
}

async function deleteProject() {
  const id = document.getElementById('project-id').value;
  if (!id) return;
  
  if (confirm('Delete this project?')) {
    await fetch(`${API}/api/projects/${id}`, { method: 'DELETE' });
    projectModal.classList.add('hidden');
    await loadProjects();
    await loadStats();
  }
}

// Agent functions
function openNewAgentModal() {
  document.getElementById('agent-modal-title').textContent = 'New Agent';
  document.getElementById('agent-id').value = '';
  document.getElementById('agent-name').value = '';
  document.getElementById('agent-emoji').value = '🤖';
  document.getElementById('agent-role').value = '';
  document.getElementById('delete-agent-btn').style.display = 'none';
  agentModal.classList.remove('hidden');
}

async function saveAgent() {
  const id = document.getElementById('agent-id').value;
  const data = {
    name: document.getElementById('agent-name').value,
    emoji: document.getElementById('agent-emoji').value,
    role: document.getElementById('agent-role').value
  };
  
  if (id) {
    await fetch(`${API}/api/agents/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
  } else {
    await fetch(`${API}/api/agents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
  }
  
  agentModal.classList.add('hidden');
  await loadAgents();
  await loadStats();
}

async function deleteAgent() {
  const id = document.getElementById('agent-id').value;
  if (!id) return;
  
  if (confirm('Delete this agent?')) {
    await fetch(`${API}/api/agents/${id}`, { method: 'DELETE' });
    agentModal.classList.add('hidden');
    await loadAgents();
    await loadStats();
  }
}

// Notifications
function toggleNotifications() {
  notificationsPanel.classList.toggle('hidden');
  notificationsPanel.classList.toggle('visible');
}

async function markAllNotificationsRead() {
  await fetch(`${API}/api/notifications/mark-all-read`, { method: 'POST' });
  await loadNotifications();
}

// Helpers
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function formatTime(dateStr) {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now - date;
  
  if (diff < 60000) return 'Just now';
  if (diff < 3600000) return `${Math.floor(diff/60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff/3600000)}h ago`;
  
  return date.toLocaleDateString();
}

function formatHistoryAction(h) {
  if (h.action === 'created') return `Created by ${h.actor}`;
  if (h.action === 'comment') return `${h.actor} commented`;
  if (h.field === 'status') return `${h.actor} moved to ${h.new_value}`;
  if (h.field === 'assignee_id') return `${h.actor} changed assignee`;
  return `${h.actor} updated ${h.field}`;
}

// Start the app
init();
