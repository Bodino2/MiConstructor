require('dotenv').config();
const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const path = require('path');
const { Pool } = require('pg');
// Node 16 fallback: lazy-import node-fetch if global fetch is missing
const fetch = global.fetch || ((...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args)));

const app = express();
const locationStore = new Map();
// Body parser must be before routes so login receives JSON
app.use(express.json());
// Temporarily disabled pool - database not needed for MVP testing
// const pool = new Pool({
//     user: process.env.DB_USER,
//     host: process.env.DB_HOST,
//     database: process.env.DB_NAME,
//     password: process.env.DB_PASSWORD,
//     port: process.env.DB_PORT,
// });

// 1. Direct AUTH endpoint - avoid proxy hangs
app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;
    console.log(`[AUTH] Forwarding login: ${email}`);
    try {
        const response = await fetch('http://localhost:3001/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password }),
        });
        const data = await response.json();
        res.status(response.status).json(data);
    } catch (err) {
        console.error('[AUTH] Error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// Removed static file serving to prevent gateway hangs
// app.use(express.static(path.join(__dirname, '../')));

// 2. Test bază de date (disabled)
// app.get('/test-db', async (req, res) => {
//     try {
//         const result = await pool.query('SELECT NOW()');
//         res.json({ status: 'Connected', time: result.rows[0] });
//     } catch (err) {
//         console.error('[DB] Query error:', err.message);
//         res.status(500).json({ status: 'Error', message: err.message });
//     }
// });

// 3. Endpoint locație (folosit de Flutter)
app.post('/update-location', async (req, res) => {
    const { lat, lng, plate_number } = req.body;
    const latitude = Number(lat);
    const longitude = Number(lng);
    if (!plate_number || Number.isNaN(latitude) || Number.isNaN(longitude)) {
        return res.status(400).json({ error: 'Invalid payload' });
    }

    locationStore.set(plate_number, {
        plate_number,
        latitude,
        longitude,
        updated_at: new Date().toISOString(),
    });

    console.log(`[GPS] ${plate_number} la ${latitude}, ${longitude}`);
    res.sendStatus(200);
});

// 4. Exponăm flota curentă pentru dashboard
app.get('/get-fleet', (req, res) => {
    const data = Array.from(locationStore.values());
    res.json(data);
});

app.listen(3000, '0.0.0.0', () => {
    console.log('Gateway deschis pentru telefon la portul 3000');
});
