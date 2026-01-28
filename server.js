const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const uuidv4 = () => crypto.randomUUID();
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3456;

// === Database Abstraction Layer ===
// Uses Neon (Postgres) when DATABASE_URL is set, SQLite locally

let db;
const isNeon = !!process.env.DATABASE_URL;

if (isNeon) {
  const { neon } = require('@neondatabase/serverless');
  const sql = neon(process.env.DATABASE_URL);
  
  db = {
    async query(text, params = []) {
      // Convert ? placeholders to $1, $2, etc for Postgres
      let idx = 0;
      const pgText = text.replace(/\?/g, () => `$${++idx}`);
      const result = await sql.query(pgText, params);
      return result;
    },
    async run(text, params = []) {
      return this.query(text, params);
    },
    async get(text, params = []) {
      const rows = await this.query(text, params);
      return rows[0];
    },
    async all(text, params = []) {
      return this.query(text, params);
    }
  };
} else {
  let Database;
  try {
    Database = require('better-sqlite3');
  } catch (e) {
    console.error('better-sqlite3 not available (expected on serverless). Set DATABASE_URL for Postgres.');
    process.exit(1);
  }
  const sqliteDb = new Database(path.join(__dirname, 'mission-control.db'));
  sqliteDb.pragma('journal_mode = WAL');
  
  db = {
    async query(text, params = []) {
      const stmt = sqliteDb.prepare(text);
      if (text.trim().toUpperCase().startsWith('SELECT') || 
          text.trim().toUpperCase().startsWith('WITH')) {
        return stmt.all(...params);
      }
      return stmt.run(...params);
    },
    async run(text, params = []) {
      return sqliteDb.prepare(text).run(...params);
    },
    async get(text, params = []) {
      return sqliteDb.prepare(text).get(...params);
    },
    async all(text, params = []) {
      return sqliteDb.prepare(text).all(...params);
    }
  };
}

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Health check
app.get('/api/health', async (req, res) => {
  try {
    const count = await db.get('SELECT COUNT(*) as count FROM tasks');
    res.json({ status: 'ok', db: isNeon ? 'neon' : 'sqlite', tasks: count.count });
  } catch (err) {
    res.status(500).json({ status: 'error', error: err.message, db: isNeon ? 'neon' : 'sqlite' });
  }
});

// Initialize database tables
async function initDB() {
  await db.run(`
    CREATE TABLE IF NOT EXISTS agents (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      emoji TEXT DEFAULT '🤖',
      role TEXT,
      status TEXT DEFAULT 'active',
      notify_telegram_id TEXT,
      created_at ${isNeon ? 'TIMESTAMP' : 'TEXT'} DEFAULT ${isNeon ? 'CURRENT_TIMESTAMP' : "(datetime('now'))"}
    )
  `);

  await db.run(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      client TEXT,
      description TEXT,
      color TEXT DEFAULT '#6366f1',
      status TEXT DEFAULT 'active',
      created_at ${isNeon ? 'TIMESTAMP' : 'TEXT'} DEFAULT ${isNeon ? 'CURRENT_TIMESTAMP' : "(datetime('now'))"}
    )
  `);

  await db.run(`
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      status TEXT DEFAULT 'backlog',
      priority TEXT DEFAULT 'medium',
      assignee_id TEXT,
      project_id TEXT,
      tags TEXT,
      due_date TEXT,
      created_at ${isNeon ? 'TIMESTAMP' : 'TEXT'} DEFAULT ${isNeon ? 'CURRENT_TIMESTAMP' : "(datetime('now'))"},
      updated_at ${isNeon ? 'TIMESTAMP' : 'TEXT'} DEFAULT ${isNeon ? 'CURRENT_TIMESTAMP' : "(datetime('now'))"}
    )
  `);

  await db.run(`
    CREATE TABLE IF NOT EXISTS comments (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      author TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at ${isNeon ? 'TIMESTAMP' : 'TEXT'} DEFAULT ${isNeon ? 'CURRENT_TIMESTAMP' : "(datetime('now'))"}
    )
  `);

  await db.run(`
    CREATE TABLE IF NOT EXISTS task_history (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      action TEXT NOT NULL,
      field TEXT,
      old_value TEXT,
      new_value TEXT,
      actor TEXT DEFAULT 'System',
      created_at ${isNeon ? 'TIMESTAMP' : 'TEXT'} DEFAULT ${isNeon ? 'CURRENT_TIMESTAMP' : "(datetime('now'))"}
    )
  `);

  // Migration: Add action column if missing (fixes existing deployments)
  if (isNeon) {
    await db.run(`
      DO $$ 
      BEGIN 
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='task_history' AND column_name='action') THEN
          ALTER TABLE task_history ADD COLUMN action TEXT NOT NULL DEFAULT 'update';
        END IF;
      END $$;
    `);
  }

  await db.run(`
    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      agent_id TEXT,
      task_id TEXT,
      type TEXT NOT NULL,
      message TEXT NOT NULL,
      read ${isNeon ? 'BOOLEAN' : 'INTEGER'} DEFAULT ${isNeon ? 'FALSE' : '0'},
      created_at ${isNeon ? 'TIMESTAMP' : 'TEXT'} DEFAULT ${isNeon ? 'CURRENT_TIMESTAMP' : "(datetime('now'))"}
    )
  `);

  // Seed default agents if empty
  const countResult = await db.get('SELECT COUNT(*) as count FROM agents');
  if (parseInt(countResult.count) === 0) {
    await db.run('INSERT INTO agents (id, name, emoji, role) VALUES (?, ?, ?, ?)', [uuidv4(), 'Scooby', '🐕', 'Coordinator']);
    await db.run('INSERT INTO agents (id, name, emoji, role) VALUES (?, ?, ?, ?)', [uuidv4(), 'Coder', '💻', 'Development']);
    await db.run('INSERT INTO agents (id, name, emoji, role) VALUES (?, ?, ?, ?)', [uuidv4(), 'Researcher', '🔍', 'Research & Analysis']);
    await db.run('INSERT INTO agents (id, name, emoji, role) VALUES (?, ?, ?, ?)', [uuidv4(), 'Builder', '🔧', 'Workflows & Automation']);
  }
  
  console.log(`Database initialized (${isNeon ? 'Neon/Postgres' : 'SQLite'})`);
}

// Helper: Log task history
async function logHistory(taskId, action, field, oldValue, newValue, actor = 'System') {
  await db.run(
    'INSERT INTO task_history (id, task_id, action, field, old_value, new_value, actor) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [uuidv4(), taskId, action, field, oldValue, newValue, actor]
  );
}

// Helper: Create notification
async function createNotification(agentId, taskId, type, message) {
  await db.run(
    'INSERT INTO notifications (id, agent_id, task_id, type, message) VALUES (?, ?, ?, ?, ?)',
    [uuidv4(), agentId, taskId, type, message]
  );
}

// === API Routes ===

// -- Agents --
app.get('/api/agents', async (req, res) => {
  try {
    const agents = await db.all('SELECT * FROM agents ORDER BY created_at');
    res.json(agents);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/agents', async (req, res) => {
  try {
    const { name, emoji, role, notify_telegram_id } = req.body;
    const id = uuidv4();
    await db.run('INSERT INTO agents (id, name, emoji, role, notify_telegram_id) VALUES (?, ?, ?, ?, ?)', 
      [id, name, emoji || '🤖', role, notify_telegram_id]);
    res.json({ id, name, emoji: emoji || '🤖', role, notify_telegram_id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/agents/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, emoji, role, status, notify_telegram_id } = req.body;
    await db.run(`
      UPDATE agents SET 
        name = COALESCE(?, name), 
        emoji = COALESCE(?, emoji),
        role = COALESCE(?, role), 
        status = COALESCE(?, status), 
        notify_telegram_id = COALESCE(?, notify_telegram_id)
      WHERE id = ?
    `, [name, emoji, role, status, notify_telegram_id, id]);
    const agent = await db.get('SELECT * FROM agents WHERE id = ?', [id]);
    res.json(agent);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/agents/:id', async (req, res) => {
  try {
    await db.run('DELETE FROM agents WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -- Projects --
app.get('/api/projects', async (req, res) => {
  try {
    const projects = await db.all('SELECT * FROM projects ORDER BY name');
    res.json(projects);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/projects', async (req, res) => {
  try {
    const { name, client, description, color } = req.body;
    const id = uuidv4();
    await db.run('INSERT INTO projects (id, name, client, description, color) VALUES (?, ?, ?, ?, ?)',
      [id, name, client, description, color || '#6366f1']);
    const project = await db.get('SELECT * FROM projects WHERE id = ?', [id]);
    res.json(project);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/projects/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, client, description, color, status } = req.body;
    await db.run(`
      UPDATE projects SET 
        name = COALESCE(?, name), 
        client = COALESCE(?, client),
        description = COALESCE(?, description), 
        color = COALESCE(?, color), 
        status = COALESCE(?, status)
      WHERE id = ?
    `, [name, client, description, color, status, id]);
    const project = await db.get('SELECT * FROM projects WHERE id = ?', [id]);
    res.json(project);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/projects/:id', async (req, res) => {
  try {
    await db.run('DELETE FROM projects WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -- Tasks --
app.get('/api/tasks', async (req, res) => {
  try {
    const { status, assignee, project } = req.query;
    
    let query = `
      SELECT t.*, p.name as project_name, p.color as project_color, p.client as project_client,
             a.name as assignee_name, a.emoji as assignee_emoji
      FROM tasks t
      LEFT JOIN projects p ON t.project_id = p.id
      LEFT JOIN agents a ON t.assignee_id = a.id
    `;
    
    const conditions = [];
    const params = [];
    
    if (status) {
      conditions.push('t.status = ?');
      params.push(status);
    }
    if (assignee) {
      conditions.push('t.assignee_id = ?');
      params.push(assignee);
    }
    if (project) {
      conditions.push('t.project_id = ?');
      params.push(project);
    }
    
    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }
    
    query += ` ORDER BY CASE t.priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END, t.created_at DESC`;
    
    const tasks = await db.all(query, params);
    res.json(tasks);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/tasks/:id', async (req, res) => {
  try {
    const task = await db.get(`
      SELECT t.*, p.name as project_name, p.color as project_color,
             a.name as assignee_name, a.emoji as assignee_emoji
      FROM tasks t
      LEFT JOIN projects p ON t.project_id = p.id
      LEFT JOIN agents a ON t.assignee_id = a.id
      WHERE t.id = ?
    `, [req.params.id]);
    
    if (!task) return res.status(404).json({ error: 'Task not found' });
    
    const comments = await db.all('SELECT * FROM comments WHERE task_id = ? ORDER BY created_at DESC', [req.params.id]);
    const history = await db.all('SELECT * FROM task_history WHERE task_id = ? ORDER BY created_at DESC LIMIT 50', [req.params.id]);
    
    res.json({ ...task, comments, history });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/tasks', async (req, res) => {
  try {
    const { title, description, status, priority, assignee_id, project_id, tags, due_date } = req.body;
    const id = uuidv4();
    const tagsStr = Array.isArray(tags) ? tags.join(',') : tags;
    
    await db.run(`
      INSERT INTO tasks (id, title, description, status, priority, assignee_id, project_id, tags, due_date)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [id, title, description, status || 'backlog', priority || 'medium', assignee_id || null, project_id || null, tagsStr || null, due_date || null]);
    
    await logHistory(id, 'created', null, null, null, 'User');
    
    if (assignee_id) {
      await createNotification(assignee_id, id, 'assigned', `You've been assigned: "${title}"`);
    }
    
    const task = await db.get('SELECT * FROM tasks WHERE id = ?', [id]);
    res.json(task);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/tasks/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, status, priority, assignee_id, project_id, tags, due_date, actor } = req.body;
    
    const current = await db.get('SELECT * FROM tasks WHERE id = ?', [id]);
    if (!current) return res.status(404).json({ error: 'Task not found' });
    
    const tagsStr = Array.isArray(tags) ? tags.join(',') : tags;
    
    await db.run(`
      UPDATE tasks SET 
        title = COALESCE(?, title),
        description = COALESCE(?, description),
        status = COALESCE(?, status),
        priority = COALESCE(?, priority),
        assignee_id = COALESCE(?, assignee_id),
        project_id = COALESCE(?, project_id),
        tags = COALESCE(?, tags),
        due_date = COALESCE(?, due_date),
        updated_at = ${isNeon ? 'CURRENT_TIMESTAMP' : "datetime('now')"}
      WHERE id = ?
    `, [title, description, status, priority, assignee_id, project_id, tagsStr, due_date, id]);
    
    // Log changes
    if (status && status !== current.status) {
      await logHistory(id, 'updated', 'status', current.status, status, actor || 'User');
    }
    if (assignee_id && assignee_id !== current.assignee_id) {
      await logHistory(id, 'updated', 'assignee_id', current.assignee_id, assignee_id, actor || 'User');
      await createNotification(assignee_id, id, 'assigned', `You've been assigned: "${current.title}"`);
    }
    
    const task = await db.get('SELECT * FROM tasks WHERE id = ?', [id]);
    res.json(task);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/tasks/:id', async (req, res) => {
  try {
    await db.run('DELETE FROM tasks WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -- Comments --
app.get('/api/tasks/:taskId/comments', async (req, res) => {
  try {
    const comments = await db.all('SELECT * FROM comments WHERE task_id = ? ORDER BY created_at DESC', [req.params.taskId]);
    res.json(comments);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/tasks/:taskId/comments', async (req, res) => {
  try {
    const { taskId } = req.params;
    const { author, content } = req.body;
    const id = uuidv4();
    
    await db.run('INSERT INTO comments (id, task_id, author, content) VALUES (?, ?, ?, ?)',
      [id, taskId, author || 'Anonymous', content]);
    await logHistory(taskId, 'comment', null, null, content, author || 'Anonymous');
    
    const comment = await db.get('SELECT * FROM comments WHERE id = ?', [id]);
    res.json(comment);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/comments/:id', async (req, res) => {
  try {
    await db.run('DELETE FROM comments WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -- Notifications --
app.get('/api/notifications', async (req, res) => {
  try {
    const { agent_id, unread } = req.query;
    
    let query = `
      SELECT n.*, t.title as task_title FROM notifications n 
      LEFT JOIN tasks t ON n.task_id = t.id
    `;
    
    const conditions = [];
    const params = [];
    
    if (agent_id) {
      conditions.push('n.agent_id = ?');
      params.push(agent_id);
    }
    if (unread === 'true') {
      conditions.push(`n.read = ${isNeon ? 'FALSE' : '0'}`);
    }
    
    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }
    
    query += ' ORDER BY n.created_at DESC LIMIT 100';
    
    const notifications = await db.all(query, params);
    res.json(notifications);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/notifications/:id/read', async (req, res) => {
  try {
    await db.run(`UPDATE notifications SET read = ${isNeon ? 'TRUE' : '1'} WHERE id = ?`, [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/notifications/mark-all-read', async (req, res) => {
  try {
    const { agent_id } = req.body;
    if (agent_id) {
      await db.run(`UPDATE notifications SET read = ${isNeon ? 'TRUE' : '1'} WHERE agent_id = ?`, [agent_id]);
    } else {
      await db.run(`UPDATE notifications SET read = ${isNeon ? 'TRUE' : '1'}`);
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -- Stats --
app.get('/api/stats', async (req, res) => {
  try {
    const total = await db.get('SELECT COUNT(*) as count FROM tasks');
    const statusCounts = await db.all('SELECT status, COUNT(*) as count FROM tasks GROUP BY status');
    const agentCounts = await db.all(`
      SELECT a.id, a.name, a.emoji, COUNT(t.id) as count 
      FROM agents a LEFT JOIN tasks t ON a.id = t.assignee_id AND t.status != 'done'
      GROUP BY a.id, a.name, a.emoji
    `);
    const projectCounts = await db.all(`
      SELECT p.id, p.name, p.color, p.client, COUNT(t.id) as count
      FROM projects p LEFT JOIN tasks t ON p.id = t.project_id AND t.status != 'done'
      WHERE p.status = 'active'
      GROUP BY p.id, p.name, p.color, p.client
    `);
    
    const byStatus = {};
    statusCounts.forEach(s => byStatus[s.status] = parseInt(s.count));
    
    res.json({
      total: parseInt(total.count),
      byStatus,
      byAgent: agentCounts.map(a => ({ ...a, count: parseInt(a.count) })),
      byProject: projectCounts.map(p => ({ ...p, count: parseInt(p.count) }))
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -- Tags --
app.get('/api/tags', async (req, res) => {
  try {
    const tasks = await db.all("SELECT tags FROM tasks WHERE tags IS NOT NULL AND tags != ''");
    const tagSet = new Set();
    tasks.forEach(t => {
      if (t.tags) t.tags.split(',').forEach(tag => tagSet.add(tag.trim()));
    });
    res.json([...tagSet].sort());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Initialize and start
initDB().then(() => {
  app.listen(PORT, () => {
    console.log(`🐕 Mission Control running at http://localhost:${PORT}`);
    console.log(`   Database: ${isNeon ? 'Neon (Postgres)' : 'SQLite (local)'}`);
  });
}).catch(err => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});

module.exports = app;
