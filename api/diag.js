module.exports = async function handler(req, res) {
  const steps = [];
  
  try {
    steps.push('1. start');
    
    const express = require('express');
    steps.push('2. express loaded: v' + require('express/package.json').version);
    
    const cors = require('cors');
    steps.push('3. cors loaded');
    
    const { v4: uuidv4 } = require('uuid');
    steps.push('4. uuid loaded');
    
    const { neon } = require('@neondatabase/serverless');
    steps.push('5. neon loaded');
    
    const sql = neon(process.env.DATABASE_URL);
    steps.push('6. neon connected');
    
    const result = await sql.query('SELECT COUNT(*) as count FROM tasks', []);
    steps.push('7. query worked: ' + JSON.stringify(result[0]));
    
    // Test initDB pattern
    const isNeon = true;
    const createSQL = `CREATE TABLE IF NOT EXISTS agents (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      emoji TEXT DEFAULT '🤖',
      role TEXT,
      status TEXT DEFAULT 'active',
      notify_telegram_id TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`;
    await sql.query(createSQL, []);
    steps.push('8. CREATE TABLE works');
    
    res.json({ status: 'ok', steps });
  } catch (err) {
    steps.push('FAILED: ' + err.message);
    res.json({ status: 'error', steps, error: err.message, stack: err.stack });
  }
};
