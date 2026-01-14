const jwt = require('jsonwebtoken');

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Missing token' });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET || 'SECRET_KEY');

    // Back-compat: if older tokens use `id`, map it to `sub`
    if (payload && payload.sub == null && payload.id != null) {
      payload.sub = payload.id;
    }

    // Normalize role casing for consistent checks
    if (payload && typeof payload.role === 'string') {
      payload.role = payload.role.toUpperCase();
    }

    req.user = payload;
    return next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

function requireRole(role) {
  const required = String(role || '').toUpperCase();

  return (req, res, next) => {
    const current = req.user && req.user.role ? String(req.user.role).toUpperCase() : '';

    if (!current) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    if (current !== required) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    return next();
  };
}

module.exports = { requireAuth, requireRole };
