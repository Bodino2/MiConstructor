const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// PostgreSQL connection
const pool = new Pool({
  user: 'admin',
  host: 'localhost',
  database: 'freight_platform',
  password: 'secret_password',
  port: 5432,
});

// API endpoint: Get all truck locations
app.get('/api/trucks', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT plate_number, latitude, longitude, updated_at FROM truck_locations'
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching trucks:', err.message);
    res.status(500).json({ error: 'Database error' });
  }
});

// API endpoint: Get specific truck location
app.get('/api/trucks/:plate_number', async (req, res) => {
  try {
    const { plate_number } = req.params;
    const result = await pool.query(
      'SELECT plate_number, latitude, longitude, updated_at FROM truck_locations WHERE plate_number = $1',
      [plate_number]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Truck not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error fetching truck:', err.message);
    res.status(500).json({ error: 'Database error' });
  }
});

// Serve the dashboard
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/public/index.html');
});

app.listen(PORT, '0.0.0.0', () => {
  console.log('-----------------------------------------');
  console.log(`Fleet Dashboard live on http://localhost:${PORT}`);
  console.log('-----------------------------------------');
});
