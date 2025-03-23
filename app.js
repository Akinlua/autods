// app.js - Main application file

require('dotenv').config();
const express = require('express');
const cron = require('node-cron');
const { productListingScheduler } = require('./services/productListing');
const { productRemovalScheduler } = require('./services/productRemoval');
const { customerMessageHandler } = require('./services/customerMessages');
const logger = require('./utils/logger');
const ebayRoutes = require('./routes/ebay');
const db = require('./db/database');

const app = express();
app.use(express.json());

// Default port
const PORT = process.env.PORT || 3000;

// Routes
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// eBay OAuth routes
app.use('/ebay', ebayRoutes);

// Start the server
const startServer = async () => {
  try {
    // Initialize database connection
    await db.initDatabase();
    logger.info('Database initialized');
  } catch (error) {
    logger.warn('Failed to connect to database', { error: error.message });
    logger.warn('Application will continue without database persistence');
  }

  // Start the HTTP server
  app.listen(PORT, async () => {
    logger.info(`Server running on port ${PORT}`);
    
    // Initialize schedulers
    await productListingScheduler.run();
    
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