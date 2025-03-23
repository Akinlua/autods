// utils/logger.js - Logging utility

const winston = require('winston');
const { format, transports } = winston;

// Define log format
const logFormat = format.combine(
  format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  format.errors({ stack: true }),
  format.splat(),
  format.json()
);

// Create logger instance
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: logFormat,
  defaultMeta: { service: 'ebay-autods-integration' },
  transports: [
    // Console transport
    new transports.Console({
      format: format.combine(
        format.colorize(),
        format.printf(({ timestamp, level, message, service, ...meta }) => {
          return `${timestamp} [${service}] ${level}: ${message} ${Object.keys(meta).length ? JSON.stringify(meta) : ''}`;
        })
      )
    }),
    // File transport for all logs
    new transports.File({ 
      filename: 'logs/app.log',
      maxsize: 10485760, // 10MB
      maxFiles: 10
    }),
    // Separate file for error logs
    new transports.File({ 
      filename: 'logs/error.log', 
      level: 'error',
      maxsize: 10485760, // 10MB
      maxFiles: 10
    })
  ]
});

module.exports = logger;