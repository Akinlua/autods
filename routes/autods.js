// routes/autods.js - AutoDS API routes

const express = require('express');
const router = express.Router();
const autodsAPI = require('../api/autods');
const logger = require('../utils/logger');
const db = require('../db/database');

// Helper function for async route handlers
const asyncHandler = fn => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// Get token status
router.get('/token-status', asyncHandler(async (req, res) => {
  try {
    // Check db for the latest token
    const dbToken = await db.tokens.findOne({ service: 'autods', active: true })
      .sort({ createdAt: -1 })
      .lean()
      .exec();
    
    const tokenStatus = {
      memory: {
        hasAccessToken: !!autodsAPI.token,
        isExpired: autodsAPI.tokenExpiry ? (autodsAPI.tokenExpiry < Date.now()) : null,
        expiresIn: autodsAPI.tokenExpiry ? Math.floor((autodsAPI.tokenExpiry - Date.now()) / 1000) : null
      },
      database: dbToken ? {
        hasToken: true,
        created: dbToken.createdAt,
        expiresAt: dbToken.expiresAt,
        isExpired: new Date(dbToken.expiresAt) < new Date(),
        expiresIn: Math.floor((new Date(dbToken.expiresAt) - new Date()) / 1000)
      } : { hasToken: false }
    };
    
    res.json(tokenStatus);
  } catch (error) {
    logger.error('Error getting token status', { error: error.message });
    res.status(500).json({ error: 'Failed to get token status' });
  }
}));

// Manual authorization route
router.get('/authorize', asyncHandler(async (req, res) => {
  try {
    logger.info('Manual authorization for AutoDS requested');
    
    // Check if credentials exist in env
    if (!process.env.AUTODS_USERNAME || !process.env.AUTODS_PASSWORD) {
      return res.status(400).render('pages/error', {
        activePage: 'error',
        errorMessage: 'AutoDS credentials are not configured in settings',
        error: {
          status: 400,
          stack: ''
        }
      });
    }
    
    // Display authentication page
    res.render('pages/autods-auth', {
      activePage: 'autods-auth',
      username: process.env.AUTODS_USERNAME,
      startAuth: true
    });
  } catch (error) {
    logger.error('Error in AutoDS authorization page', { error: error.message });
    res.status(500).render('pages/error', {
      activePage: 'error',
      errorMessage: 'Failed to authorize with AutoDS',
      error: {
        status: 500,
        stack: process.env.NODE_ENV !== 'production' ? error.stack : ''
      }
    });
  }
}));

// Process authorization
router.post('/process-auth', asyncHandler(async (req, res) => {
  let authInProgress = false;
  
  try {
    logger.info('Processing AutoDS authentication');
    authInProgress = true;
    
    // Set timeout for the request to handle potential process exit
    const timeoutId = setTimeout(() => {
      logger.warn('Auth request timed out on client side, responding with error status');
      if (!res.headersSent) {
        res.status(504).json({
          success: false,
          error: 'Authentication is taking longer than expected. It may still be processing in the background.'
        });
      }
    }, 55000); // 55 seconds before we respond to client
    
    // Authenticate and get a new token with a catch for specific handling
    const authPromise = autodsAPI.forceRefreshToken()
      .catch(err => {
        // Log the error but don't crash
        logger.error('AutoDS authentication error caught:', { error: err.message });
        throw err; // Re-throw to be caught by the outer try/catch
      });
    
    // Await the authentication promise
    await authPromise;
    
    // Clear timeout since authentication succeeded
    clearTimeout(timeoutId);
    authInProgress = false;
    
    // Respond with success
    res.json({
      success: true,
      message: 'AutoDS authentication successful'
    });
  } catch (error) {
    // Clear any timeouts
    if (authInProgress && !res.headersSent) {
      logger.error('Error in AutoDS authentication', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Failed to authenticate with AutoDS: ' + error.message
      });
    } else {
      logger.error('Error in AutoDS authentication (response already sent)', { error: error.message });
    }
  }
}));

// Force token refresh
router.post('/refresh-token', asyncHandler(async (req, res) => {
  try {
    logger.info('Manual token refresh requested');
    const token = await autodsAPI.forceRefreshToken();
    res.json({ success: true, message: 'Token refreshed successfully' });
  } catch (error) {
    logger.error('Error refreshing token', { error: error.message });
    res.status(500).json({ error: 'Failed to refresh token', message: error.message });
  }
}));

// Get products from AutoDS (test endpoint)
router.get('/products', asyncHandler(async (req, res) => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit) : 10;
    const offset = req.query.offset ? parseInt(req.query.offset) : 0;
    
    const products = await autodsAPI.getProducts([], limit, offset);
    res.json({ success: true, count: products.length, products });
  } catch (error) {
    logger.error('Error fetching products', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch products', message: error.message });
  }
}));

// Get store list from AutoDS
router.get('/stores', asyncHandler(async (req, res) => {
  try {
    const stores = await autodsAPI.getStoreList();
    res.json({ success: true, count: stores.length, stores });
  } catch (error) {
    logger.error('Error fetching store list', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch store list', message: error.message });
  }
}));

module.exports = router; 