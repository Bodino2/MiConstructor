const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const { requireAuth, requireRole } = require("./auth-service/middleware/auth");
const { query } = require("./auth-service/db");

const app = express();
app.use(express.json());

app.post('/login', async (req, res) => {
  const { email, password } = req.body;
  console.log(`[AUTH] Login: ${email}`);

  // Test user fallback
  if (email === 'admin@nextgen.com' && password === 'admin123') {
    const token = jwt.sign(
      { email: email, role: 'DRIVER', sub: 'test-user' },
      process.env.JWT_SECRET || 'SECRET_KEY',
      { expiresIn: '24h' }
    );
    return res.json({ token, user: { email, role: 'DRIVER' } });
  }

  try {
    const result = await query('SELECT * FROM users WHERE email = $1', [email]);
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = result.rows[0];
    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { sub: user.id, email: user.email, role: String(user.role || '').toUpperCase() },
      process.env.JWT_SECRET || 'SECRET_KEY',
      { expiresIn: '24h' }
    );

    return res.json({ token, user: { email: user.email, role: String(user.role || '').toUpperCase() } });
  } catch (err) {
    console.error('[AUTH] Error:', err.message);
    return res.status(500).json({ error: 'Server error' });
  }
});

app.get(
  "/drivers/me",
  requireAuth,
  requireRole("DRIVER"),
  async (req, res) => {
    try {
      const userId = req.user.sub;

      // Driver profile
      const driverRes = await query(
        `SELECT d.id, d.full_name, d.phone, d.created_at
         FROM drivers d
         WHERE d.user_id = $1`,
        [userId]
      );

      if (driverRes.rowCount === 0) {
        return res.status(404).json({ error: "Driver not found" });
      }

      const driver = driverRes.rows[0];

      // Bound trucks
      const trucksRes = await query(
        `SELECT plate_number, is_active, last_bound_at
         FROM driver_trucks
         WHERE driver_id = $1
         ORDER BY last_bound_at DESC`,
        [driver.id]
      );

      return res.json({
        driver: {
          id: driver.id,
          fullName: driver.full_name,
          phone: driver.phone,
          createdAt: driver.created_at,
        },
        trucks: trucksRes.rows,
      });
    } catch (err) {
      console.error("GET /drivers/me error", err);
      return res.status(500).json({ error: "Server error" });
    }
  }
);

app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'auth', login: '/login (POST)' });
});

app.get('/health', (req, res) => {
  res.json({ status: 'healthy' });
});

const port = Number(process.env.PORT || 3001);
app.listen(port, '0.0.0.0', () => {
  console.log(`Auth Service running on port ${port}`);
});
