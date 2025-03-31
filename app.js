// app.js - Main application file

// Load environment variables from .env file
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

// Create the Express application
const app = express();

// Define startServer function first before using it
const startServer = async (expressApp) => {
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
        startServer(expressApp).catch(err => {
          logger.error('Server start retry failed:', { error: err.message });
        });
      }, 10000);
      return; // Return to prevent continuing with server startup
    }
  }

  // Start the HTTP server
  const PORT = process.env.PORT || 3000;
  expressApp.listen(PORT, async () => {
    logger.info(`Server running on port ${PORT}`);
    
    // Schedule product listing - Run every day at 9 AM
    cron.schedule(process.env.LISTING_CRON_SCHEDULE, async () => {
      try {
        logger.info('Starting scheduled product listing job');
        await productListingScheduler.run();
        logger.info('Completed scheduled product listing job');
      } catch (error) {
        logger.error('Error in product listing job', { error: error.message });
      }
    });
    
    // Schedule product removal - Run every day at 6 PM
    cron.schedule(process.env.REMOVAL_CRON_SCHEDULE, async () => {
      try {
        logger.info('Starting scheduled product removal job');
        await productRemovalScheduler.run();
        logger.info('Completed scheduled product removal job');
      } catch (error) {
        logger.error('Error in product removal job', { error: error.message });
      }
    });
    
    // Schedule customer message check - Run every hour
    cron.schedule(process.env.MESSAGE_CRON_SCHEDULE, async () => {
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

// Parse command line arguments
const args = process.argv.slice(2);
const runMode = args[0];

// If command line argument is provided, run specific task
if (runMode) {
  handleCommandLineTask(runMode);
} else {
  // Regular server startup
  startApplication();
}

// Handle command line tasks
async function handleCommandLineTask(task) {
  try {
    // Initialize database first for all tasks
    await db.initDatabase();
    
    switch(task) {
      case 'list':
        console.log('Running product listing task...');
        await productListingScheduler.run();
        console.log('Product listing task completed.');
        break;
      case 'remove':
        console.log('Running product removal task...');
        await productRemovalScheduler.run();
        console.log('Product removal task completed.');
        break;
      case 'messages':
        console.log('Running customer message handling task...');
        await customerMessageHandler.processMessages();
        console.log('Customer message handling task completed.');
        break;
      default:
        console.log(`
Unknown task: ${task}

Available tasks:
- list     : Run product listing task
- remove   : Run product removal task
- messages : Run customer message handling task

Example usage:
  autods-win.exe list
  ./autods-macos remove
  ./autods-linux messages
        `);
    }
    
    // Exit after task is complete
    process.exit(0);
    
  } catch (error) {
    console.error('Error running task:', error);
    process.exit(1);
  }
}

// Start the application as a server
function startApplication() {
  // Setup middleware
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Logging middleware
  if (process.env.NODE_ENV !== 'production') {
    app.use(morgan('dev'));
  }

  // Welcome page
  app.get('/', (req, res) => {
    res.status(200).send(`
      <html>
        <head>
          <title>AutoDS-eBay Integration</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 0; padding: 20px; line-height: 1.6; }
            h1 { color: #333; }
            .status { padding: 10px; border-radius: 4px; margin: 10px 0; }
            .success { background-color: #d4edda; color: #155724; }
            .warning { background-color: #fff3cd; color: #856404; }
            .error { background-color: #f8d7da; color: #721c24; }
            .task-box { margin-top: 20px; border: 1px solid #ddd; padding: 15px; border-radius: 5px; }
            .task-box h2 { margin-top: 0; }
            .command { background-color: #f8f9fa; padding: 8px; border-radius: 4px; font-family: monospace; margin: 10px 0; }
          </style>
        </head>
        <body>
          <h1>AutoDS-eBay Integration Application</h1>
          <p>The application is running on port ${process.env.PORT || 3000}.</p>
          
          <div class="status ${process.env.MONGODB_URI ? 'success' : 'error'}">
            Database connection: ${process.env.MONGODB_URI ? 'Configured' : 'Not configured'}
          </div>
          
          <div class="status ${process.env.EBAY_CLIENT_ID && process.env.EBAY_CLIENT_SECRET ? 'success' : 'error'}">
            eBay API: ${process.env.EBAY_CLIENT_ID && process.env.EBAY_CLIENT_SECRET ? 'Configured' : 'Not configured'}
          </div>
          
          <div class="status ${process.env.AUTODS_USERNAME && process.env.AUTODS_PASSWORD ? 'success' : 'error'}">
            AutoDS API: ${process.env.AUTODS_USERNAME && process.env.AUTODS_PASSWORD ? 'Configured' : 'Not configured'}
          </div>
          
          <div class="task-box">
            <h2>Testing Utilities</h2>
            <p>You can run individual tasks from the command line for testing purposes:</p>
            
            <div class="command">
              <strong>Windows:</strong> npm start list<br>
              <strong>macOS:</strong> npm start list<br>
              <strong>Linux:</strong> npm start list
            </div>
            
            <p>Available commands:</p>
            <ul>
              <li><strong>list</strong> - Run the product listing task</li>
              <li><strong>remove</strong> - Run the product removal task</li>
              <li><strong>messages</strong> - Run the customer message handling task</li>
            </ul>
          </div>
          
          <p>Visit <a href="/health">Health Check</a> to see detailed application status.</p>
        </body>
      </html>
    `);
  });

  // Routes
  app.get('/health', (req, res) => {
    res.status(200).json({ 
      status: 'ok',
      environment: process.env.NODE_ENV,
      database: process.env.MONGODB_URI ? 'configured' : 'not configured',
      ebay: process.env.EBAY_CLIENT_ID ? 'configured' : 'not configured',
      autods: process.env.AUTODS_USERNAME ? 'configured' : 'not configured'
    });
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

  // Start the server
  startServer(app);
}

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