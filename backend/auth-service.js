const express = require('express');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const app = express();
app.use(express.json());

const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'freight_platform',
  password: process.env.DB_PASSWORD || 'admin123',
  port: process.env.DB_PORT || 5432,
});

app.post('/login', async (req, res) => {
  const { email, password } = req.body;
  console.log(`[AUTH] Login: ${email}`);
  
  // Test user fallback
  if (email === 'admin@nextgen.com' && password === 'admin123') {
    const token = jwt.sign(
      { email: email, role: 'driver' },
      process.env.JWT_SECRET || 'SECRET_KEY',
      { expiresIn: '24h' }
    );
    return res.json({ token, user: { email, role: 'driver' } });
  }
  
  try {
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const user = result.rows[0];
    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const token = jwt.sign(
      { id: user.id, email: user.email },
      process.env.JWT_SECRET || 'SECRET_KEY',
      { expiresIn: '24h' }
    );
    res.json({ token, user: { email: user.email, role: user.role } });
  } catch (err) {
    console.error('[AUTH] Error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'auth', login: '/login (POST)' });
});

app.get('/health', (req, res) => {
  res.json({ status: 'healthy' });
});

app.listen(3001, '0.0.0.0', () => {
  console.log('Auth Service deschis pentru telefon la portul 3001');
});
