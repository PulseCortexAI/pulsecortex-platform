// Authentication middleware for PulseCortex Platform
// Follows security best practices:
// - JWT with short expiration
// - Refresh tokens with rotation
// - Rate limiting per endpoint
// - Input validation/sanitization
// - Password hashing with bcrypt
// - Secure headers

const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const rateLimit = require('express-rate-limit');
const { User, ApiKey } = require('../models');

// Configuration
const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-change-in-production'; // Must be set via env
const JWT_EXPIRES_IN = '15m'; // Short-lived access tokens
const REFRESH_TOKEN_EXPIRES_IN = '7d'; // Longer-lived refresh tokens
const BCRYPT_ROUNDS = 12; // Industry standard

// Rate limiting for authentication endpoints
const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 attempts per IP
  message: 'Too many authentication attempts, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limiting for API endpoints (per API key)
const apiRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: async (req, res) => {
    // Get rate limit from API key
    const apiKey = req.headers['x-api-key'];
    if (!apiKey) return 60; // Default for unauthenticated
    
    try {
      const key = await ApiKey.findOne({ where: { key: apiKey, isActive: true } });
      return key ? key.rateLimit : 60;
    } catch (error) {
      return 60;
    }
  },
  keyGenerator: (req) => {
    // Rate limit by API key if present, otherwise by IP
    return req.headers['x-api-key'] || req.ip;
  },
  message: 'Rate limit exceeded',
  standardHeaders: true,
  legacyHeaders: false,
});

// Input validation for registration
const validateRegistration = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Valid email is required'),
  body('username')
    .isLength({ min: 3, max: 30 })
    .matches(/^[a-zA-Z0-9_.-]+$/)
    .withMessage('Username must be 3-30 characters and contain only letters, numbers, dots, underscores, or hyphens'),
  body('password')
    .isLength({ min: 12 })
    .withMessage('Password must be at least 12 characters')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .withMessage('Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'),
];

// Input validation for login
const validateLogin = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Valid email is required'),
  body('password')
    .isLength({ min: 1 })
    .withMessage('Password is required'),
];

// Generate JWT token
function generateToken(userId, expiresIn = JWT_EXPIRES_IN) {
  return jwt.sign(
    { 
      sub: userId,
      iat: Math.floor(Date.now() / 1000),
      type: 'access'
    },
    JWT_SECRET,
    { expiresIn }
  );
}

// Generate refresh token (stored in database)
async function generateRefreshToken(userId) {
  const refreshToken = jwt.sign(
    { 
      sub: userId,
      iat: Math.floor(Date.now() / 1000),
      type: 'refresh'
    },
    JWT_SECRET,
    { expiresIn: REFRESH_TOKEN_EXPIRES_IN }
  );
  
  // Store refresh token hash in database
  const refreshTokenHash = await bcrypt.hash(refreshToken, BCRYPT_ROUNDS);
  
  // In production, store in Redis or separate table with expiration
  // For MVP, we'll update user record
  await User.update(
    { refreshTokenHash },
    { where: { id: userId } }
  );
  
  return refreshToken;
}

// Verify refresh token
async function verifyRefreshToken(refreshToken) {
  try {
    const decoded = jwt.verify(refreshToken, JWT_SECRET);
    if (decoded.type !== 'refresh') {
      return null;
    }
    
    const user = await User.findByPk(decoded.sub);
    if (!user || !user.refreshTokenHash) {
      return null;
    }
    
    const isValid = await bcrypt.compare(refreshToken, user.refreshTokenHash);
    return isValid ? user : null;
  } catch (error) {
    return null;
  }
}

// Protect routes - requires valid JWT
async function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    
    if (decoded.type !== 'access') {
      return res.status(403).json({ error: 'Invalid token type' });
    }
    
    const user = await User.findByPk(decoded.sub);
    if (!user) {
      return res.status(403).json({ error: 'User not found' });
    }
    
    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired' });
    }
    return res.status(403).json({ error: 'Invalid token' });
  }
}

// Protect routes - requires valid API key
async function authenticateApiKey(req, res, next) {
  const apiKey = req.headers['x-api-key'];
  
  if (!apiKey) {
    return res.status(401).json({ error: 'API key required' });
  }
  
  try {
    const key = await ApiKey.findOne({ 
      where: { 
        key: apiKey,
        isActive: true 
      },
      include: [{ model: User, attributes: ['id', 'email', 'username', 'credits'] }]
    });
    
    if (!key) {
      return res.status(403).json({ error: 'Invalid or inactive API key' });
    }
    
    // Update last used timestamp
    await key.update({ lastUsed: new Date() });
    
    req.apiKey = key;
    req.user = key.User;
    next();
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error' });
  }
}

// Check user has sufficient credits
async function checkCredits(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  const user = await User.findByPk(req.user.id);
  
  if (user.credits <= 0) {
    return res.status(402).json({ 
      error: 'Insufficient credits',
      required: 1.00,
      available: user.credits
    });
  }
  
  next();
}

// Input sanitization middleware
function sanitizeInput(req, res, next) {
  // Sanitize all string inputs
  if (req.body) {
    Object.keys(req.body).forEach(key => {
      if (typeof req.body[key] === 'string') {
        req.body[key] = req.body[key]
          .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
          .trim();
      }
    });
  }
  
  // Sanitize query parameters
  if (req.query) {
    Object.keys(req.query).forEach(key => {
      if (typeof req.query[key] === 'string') {
        req.query[key] = req.query[key]
          .replace(/[<>]/g, '')
          .trim();
      }
    });
  }
  
  next();
}

// Log security events
function logSecurityEvent(userId, eventType, details = {}) {
  const logger = require('../utils/logger');
  logger.warn('Security event', {
    userId,
    eventType,
    timestamp: new Date().toISOString(),
    ip: details.ip,
    userAgent: details.userAgent,
    ...details
  });
}

module.exports = {
  authRateLimiter,
  apiRateLimiter,
  validateRegistration,
  validateLogin,
  generateToken,
  generateRefreshToken,
  verifyRefreshToken,
  authenticateToken,
  authenticateApiKey,
  checkCredits,
  sanitizeInput,
  logSecurityEvent,
  JWT_SECRET,
  JWT_EXPIRES_IN,
  REFRESH_TOKEN_EXPIRES_IN,
  BCRYPT_ROUNDS
};