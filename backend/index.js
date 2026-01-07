const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// PostgreSQL connection (Docker or local)
const pool = new Pool({
  user: 'admin',
  host: 'localhost',
  database: 'freight_platform',
  password: 'secret_password',
  port: 5432,
});

// 1. Server status
app.get('/', (req, res) => {
  res.send('NextGen Logistics API is running...');
});

// 2. Database connectivity test
app.get('/test-db', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW()');
    res.json({ status: 'Connected', time: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'DB Connection Failed', details: err.message });
  }
});

// 3. Critical route: receive driver app location
app.post('/update-location', async (req, res) => {
  // Asigură-te că aceste nume (lat, lng) sunt identice cu cele din Flutter
  const { plate_number, lat, lng } = req.body; 
  
  try {
    await pool.query(
      "INSERT INTO truck_locations (plate_number, latitude, longitude) VALUES ($1, $2, $3) ON CONFLICT (plate_number) DO UPDATE SET latitude = $2, longitude = $3, updated_at = NOW()",
      [plate_number, lat, lng]
    );
    res.status(200).send("OK");
  } catch (err) {
    console.error("Eroare DB:", err.message); // Aceasta va apărea în terminalul tău
    res.status(500).send(err.message);
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log('-----------------------------------------');
  console.log(`Server NextGen Logistics live on all interfaces port ${PORT}`);
  console.log(`Test DB connection: http://localhost:${PORT}/test-db`);
  console.log('-----------------------------------------');
});
