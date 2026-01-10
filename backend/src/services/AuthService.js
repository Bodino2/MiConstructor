const jwt = require('jsonwebtoken');
const { hashPassword, verifyPassword } = require('../utils/password');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-env';

class AuthService {
  // Mock user database (replace with real database queries)
  constructor() {
    this.users = [
      {
        id: 1,
        email: 'admin@nextgen.com',
        username: 'admin',
        password: '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcg7b3XeKeUxWdeS86E36CM3/M.', // bcrypt hash of 'admin123'
        role: 'admin',
        isActive: true,
      },
      {
        id: 2,
        email: 'driver@nextgen.com',
        username: 'driver',
        password: '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcg7b3XeKeUxWdeS86E36CM3/M.', // bcrypt hash of 'driver123'
        role: 'driver',
        isActive: true,
      },
    ];
  }

  // Find user by email
  async findByEmail(email) {
    return this.users.find((u) => u.email === email);
  }

  // Find user by username
  async findByUsername(username) {
    return this.users.find((u) => u.username === username);
  }

  // Validate user credentials
  async validateUser(email, password) {
    const user = await this.findByEmail(email);

    if (!user || !user.isActive) {
      return null;
    }

    // Use bcrypt to compare passwords
    const isPasswordValid = await verifyPassword(password, user.password);

    if (!isPasswordValid) {
      return null;
    }

    // Return user without password
    const { password: _, ...result } = user;
    return result;
  }

  // Generate JWT token
  async login(user) {
    const payload = {
      userId: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
    };

    const token = jwt.sign(payload, JWT_SECRET, {
      expiresIn: '24h',
    });

    return {
      access_token: token,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        role: user.role,
      },
    };
  }

  // Register new user
  async register(username, email, password, role = 'driver') {
    // Check if user exists
    if (await this.findByEmail(email) || await this.findByUsername(username)) {
      throw new Error('User already exists');
    }

    // Hash password
    const hashedPassword = await hashPassword(password);

    // Create new user
    const newUser = {
      id: this.users.length + 1,
      username,
      email,
      password: hashedPassword,
      role,
      isActive: true,
    };

    this.users.push(newUser);

    // Return token and user info
    const { password: _, ...userWithoutPassword } = newUser;
    return this.login(userWithoutPassword);
  }

  // Verify JWT token
  async verifyToken(token) {
    try {
      return jwt.verify(token, JWT_SECRET);
    } catch (err) {
      return null;
    }
  }
}

module.exports = new AuthService();
