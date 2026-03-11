// PulseCortex Platform Backend
// MVP: Account creation, login, API key management

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { logger, requestLogger } = require('./utils/logger');
const { sequelize, User, ApiKey } = require('./models');
const authRoutes = require('./routes/auth');

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3000;

// Security middleware
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use(requestLogger);

// Rate limiting (global)
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

// Mount Routes
app.use('/api/auth', authRoutes);

// Webhook routes (if enabled)
if (process.env.ENABLE_WEBHOOK === 'true') {
  const webhookRoutes = require('./webhook');
  app.use('/api/deploy', webhookRoutes);
  console.log('Webhook deployment endpoint enabled');
}

// Base Routes
app.get('/', (req, res) => {
  res.json({
    message: 'PulseCortex Platform API',
    version: '0.1.0',
    endpoints: {
      auth: {
        register: 'POST /api/auth/register',
        login: 'POST /api/auth/login',
        refresh: 'POST /api/auth/refresh',
        logout: 'POST /api/auth/logout',
        verify: 'POST /api/auth/verify-email',
      },
      apiKeys: {
        create: 'POST /api/keys',
        list: 'GET /api/keys',
        revoke: 'DELETE /api/keys/:id',
        usage: 'GET /api/keys/:id/usage',
      },
      models: {
        list: 'GET /api/models',
        prices: 'GET /api/models/prices',
      },
      marketplace: {
        tasks: {
          list: 'GET /api/marketplace/tasks',
          create: 'POST /api/marketplace/tasks',
          bid: 'POST /api/marketplace/tasks/:id/bid',
          complete: 'POST /api/marketplace/tasks/:id/complete',
        },
      },
    },
  });
});

// Health check
app.get('/health', async (req, res) => {
  try {
    await sequelize.authenticate();
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      database: 'connected',
      uptime: process.uptime(),
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      timestamp: new Date().toISOString(),
      database: 'disconnected',
      error: error.message,
    });
  }
});

// Placeholder routes for MVP API Keys and Models
app.post('/api/keys', (req, res) => {
  res.status(201).json({
    message: 'API key creation',
    note: 'Implementation pending',
    key: 'sk-test-' + Math.random().toString(36).substring(2, 15),
  });
});

app.get('/api/keys', (req, res) => {
  res.json({
    message: 'List API keys',
    note: 'Implementation pending',
    keys: [],
  });
});

app.get('/api/models', (req, res) => {
  res.json({
    models: [
      {
        id: 'deepseek-v3.2',
        name: 'DeepSeek V3.2',
        provider: 'deepinfra',
        context: 128000,
        pricing: {
          input: 0.14,
          output: 0.28,
          unit: 'per million tokens',
        },
        status: 'available',
      },
      {
        id: 'gemini-3-pro-preview',
        name: 'Gemini 3 Pro Preview',
        provider: 'google',
        context: 1000000,
        pricing: {
          input: 0.75,
          output: 3.00,
          unit: 'per million tokens',
        },
        status: 'available',
      },
    ],
  });
});

// Initialize database and start server
async function initialize() {
  try {
    // Note: Do not use force: true in production!
    await sequelize.sync({ force: false });
    logger.info('Database synchronized');
    
    app.listen(PORT, () => {
      logger.info(`PulseCortex Platform API listening on http://localhost:${PORT}`);
      logger.info(`Health check: http://localhost:${PORT}/health`);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  initialize();
}

module.exports = app;