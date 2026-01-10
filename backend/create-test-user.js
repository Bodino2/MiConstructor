require('dotenv').config();
const { Pool } = require('pg');
const bcrypt = require('bcrypt');

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

async function createTestUser() {
  try {
    // Hash password
    const hashedPassword = await bcrypt.hash('admin123', 10);
    
    // Delete old user if exists
    await pool.query('DELETE FROM users WHERE email = $1', ['admin@nextgen.com']);
    
    // Insert new user
    const result = await pool.query(
      'INSERT INTO users (email, password, role) VALUES ($1, $2, $3) RETURNING *',
      ['admin@nextgen.com', hashedPassword, 'driver']
    );
    
    console.log('✅ User created successfully:');
    console.log('Email:', result.rows[0].email);
    console.log('Role:', result.rows[0].role);
    console.log('\n📱 Login credentials:');
    console.log('Email: admin@nextgen.com');
    console.log('Password: admin123');
    
  } catch (err) {
    console.error('❌ Error:', err.message);
  } finally {
    await pool.end();
  }
}

createTestUser();
