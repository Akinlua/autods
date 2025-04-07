// routes/api.js - Core API endpoints
const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const db = require('../db/database');
const logger = require('../utils/logger');
const { productListingScheduler } = require('../services/productListing');
const { productRemovalScheduler } = require('../services/productRemoval');
const { customerMessageHandler } = require('../services/customerMessages');

// Error handler wrapper
const asyncHandler = fn => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// Get application settings
router.get('/settings', asyncHandler(async (req, res) => {
  try {
    // Read from .env file
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

    res.json({ 
      success: true, 
      data: filteredConfig 
    });
  } catch (error) {
    logger.error('Error reading settings', { error: error.message });
    res.status(500).json({ 
      success: false, 
      error: 'Failed to load settings' 
    });
  }
}));

// Function to restart the server
const restartServer = () => {
  logger.info('Restarting server due to settings change...');
  
  // Use setTimeout to allow the response to be sent before restart
  setTimeout(() => {
    process.exit(0); // Exit with success code, process manager (PM2/systemd) will restart
  }, 1000);
};

// Update application settings
router.post('/settings', asyncHandler(async (req, res) => {
  try {
    const updates = req.body;
    
    if (!updates || Object.keys(updates).length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No settings provided to update'
      });
    }
    
    const envPath = path.resolve(process.cwd(), '.env');
    const envContent = fs.readFileSync(envPath, 'utf8');
    const envConfig = dotenv.parse(envContent);

    // Validate updates
    const allowedSettings = [
      'PORT', 'LOG_LEVEL', 'DEFAULT_MARKUP', 'MINIMUM_MARGIN', 
      'MINIMUM_STOCK', 'MAX_LISTING_QUANTITY', 'RESPONSE_TIME_HOURS',
      'LISTING_CRON_SCHEDULE', 'REMOVAL_CRON_SCHEDULE', 'MESSAGE_CRON_SCHEDULE',
      'EMAIL_ENABLED', 'EMAIL_HOST', 'EMAIL_PORT', 'ADMIN_EMAILS', 
      'AUTODS_STORE_IDS', 'ESCALATION_KEYWORDS'
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
      message: 'Settings updated successfully. Server will restart to apply changes.' 
    });
    
    // Restart the server after response is sent
    restartServer();
  } catch (error) {
    logger.error('Error updating settings', { error: error.message });
    res.status(500).json({ 
      success: false, 
      error: 'Failed to update settings: ' + error.message 
    });
  }
}));

// Get response templates
router.get('/response-templates', asyncHandler(async (req, res) => {
  try {
    // Get the templates from the responseGenerator module
    const { responseTemplates } = require('../utils/responseGenerator');
    
    res.json({ 
      success: true, 
      data: responseTemplates 
    });
  } catch (error) {
    logger.error('Error fetching response templates', { error: error.message });
    res.status(500).json({ 
      success: false, 
      error: 'Failed to load response templates' 
    });
  }
}));

// Update response templates
router.post('/response-templates', asyncHandler(async (req, res) => {
  try {
    const updates = req.body;
    const { updateTemplates } = require('../utils/responseGenerator');
    
    // Update response templates
    const result = await updateTemplates(updates);
    
    if (result) {
      res.json({ 
        success: true, 
        message: 'Response templates updated successfully' 
      });
    } else {
      throw new Error('Failed to update templates');
    }
  } catch (error) {
    logger.error('Error updating response templates', { error: error.message });
    res.status(500).json({ 
      success: false, 
      error: 'Failed to update response templates' 
    });
  }
}));

// Get listings
router.get('/listings', asyncHandler(async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const filter = req.query.filter || 'active';
    
    // Calculate skip value for pagination
    const skip = (page - 1) * limit;
    
    // Set up filter query
    const query = {};
    if (filter === 'active') {
      query.active = true;
    } else if (filter === 'ended') {
      query.active = false;
    }
    
    // Get listings from database
    const listings = await db.listings.find(query)
      .sort({ listedAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();
    
    // Count total listings for pagination
    const total = await db.listings.countDocuments(query);
    
    res.json({
      success: true,
      data: {
        listings,
        pagination: {
          total,
          page,
          limit,
          pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    logger.error('Error fetching listings', { error: error.message });
    res.status(500).json({ 
      success: false, 
      error: 'Failed to load listings' 
    });
  }
}));

// Get messages
router.get('/messages', asyncHandler(async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const filter = req.query.filter || 'all';
    
    // Calculate skip value for pagination
    const skip = (page - 1) * limit;
    
    // Set up filter query
    const query = {};
    if (filter === 'responded') {
      query.responded = true;
    } else if (filter === 'unresponded') {
      query.responded = false;
    } else if (filter === 'escalated') {
      query.escalated = true;
    }
    
    // Get messages from database
    const messages = await db.messages.find(query)
      .sort({ receivedAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();
    
    // Count total messages for pagination
    const total = await db.messages.countDocuments(query);
    
    res.json({
      success: true,
      data: {
        messages,
        pagination: {
          total,
          page,
          limit,
          pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    logger.error('Error fetching messages', { error: error.message });
    res.status(500).json({ 
      success: false, 
      error: 'Failed to load messages' 
    });
  }
}));

// Trigger a job manually
router.post('/jobs/run', asyncHandler(async (req, res) => {
  try {
    const { job } = req.body;
    
    if (!job) {
      return res.status(400).json({
        success: false,
        error: 'Job type not specified'
      });
    }
    
    let result;
    
    switch (job) {
      case 'listing':
        result = await productListingScheduler.run();
        break;
      case 'removal':
        result = await productRemovalScheduler.run();
        break;
      case 'messages':
        result = await customerMessageHandler.processMessages();
        break;
      default:
        return res.status(400).json({
          success: false,
          error: 'Invalid job type'
        });
    }
    
    res.json({
      success: true,
      message: `${job} job completed successfully`,
      data: result
    });
  } catch (error) {
    logger.error('Error running job', { error: error.message });
    res.status(500).json({ 
      success: false, 
      error: 'Failed to run job' 
    });
  }
}));

// Get job status
router.get('/jobs/status', asyncHandler(async (req, res) => {
  try {
    // Get last run times from the service modules
    const lastRuns = {
      listing: productListingScheduler.lastRun || null,
      removal: productRemovalScheduler.lastRun || null,
      messages: customerMessageHandler.lastRun || null
    };
    
    res.json({
      success: true,
      data: lastRuns
    });
  } catch (error) {
    logger.error('Error fetching job status', { error: error.message });
    res.status(500).json({ 
      success: false, 
      error: 'Failed to get job status' 
    });
  }
}));

// Update settings
router.post('/update-settings', async (req, res) => {
  try {
    const { settings } = req.body;
    const logger = require('../utils/logger');
    
    logger.info('Received settings update request');
    
    // Validate settings
    if (!settings || Object.keys(settings).length === 0) {
      return res.status(400).json({ success: false, error: 'No settings provided' });
    }
    
    // List of allowed settings to update
    const allowedSettings = [
      'PORT', 
      'LOG_LEVEL',
      'DEFAULT_MARKUP',
      'MINIMUM_MARGIN',
      'MINIMUM_STOCK',
      'MAX_LISTING_QUANTITY',
      'RESPONSE_TIME_HOURS',
      'LISTING_CRON_SCHEDULE',
      'REMOVAL_CRON_SCHEDULE',
      'MESSAGE_CRON_SCHEDULE',
      'EBAY_API_URL',
      'EBAY_CLIENT_ID',
      'EBAY_USERNAME',
      'EBAY_PASSWORD',
      'EBAY_FULFILLMENT_POLICY_ID',
      'EBAY_PAYMENT_POLICY_ID',
      'EBAY_RETURN_POLICY_ID',
      'AUTODS_API_URL',
      'AUTODS_STORE_IDS',
      'AUTODS_USERNAME',
      'AUTODS_PASSWORD',
      'EMAIL_ENABLED',
      'EMAIL_HOST',
      'EMAIL_PORT',
      'ADMIN_EMAILS'
    ];

    // Read current .env file
    const envPath = path.resolve(process.cwd(), '.env');
    const envContent = fs.readFileSync(envPath, 'utf8');
    const envConfig = dotenv.parse(envContent);

    const updatedEnv = { ...envConfig };
    for (const key in settings) {
      if (allowedSettings.includes(key)) {
        updatedEnv[key] = settings[key];
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
      message: 'Settings updated successfully. Server will restart to apply changes.' 
    });
    
    // Restart the server after response is sent
    restartServer();
  } catch (error) {
    logger.error('Error updating settings', { error: error.message });
    res.status(500).json({ 
      success: false, 
      error: 'Failed to update settings: ' + error.message 
    });
  }
});

module.exports = router;
