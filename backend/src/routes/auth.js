// Authentication routes with security best practices
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { 
  validateRegistration, 
  validateLogin, 
  generateToken, 
  generateRefreshToken,
  verifyRefreshToken,
  authRateLimiter,
  sanitizeInput,
  logSecurityEvent,
  BCRYPT_ROUNDS 
} = require('../middleware/auth');
const { User, ApiKey } = require('../models');
const { validationResult } = require('express-validator');
const { logger } = require('../utils/logger');

// Registration endpoint
router.post('/register', 
  authRateLimiter,
  sanitizeInput,
  validateRegistration,
  async (req, res) => {
    try {
      // Validate input
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        logger.security('Registration validation failed', { 
          email: req.body.email, 
          errors: errors.array() 
        });
        return res.status(400).json({ errors: errors.array() });
      }
      
      const { email, username, password } = req.body;
      
      // Check if user already exists
      const existingUser = await User.findOne({ 
        where: { 
          email: email.toLowerCase() 
        } 
      });
      
      if (existingUser) {
        logger.security('Registration attempted with existing email', { email });
        return res.status(409).json({ 
          error: 'User with this email already exists' 
        });
      }
      
      // Check if username already exists
      const existingUsername = await User.findOne({ 
        where: { username } 
      });
      
      if (existingUsername) {
        logger.security('Registration attempted with existing username', { username });
        return res.status(409).json({ 
          error: 'Username already taken' 
        });
      }
      
      // Hash password with bcrypt (industry standard)
      const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
      
      // Create user
      const user = await User.create({
        id: uuidv4(),
        email: email.toLowerCase(),
        username,
        passwordHash,
        isVerified: false, // Email verification required in production
        credits: 10.00, // Give new users some credits
      });
      
      // Generate tokens
      const accessToken = generateToken(user.id);
      const refreshToken = await generateRefreshToken(user.id);
      
      // Log successful registration
      logger.auth(user.id, 'registration_success', { ip: req.ip });
      
      // Don't return password hash
      const userResponse = {
        id: user.id,
        email: user.email,
        username: user.username,
        isVerified: user.isVerified,
        credits: user.credits,
        createdAt: user.createdAt,
      };
      
      res.status(201).json({
        message: 'Registration successful',
        user: userResponse,
        tokens: {
          accessToken,
          refreshToken,
          expiresIn: 900, // 15 minutes in seconds
        },
      });
      
    } catch (error) {
      logger.error('Registration error', { 
        error: error.message, 
        stack: error.stack 
      });
      res.status(500).json({ 
        error: 'Internal server error during registration' 
      });
    }
  }
);

// Login endpoint
router.post('/login', 
  authRateLimiter,
  sanitizeInput,
  validateLogin,
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }
      
      const { email, password } = req.body;
      const normalizedEmail = email.toLowerCase();
      
      // Find user
      const user = await User.findOne({ 
        where: { email: normalizedEmail } 
      });
      
      if (!user) {
        // Don't reveal that user doesn't exist
        logger.security('Login attempt with non-existent email', { 
          email: normalizedEmail,
          ip: req.ip 
        });
        await bcrypt.compare(password, '$2b$12$fakehashforconstanttiming'); // Timing attack defense
        return res.status(401).json({ 
          error: 'Invalid email or password' 
        });
      }
      
      // Verify password
      const isValidPassword = await bcrypt.compare(password, user.passwordHash);
      
      if (!isValidPassword) {
        logger.security('Login attempt with invalid password', { 
          userId: user.id,
          ip: req.ip 
        });
        return res.status(401).json({ 
          error: 'Invalid email or password' 
        });
      }
      
      // Check if account is locked/disabled
      if (user.isLocked) {
        logger.security('Login attempt to locked account', { 
          userId: user.id,
          ip: req.ip 
        });
        return res.status(403).json({ 
          error: 'Account is temporarily locked. Please contact support.' 
        });
      }
      
      // Generate tokens
      const accessToken = generateToken(user.id);
      const refreshToken = await generateRefreshToken(user.id);
      
      // Update last login
      await user.update({ lastLogin: new Date() });
      
      // Log successful login
      logger.auth(user.id, 'login_success', { ip: req.ip });
      
      // Prepare response
      const userResponse = {
        id: user.id,
        email: user.email,
        username: user.username,
        isVerified: user.isVerified,
        credits: user.credits,
        createdAt: user.createdAt,
      };
      
      res.json({
        message: 'Login successful',
        user: userResponse,
        tokens: {
          accessToken,
          refreshToken,
          expiresIn: 900,
        },
      });
      
    } catch (error) {
      logger.error('Login error', { 
        error: error.message, 
        stack: error.stack 
      });
      res.status(500).json({ 
        error: 'Internal server error during login' 
      });
    }
  }
);

// Refresh token endpoint
router.post('/refresh', 
  sanitizeInput,
  async (req, res) => {
    try {
      const { refreshToken } = req.body;
      
      if (!refreshToken) {
        return res.status(400).json({ 
          error: 'Refresh token is required' 
        });
      }
      
      const user = await verifyRefreshToken(refreshToken);
      
      if (!user) {
        logger.security('Invalid refresh token attempt', { ip: req.ip });
        return res.status(403).json({ 
          error: 'Invalid or expired refresh token' 
        });
      }
      
      // Generate new tokens
      const newAccessToken = generateToken(user.id);
      const newRefreshToken = await generateRefreshToken(user.id);
      
      logger.auth(user.id, 'token_refresh_success', { ip: req.ip });
      
      res.json({
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
        expiresIn: 900,
      });
      
    } catch (error) {
      logger.error('Token refresh error', { 
        error: error.message, 
        stack: error.stack 
      });
      res.status(500).json({ 
        error: 'Internal server error during token refresh' 
      });
    }
  }
);

// Logout endpoint
router.post('/logout', 
  sanitizeInput,
  async (req, res) => {
    try {
      const { userId, refreshToken } = req.body;
      
      if (userId && refreshToken) {
        // Verify the refresh token belongs to this user
        const user = await verifyRefreshToken(refreshToken);
        if (user && user.id === userId) {
          // Invalidate refresh token by removing hash
          await user.update({ refreshTokenHash: null });
          logger.auth(user.id, 'logout_success', { ip: req.ip });
        }
      }
      
      res.json({ message: 'Logout successful' });
      
    } catch (error) {
      logger.error('Logout error', { 
        error: error.message, 
        stack: error.stack 
      });
      res.status(500).json({ 
        error: 'Internal server error during logout' 
      });
    }
  }
);

// Verify email endpoint (placeholder for email verification flow)
router.post('/verify-email', 
  authRateLimiter,
  sanitizeInput,
  async (req, res) => {
    try {
      const { token } = req.body;
      
      if (!token) {
        return res.status(400).json({ 
          error: 'Verification token is required' 
        });
      }
      
      // In production, verify email token from database
      // For MVP, accept any token
      res.json({ 
        message: 'Email verification successful',
        note: 'In production, this would validate the token against database' 
      });
      
    } catch (error) {
      logger.error('Email verification error', { 
        error: error.message, 
        stack: error.stack 
      });
      res.status(500).json({ 
        error: 'Internal server error during email verification' 
      });
    }
  }
);

// Change password endpoint
router.post('/change-password',
  authRateLimiter,
  sanitizeInput,
  async (req, res) => {
    try {
      const { userId, currentPassword, newPassword } = req.body;
      
      if (!userId || !currentPassword || !newPassword) {
        return res.status(400).json({ 
          error: 'userId, currentPassword, and newPassword are required' 
        });
      }
      
      if (newPassword.length < 12) {
        return res.status(400).json({ 
          error: 'New password must be at least 12 characters' 
        });
      }
      
      const user = await User.findByPk(userId);
      if (!user) {
        return res.status(404).json({ 
          error: 'User not found' 
        });
      }
      
      // Verify current password
      const isValid = await bcrypt.compare(currentPassword, user.passwordHash);
      if (!isValid) {
        logger.security('Password change with invalid current password', { 
          userId,
          ip: req.ip 
        });
        return res.status(401).json({ 
          error: 'Current password is incorrect' 
        });
      }
      
      // Hash new password
      const newPasswordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
      await user.update({ passwordHash: newPasswordHash });
      
      // Invalidate all refresh tokens
      await user.update({ refreshTokenHash: null });
      
      logger.auth(user.id, 'password_change_success', { ip: req.ip });
      
      res.json({ 
        message: 'Password changed successfully',
        note: 'All refresh tokens have been invalidated' 
      });
      
    } catch (error) {
      logger.error('Password change error', { 
        error: error.message, 
        stack: error.stack 
      });
      res.status(500).json({ 
        error: 'Internal server error during password change' 
      });
    }
  }
);

// Get current user info
router.get('/me',
  sanitizeInput,
  async (req, res) => {
    try {
      const { userId } = req.query;
      
      if (!userId) {
        return res.status(400).json({ 
          error: 'userId query parameter is required' 
        });
      }
      
      const user = await User.findByPk(userId, {
        attributes: ['id', 'email', 'username', 'isVerified', 'credits', 'createdAt', 'updatedAt']
      });
      
      if (!user) {
        return res.status(404).json({ 
          error: 'User not found' 
        });
      }
      
      res.json({ user });
      
    } catch (error) {
      logger.error('Get user info error', { 
        error: error.message, 
        stack: error.stack 
      });
      res.status(500).json({ 
        error: 'Internal server error retrieving user info' 
      });
    }
  }
);

module.exports = router;