// app.js - Main application file

require('dotenv').config();
const express = require('express');
const morgan = require('morgan');
const cron = require('node-cron');
const { productListingScheduler } = require('./services/productListing');
const { productRemovalScheduler } = require('./services/productRemoval');
const { customerMessageHandler } = require('./services/customerMessages');
const logger = require('./utils/logger');
const ebayRoutes = require('./routes/ebay');
const autodsRoutes = require('./routes/autods');
const db = require('./db/database');

const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Logging middleware
if (process.env.NODE_ENV !== 'production') {
  app.use(morgan('dev'));
}

// Routes
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// eBay OAuth routes
app.use('/ebay', ebayRoutes);

// AutoDS routes
app.use('/autods', autodsRoutes);

// Global error handler middleware
app.use((err, req, res, next) => {
  const statusCode = err.statusCode || 500;
  const errorMessage = err.message || 'Internal Server Error';
  
  // Log the error with stack trace
  logger.error(`Error handling request: ${req.method} ${req.url}`, {
    error: errorMessage,
    stack: err.stack,
    requestBody: req.body,
    requestParams: req.params,
    requestQuery: req.query
  });
  
  // Don't expose stack traces in production
  const response = {
    error: errorMessage,
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack })
  };
  
  res.status(statusCode).json(response);
});

// Catch 404 errors
app.use((req, res) => {
  logger.warn(`Route not found: ${req.method} ${req.url}`);
  res.status(404).json({ error: 'Not Found' });
});

// Handle uncaught exceptions and unhandled rejections
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', { error: error.message, stack: error.stack });
  // Keep the server running instead of crashing
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Promise Rejection:', { 
    reason: reason?.message || reason,
    stack: reason?.stack,
    promise: promise.toString().substring(0, 100) // Limit to 100 chars
  });
  // Keep the server running instead of crashing
});

// Start the server
const startServer = async () => {
  try {
    // Initialize database connection
    await db.initDatabase();
    logger.info('Database connection established');
  } catch (error) {
    logger.error('Failed to start server:', { error: error.message });
    
    // If database connection fails, retry after delay
    if (error.name === 'MongoConnectionError' || error.name === 'MongoNetworkError') {
      logger.info('Retrying database connection in 10 seconds...');
      setTimeout(() => {
        startServer().catch(err => {
          logger.error('Server start retry failed:', { error: err.message });
        });
      }, 10000);
    }
  }

  // Start the HTTP server
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, async () => {
    logger.info(`Server running on port ${PORT}`);
    
    // Initialize schedulers
    // await productListingScheduler.run();
    // await productRemovalScheduler.run();
    // await customerMessageHandler.processMessages();


    
    // Schedule product listing - Run every day at 9 AM
    cron.schedule('0 9 * * *', async () => {
      try {
        logger.info('Starting scheduled product listing job');
        await productListingScheduler.run();
        logger.info('Completed scheduled product listing job');
      } catch (error) {
        logger.error('Error in product listing job', { error: error.message });
      }
    });
    
    // Schedule product removal - Run every day at 6 PM
    cron.schedule('0 18 * * *', async () => {
      try {
        logger.info('Starting scheduled product removal job');
        await productRemovalScheduler.run();
        logger.info('Completed scheduled product removal job');
      } catch (error) {
        logger.error('Error in product removal job', { error: error.message });
      }
    });
    
    // Schedule customer message check - Run every hour
    cron.schedule('0 * * * *', async () => {
      try {
        logger.info('Starting customer message check');
        await customerMessageHandler.processMessages();
        logger.info('Completed customer message check');
      } catch (error) {
        logger.error('Error in customer message handling', { error: error.message });
      }
    });
    
    logger.info('All schedulers initialized');
  });
};

// Start the server
startServer().catch(error => {
  logger.error('Failed to start server', { error: error.message });
  process.exit(1);
});

// Handle graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received. Shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received. Shutting down gracefully');
  process.exit(0);
});

module.exports = app;




// Product Listing on Schedule
// * Fetch products from AutoDS API.
// * Schedule listings on eBay API (addItem).
// * Ensure price, stock, and category are correctly set.
// * Automate periodic listing based on a set time.
// ✅ Product Removal on Schedule
// * Fetch active listings from eBay (getSellerList).
// * Compare with AutoDS stock.
// * Remove items that are out of stock (endItem).
// * Allow custom removal schedules (e.g., daily, weekly).
// ✅ Customer Chat Responses (eBay Messages API)
// * Fetch incoming customer messages.
// * Use predefined rules/AI to generate responses.
// * Auto-reply within a set timeframe.
// * Escalate complex queries to manual review.