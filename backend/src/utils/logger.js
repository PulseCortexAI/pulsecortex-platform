// Centralized logging utility with security considerations

const winston = require('winston');
const path = require('path');
const fs = require('fs');

// Ensure logs directory exists
const logsDir = path.join(__dirname, '..', '..', 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Security: Don't log sensitive data
function sanitize(data) {
  if (typeof data !== 'object' || data === null) {
    return data;
  }
  
  const sensitiveFields = [
    'password', 'passwordHash', 'token', 'refreshToken', 'apiKey', 
    'key', 'secret', 'authorization', 'cookie', 'creditCard', 'ssn'
  ];
  
  const sanitized = { ...data };
  sensitiveFields.forEach(field => {
    if (sanitized[field]) {
      sanitized[field] = '[REDACTED]';
    }
  });
  
  // Recursively sanitize nested objects
  Object.keys(sanitized).forEach(key => {
    if (typeof sanitized[key] === 'object' && sanitized[key] !== null) {
      sanitized[key] = sanitize(sanitized[key]);
    }
  });
  
  return sanitized;
}

// Create logger instance
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format.json()
  ),
  defaultMeta: { service: 'pulsecortex-api' },
  transports: [
    // Security logs (authentication failures, etc.)
    new winston.transports.File({
      filename: path.join(logsDir, 'security.log'),
      level: 'warn',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      ),
    }),
    // Application logs
    new winston.transports.File({
      filename: path.join(logsDir, 'app.log'),
    }),
    // Error logs
    new winston.transports.File({
      filename: path.join(logsDir, 'error.log'),
      level: 'error',
    }),
  ],
});

// Don't log to console in production
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple()
    ),
  }));
}

// Helper methods
logger.security = (message, meta = {}) => {
  logger.warn(`[SECURITY] ${message}`, sanitize(meta));
};

logger.auth = (userId, action, meta = {}) => {
  logger.info(`[AUTH] ${action}`, { userId, ...sanitize(meta) });
};

logger.api = (apiKeyId, endpoint, duration, meta = {}) => {
  logger.info(`[API] ${endpoint}`, { 
    apiKeyId, 
    endpoint, 
    duration,
    ...sanitize(meta) 
  });
};

logger.db = (operation, table, duration, meta = {}) => {
  logger.debug(`[DB] ${operation}.${table}`, {
    operation,
    table,
    duration,
    ...sanitize(meta)
  });
};

// Request logging middleware
const requestLogger = (req, res, next) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    const logData = {
      method: req.method,
      url: req.url,
      status: res.statusCode,
      duration,
      ip: req.ip,
      userAgent: req.get('user-agent'),
      userId: req.user?.id,
      apiKeyId: req.apiKey?.id
    };
    
    // Don't log request body for sensitive endpoints
    if (!req.url.includes('/auth') && !req.url.includes('/keys')) {
      logData.body = sanitize(req.body);
    }
    
    if (res.statusCode >= 400) {
      logger.error('Request failed', logData);
    } else {
      logger.info('Request completed', logData);
    }
  });
  
  next();
};

module.exports = {
  logger,
  requestLogger,
  sanitize
};