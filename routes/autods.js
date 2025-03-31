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

module.exports = router; 