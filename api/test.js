module.exports = function handler(req, res) {
  res.json({ 
    ok: true,
    hasDbUrl: !!process.env.DATABASE_URL,
    dbUrlPrefix: process.env.DATABASE_URL ? process.env.DATABASE_URL.substring(0, 20) + '...' : 'NOT SET',
    env: Object.keys(process.env).filter(k => k.includes('DATABASE') || k.includes('NEON') || k.includes('POSTGRES')),
    node: process.version
  });
};
