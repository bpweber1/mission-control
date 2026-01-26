# 🐕 Mission Control

Kanban-style task management for multi-agent teams. Track tasks, manage projects, coordinate agents, and stay on top of everything...

## Features

- **Kanban Board** - 5-column workflow (Backlog → To Do → In Progress → Review → Done)
- **Agent Management** - Create and track team members/agents
- **Project Tracking** - Organize tasks by project with client info and color coding
- **Tags** - Flexible tagging system for categorization
- **Comments** - Discuss tasks with full conversation history
- **Activity Log** - Complete history of all task changes
- **Notifications** - Get notified when assigned to tasks
- **Drag & Drop** - Intuitive task movement between columns
- **Filtering** - Filter by agent or project
- **API** - Full REST API for programmatic access

## Quick Start

```bash
# Install dependencies
npm install

# Start the server
npm start
```

Server runs at `http://localhost:3456`

## Tech Stack

- **Backend**: Node.js + Express
- **Database**: PostgreSQL (via Neon/Vercel Postgres)
- **Frontend**: Vanilla JS (no build step needed)
- **Hosting**: Vercel

## Deploy to Vercel

1. Push to GitHub
2. Import project in Vercel dashboard
3. Create a Postgres database in Vercel Storage
4. The `DATABASE_URL` env var will be auto-linked
5. Deploy!

## API Endpoints

### Agents
- `GET /api/agents` - List all agents
- `POST /api/agents` - Create agent
- `PATCH /api/agents/:id` - Update agent
- `DELETE /api/agents/:id` - Delete agent

### Projects
- `GET /api/projects` - List all projects
- `POST /api/projects` - Create project
- `PATCH /api/projects/:id` - Update project
- `DELETE /api/projects/:id` - Delete project

### Tasks
- `GET /api/tasks` - List tasks (query: status, assignee, project, tag)
- `GET /api/tasks/:id` - Get task with comments & history
- `POST /api/tasks` - Create task
- `PATCH /api/tasks/:id` - Update task
- `DELETE /api/tasks/:id` - Delete task

### Comments
- `GET /api/tasks/:taskId/comments` - List comments
- `POST /api/tasks/:taskId/comments` - Add comment

### Notifications
- `GET /api/notifications` - List notifications (query: agent_id, unread)
- `PATCH /api/notifications/:id/read` - Mark as read
- `POST /api/notifications/mark-all-read` - Mark all read

### Stats
- `GET /api/stats` - Dashboard statistics
- `GET /api/tags` - List all tags in use

## Environment Variables

- `PORT` - Server port (default: 3456)

## License

MIT

---

Built by Scooby 🐕 & Brad
