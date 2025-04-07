// app.js - Main application file

// Load environment variables from .env file
require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const ejs = require('ejs');
const morgan = require('morgan');
const cron = require('node-cron');
const axios = require('axios');
const { productListingScheduler } = require('./services/productListing');
const { productRemovalScheduler } = require('./services/productRemoval');
const { customerMessageHandler } = require('./services/customerMessages');
const logger = require('./utils/logger');
const ebayRoutes = require('./routes/ebay');
const autodsRoutes = require('./routes/autods');
const apiRoutes = require('./routes/api');
const db = require('./db/database');
const ebayAPI = require('./utils/ebayAPI');

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
    logger.info(`Server URL: http://localhost:${PORT}`);
    
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

// Function to restart the server by running npm start
const restartServer = () => {
  logger.info('Restarting server via npm start...');
  
  const { exec } = require('child_process');
  
  // Use setTimeout to allow the response to be sent before restart
  setTimeout(() => {
    try {
      // For Windows, we need to start a new process and detach it
      const isWindows = process.platform === 'win32';
      const cmd = isWindows 
        ? 'start cmd.exe /c npm start' 
        : 'npm start &';
      
      // Execute the command and detach
      const child = exec(cmd, {
        detached: true,
        stdio: 'ignore',
        shell: true,
        windowsHide: false
      });
      
      if (child && child.unref) {
        child.unref();
      }
      
      logger.info('Started new server process, exiting current process...');
      
      // Exit current process
      setTimeout(() => {
        process.exit(0);
      }, 500);
      
    } catch (error) {
      logger.error('Failed to restart server:', error);
      // Continue running if restart fails
    }
  }, 1000);
};

// Start the application as a server
function startApplication() {
  // Setup middleware
  // app.use(bodyParser.urlencoded({ extended: true }));
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(express.static(path.join(__dirname, 'public')));

  // Set up view engine
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, 'views'));

  // Logging middleware
  if (process.env.NODE_ENV !== 'production') {
    app.use(morgan('dev'));
  }

  // Welcome/info page
  app.get('/', (req, res) => {
    res.redirect('/dashboard');
  });

  // Direct settings update endpoint without middleware conflicts
  app.post('/direct-settings-update', express.urlencoded({ extended: true }), (req, res) => {
    try {
      const updates = req.body;
      
      if (!updates || Object.keys(updates).length === 0) {
        return res.status(400).json({
          success: false,
          error: 'No settings provided to update'
        });
      }
      
      logger.info('Received settings update:', updates);
      
      // Process settings update
      const fs = require('fs');
      const dotenv = require('dotenv');
      const envPath = path.resolve(process.cwd(), '.env');
      const envContent = fs.readFileSync(envPath, 'utf8');
      const envConfig = dotenv.parse(envContent);
      
      // Validate updates
      const allowedSettings = [
        'PORT', 'LOG_LEVEL', 'DEFAULT_MARKUP', 'MINIMUM_MARGIN', 
        'MINIMUM_STOCK', 'MAX_LISTING_QUANTITY', 'RESPONSE_TIME_HOURS',
        'LISTING_CRON_SCHEDULE', 'REMOVAL_CRON_SCHEDULE', 'MESSAGE_CRON_SCHEDULE',
        'EMAIL_ENABLED', 'EMAIL_HOST', 'EMAIL_PORT', 'ADMIN_EMAILS', 
        'AUTODS_STORE_IDS', 'ESCALATION_KEYWORDS',
        'EBAY_API_URL', 'EBAY_CLIENT_ID', 'EBAY_USERNAME', 'EBAY_PASSWORD',
        'EBAY_FULFILLMENT_POLICY_ID', 'EBAY_PAYMENT_POLICY_ID', 'EBAY_RETURN_POLICY_ID',
        'AUTODS_API_URL', 'AUTODS_USERNAME', 'AUTODS_PASSWORD'
      ];
      
      const updatedEnv = { ...envConfig };
      for (const key in updates) {
        if (allowedSettings.includes(key)) {
          updatedEnv[key] = updates[key];
        }
      }
      
      // Convert updated config to .env file format
      const newEnvContent = Object.entries(updatedEnv)
        .map(([key, value]) => `${key}=${value}`)
        .join('\n');
      
      // Write back to .env file
      fs.writeFileSync(envPath, newEnvContent);
      
      res.json({
        success: true,
        message: 'Settings updated successfully. Server will restart.'
      });
      
      // Restart the server
      restartServer();
    } catch (error) {
      logger.error('Error in direct settings update:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to update settings: ' + error.message
      });
    }
  });
 
  // Dashboard
  app.get('/dashboard', async (req, res) => {
    try {
      // Get real dashboard data from database
      const activeListings = await db.listings.countDocuments({ active: true });
      const endedListings = await db.listings.countDocuments({ active: false });
      const totalMessages = await db.messages.countDocuments();
      const respondedMessages = await db.messages.countDocuments({ responded: true });
      
      // Get last run times
      const jobStatus = {
        listing: productListingScheduler.lastRun || 'Never run',
        removal: productRemovalScheduler.lastRun || 'Never run',
        messages: customerMessageHandler.lastRun || 'Never run'
      };
      
      // Get latest listings
      const latestListings = await db.listings.find()
        .sort({ listedAt: -1 })
        .limit(5)
        .lean();
      
      res.render('pages/dashboard', { 
        activePage: 'dashboard',
        stats: {
          activeListings,
          endedListings,
          totalMessages,
          respondedMessages
        },
        jobStatus,
        latestListings
      });
    } catch (error) {
      logger.error('Dashboard error:', error);
      res.render('pages/dashboard', { 
        activePage: 'dashboard',
        error: 'Failed to load dashboard data',
        stats: {},
        jobStatus: {},
        latestListings: []
      });
    }
  });

  // Listings page
  app.get('/listings', async (req, res) => {
    try {
      const page = parseInt(req.query.page) || 1;
      const perPage = 10;
      const filter = req.query.filter || 'active';
      
      // Set up filter query
      const query = {};
      if (filter === 'active') {
        query.active = true;
      } else if (filter === 'ended') {
        query.active = false;
      }
      
      // Get listings from database with pagination
      const skip = (page - 1) * perPage;
      const listings = await db.listings.find(query)
        .sort({ listedAt: -1 })
        .skip(skip)
        .limit(perPage)
        .lean();
      
      // Count total for pagination
      const totalListings = await db.listings.countDocuments(query);
      const totalPages = Math.ceil(totalListings / perPage);
      
      res.render('pages/listings', { 
        activePage: 'listings',
        listings,
        totalListings,
        page,
        perPage,
        totalPages,
        filter
      });
    } catch (error) {
      logger.error('Listings error:', error);
      res.render('pages/listings', { 
        activePage: 'listings',
        listings: [],
        error: 'Failed to load listings'
      });
    }
  });

  // Response templates page
  app.get('/templates', async (req, res) => {
    try {
      // Get response templates
      const { responseTemplates } = require('./utils/responseGenerator');
      
      res.render('pages/templates', { 
        activePage: 'templates',
        templates: responseTemplates
      });
    } catch (error) {
      logger.error('Templates error:', error);
      res.render('pages/templates', { 
        activePage: 'templates',
        templates: {},
        error: 'Failed to load templates'
      });
    }
  });

  // Settings page
  app.get('/settings', async (req, res) => {
    try {
      // Read from .env file
      const fs = require('fs');
      const path = require('path');
      const dotenv = require('dotenv');
      
      const envPath = path.resolve(process.cwd(), '.env');
      const envContent = fs.readFileSync(envPath, 'utf8');
      const envConfig = dotenv.parse(envContent);
      
      // Filter sensitive information
      const filteredConfig = {};
      for (const key in envConfig) {
        // Skip sensitive keys
        if (key.includes('SECRET') || key.includes('PASSWORD') || key.includes('TOKEN')) {
          filteredConfig[key] = '***********';
        } else {
          filteredConfig[key] = envConfig[key];
        }
      }
      
      // Group settings by category
      const groupedSettings = {
        server: {},
        business: {},
        scheduling: {},
        api: {},
        email: {}
      };
      
      // Server settings
      if (filteredConfig.PORT) groupedSettings.server.PORT = filteredConfig.PORT;
      if (filteredConfig.NODE_ENV) groupedSettings.server.NODE_ENV = filteredConfig.NODE_ENV;
      if (filteredConfig.LOG_LEVEL) groupedSettings.server.LOG_LEVEL = filteredConfig.LOG_LEVEL;
      
      // Business logic settings
      if (filteredConfig.DEFAULT_MARKUP) groupedSettings.business.DEFAULT_MARKUP = filteredConfig.DEFAULT_MARKUP;
      if (filteredConfig.MINIMUM_MARGIN) groupedSettings.business.MINIMUM_MARGIN = filteredConfig.MINIMUM_MARGIN;
      if (filteredConfig.MINIMUM_STOCK) groupedSettings.business.MINIMUM_STOCK = filteredConfig.MINIMUM_STOCK;
      if (filteredConfig.MAX_LISTING_QUANTITY) groupedSettings.business.MAX_LISTING_QUANTITY = filteredConfig.MAX_LISTING_QUANTITY;
      if (filteredConfig.RESPONSE_TIME_HOURS) groupedSettings.business.RESPONSE_TIME_HOURS = filteredConfig.RESPONSE_TIME_HOURS;
      
      // Scheduling settings
      if (filteredConfig.LISTING_CRON_SCHEDULE) groupedSettings.scheduling.LISTING_CRON_SCHEDULE = filteredConfig.LISTING_CRON_SCHEDULE;
      if (filteredConfig.REMOVAL_CRON_SCHEDULE) groupedSettings.scheduling.REMOVAL_CRON_SCHEDULE = filteredConfig.REMOVAL_CRON_SCHEDULE;
      if (filteredConfig.MESSAGE_CRON_SCHEDULE) groupedSettings.scheduling.MESSAGE_CRON_SCHEDULE = filteredConfig.MESSAGE_CRON_SCHEDULE;
      
      // API settings (eBay & AutoDS)
      if (filteredConfig.EBAY_API_URL) groupedSettings.api.EBAY_API_URL = filteredConfig.EBAY_API_URL;
      if (filteredConfig.EBAY_CLIENT_ID) groupedSettings.api.EBAY_CLIENT_ID = filteredConfig.EBAY_CLIENT_ID;
      if (filteredConfig.EBAY_USERNAME) groupedSettings.api.EBAY_USERNAME = filteredConfig.EBAY_USERNAME;
      if (filteredConfig.EBAY_PASSWORD) groupedSettings.api.EBAY_PASSWORD = '***********';
      if (filteredConfig.EBAY_FULFILLMENT_POLICY_ID) groupedSettings.api.EBAY_FULFILLMENT_POLICY_ID = filteredConfig.EBAY_FULFILLMENT_POLICY_ID;
      if (filteredConfig.EBAY_PAYMENT_POLICY_ID) groupedSettings.api.EBAY_PAYMENT_POLICY_ID = filteredConfig.EBAY_PAYMENT_POLICY_ID;
      if (filteredConfig.EBAY_RETURN_POLICY_ID) groupedSettings.api.EBAY_RETURN_POLICY_ID = filteredConfig.EBAY_RETURN_POLICY_ID;
      if (filteredConfig.AUTODS_API_URL) groupedSettings.api.AUTODS_API_URL = filteredConfig.AUTODS_API_URL;
      if (filteredConfig.AUTODS_STORE_IDS) groupedSettings.api.AUTODS_STORE_IDS = filteredConfig.AUTODS_STORE_IDS;
      if (filteredConfig.AUTODS_USERNAME) groupedSettings.api.AUTODS_USERNAME = filteredConfig.AUTODS_USERNAME;
      if (filteredConfig.AUTODS_PASSWORD) groupedSettings.api.AUTODS_PASSWORD = '***********';
      
      // Email settings
      if (filteredConfig.EMAIL_ENABLED) groupedSettings.email.EMAIL_ENABLED = filteredConfig.EMAIL_ENABLED;
      if (filteredConfig.EMAIL_HOST) groupedSettings.email.EMAIL_HOST = filteredConfig.EMAIL_HOST;
      if (filteredConfig.EMAIL_PORT) groupedSettings.email.EMAIL_PORT = filteredConfig.EMAIL_PORT;
      if (filteredConfig.ADMIN_EMAILS) groupedSettings.email.ADMIN_EMAILS = filteredConfig.ADMIN_EMAILS;
      
      res.render('pages/settings', { 
        activePage: 'settings',
        settings: groupedSettings
      });
    } catch (error) {
      logger.error('Settings error:', error);
      res.render('pages/settings', { 
        activePage: 'settings',
        settings: {},
        error: 'Failed to load settings'
      });
    }
  });

  // API routes
  app.use('/api', apiRoutes);

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
    
    if (req.accepts('html')) {
      res.status(statusCode).render('pages/error', {
        activePage: 'error',
        errorMessage: errorMessage,
        error: {
          status: statusCode,
          stack: process.env.NODE_ENV !== 'production' ? err.stack : ''
        }
      });
    } else {
      res.status(statusCode).json(response);
    }
  });

  // Catch 404 errors
  app.use((req, res) => {
    if (req.accepts('html')) {
      res.status(404).render('pages/404', {
        activePage: null
      });
    } else {
      res.status(404).json({ error: 'Not Found' });
    }
  });

  // Start the server
  startServer(app);
}

module.exports = app;