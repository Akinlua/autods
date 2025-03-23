// routes/ebay.js - eBay OAuth routes

const express = require('express');
const router = express.Router();
const ebayAPI = require('../api/ebay');
const logger = require('../utils/logger');
const { tokens } = require('../db/database');

// Define the required scopes for your application
const REQUIRED_SCOPES = [
  'https://api.ebay.com/oauth/api_scope', 
  'https://api.ebay.com/oauth/api_scope/sell.inventory.readonly',
  'https://api.ebay.com/oauth/api_scope/sell.inventory',
  'https://api.ebay.com/oauth/api_scope/sell.account.readonly',
  'https://api.ebay.com/oauth/api_scope/sell.account',
  'https://api.ebay.com/oauth/api_scope/sell.fulfillment.readonly',
  'https://api.ebay.com/oauth/api_scope/sell.fulfillment',
  'https://api.ebay.com/oauth/api_scope/sell.marketing.readonly',
  'https://api.ebay.com/oauth/api_scope/sell.marketing'
];

// Initiate eBay OAuth flow (manual route)
router.get('/authorize', (req, res) => {
  try {
    const authUrl = ebayAPI.getAuthorizationUrl(REQUIRED_SCOPES);
    
    logger.info('Redirecting to eBay authorization page');
    res.redirect(authUrl);
  } catch (error) {
    logger.error('Error generating authorization URL', { error: error.message });
    res.status(500).json({ error: 'Failed to generate authorization URL' });
  }
});

// OAuth callback route
router.get('/callback', async (req, res) => {
  const { code, state, error } = req.query;
  
  if (error) {
    logger.error('Error in eBay OAuth callback', { error });
    ebayAPI.authorizationCompleted(new Error(error));
    return res.status(400).json({ error: 'Authorization failed', details: error });
  }
  
  if (!code) {
    const noCodeError = new Error('No authorization code received');
    logger.error(noCodeError.message);
    ebayAPI.authorizationCompleted(noCodeError);
    return res.status(400).json({ error: noCodeError.message });
  }
  
  try {
    const tokenData = await ebayAPI.exchangeCodeForToken(code);
    
    // The tokens are now saved to the database by the ebayAPI class
    logger.info('Successfully obtained eBay access and refresh tokens');
    
    // Return a success message
    res.status(200).json({ success: true, message: 'eBay account connected successfully' });
  } catch (error) {
    logger.error('Error exchanging code for token', { error: error.message });
    res.status(500).json({ error: 'Failed to exchange authorization code for token' });
  }
});

// Token info endpoint - for debugging
router.get('/token-status', async (req, res) => {
  try {
    // Check db for the latest token
    const dbToken = await tokens.findOne({ service: 'ebay', active: true }).sort({ createdAt: -1 });
    
    const tokenStatus = {
      memory: {
        hasAccessToken: !!ebayAPI.accessToken,
        hasRefreshToken: !!ebayAPI.refreshToken,
        isExpired: ebayAPI.tokenExpiry ? (ebayAPI.tokenExpiry < Date.now()) : null,
        expiresIn: ebayAPI.tokenExpiry ? Math.floor((ebayAPI.tokenExpiry - Date.now()) / 1000) : null,
        authorizationInProgress: ebayAPI.authorizationInProgress
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
});

// Test token endpoint - forces a token check/refresh
router.get('/test-token', async (req, res) => {
  try {
    const token = await ebayAPI.getAccessToken();
    res.json({ 
      success: true, 
      message: 'Successfully retrieved access token',
      tokenLength: token.length
    });
  } catch (error) {
    logger.error('Error testing token', { error: error.message });
    res.status(500).json({ error: 'Failed to get access token: ' + error.message });
  }
});

// Clear tokens (for testing)
router.post('/clear-tokens', async (req, res) => {
  try {
    ebayAPI.accessToken = null;
    ebayAPI.refreshToken = null;
    ebayAPI.tokenExpiry = null;
    
    // Deactivate tokens in database
    await tokens.updateMany({ service: 'ebay', active: true }, { active: false });
    
    res.json({ success: true, message: 'Tokens cleared successfully' });
  } catch (error) {
    logger.error('Error clearing tokens', { error: error.message });
    res.status(500).json({ error: 'Failed to clear tokens: ' + error.message });
  }
});

module.exports = router; 