// routes/ebay.js - eBay OAuth routes

const express = require('express');
const router = express.Router();
const ebayAPI = require('../api/ebay');
const logger = require('../utils/logger');
const db = require('../db/database');

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

// Policy page - this can be used to meet eBay's requirements for an accessible privacy policy
router.get('/policy', (req, res) => {
  res.send(`
    <html>
      <head>
        <title>Privacy Policy for eBay Integration</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            line-height: 1.6;
            margin: 0;
            padding: 20px;
            color: #333;
          }
          .container {
            max-width: 800px;
            margin: 0 auto;
          }
          h1 {
            color: #4a4a4a;
            border-bottom: 1px solid #eee;
            padding-bottom: 10px;
          }
          h2 {
            color: #5a5a5a;
            margin-top: 30px;
          }
          p {
            margin-bottom: 15px;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>Privacy Policy for eBay Integration</h1>
          
          <p><strong>Last Updated:</strong> ${new Date().toISOString().split('T')[0]}</p>
          
          <h2>Introduction</h2>
          <p>
            This privacy policy describes how we collect, use, and handle your information when you use our eBay integration service.
            We take your privacy seriously and are committed to protecting your personal and business information.
          </p>
          
          <h2>Information We Collect</h2>
          <p>
            When you use our eBay integration, we collect the following types of information:
          </p>
          <ul>
            <li>eBay authorization tokens that allow our service to access your eBay account</li>
            <li>Information about your eBay listings, inventory, and transactions</li>
            <li>Messages between you and buyers on the eBay platform</li>
          </ul>
          
          <h2>How We Use Your Information</h2>
          <p>
            The information we collect is used solely for the purpose of:
          </p>
          <ul>
            <li>Facilitating the management of your eBay listings</li>
            <li>Synchronizing inventory between systems</li>
            <li>Processing orders and automating fulfillment</li>
            <li>Providing analytics and reporting on your eBay business performance</li>
          </ul>
          
          <h2>Data Storage and Security</h2>
          <p>
            Your eBay authorization tokens and related data are stored securely in our database. 
            We implement appropriate security measures to protect your information against unauthorized access.
          </p>
          
          <h2>Third-Party Sharing</h2>
          <p>
            We do not sell, trade, or otherwise transfer your information to outside parties except 
            when necessary to provide the services you've requested.
          </p>
          
          <h2>Your Rights</h2>
          <p>
            You have the right to revoke access to your eBay account at any time through your eBay account settings.
            You can also contact us to request deletion of any stored information related to your account.
          </p>
          
          <h2>Changes to This Policy</h2>
          <p>
            We may update this privacy policy periodically. We will notify you of any changes by posting the new privacy policy on this page.
          </p>
          
          <h2>Contact Us</h2>
          <p>
            If you have any questions about this privacy policy, please contact us.
          </p>
        </div>
      </body>
    </html>
  `);
});

// OAuth callback route for localhost development (store-only)
router.get('/callback/store', async (req, res) => {
  const { code, state, error } = req.query;
  
  if (error) {
    logger.error('Error in eBay OAuth callback/store', { error });
    
    // Return a simple error page
    return res.status(400).send(`
      <html>
        <body>
          <h1>Authorization Failed</h1>
          <p>Error: ${error}</p>
          <p>You can close this window now.</p>
        </body>
      </html>
    `);
  }
  
  if (!code) {
    const noCodeError = new Error('No authorization code received');
    logger.error(noCodeError.message);
    
    // Return a simple error page
    return res.status(400).send(`
      <html>
        <body>
          <h1>Authorization Failed</h1>
          <p>Error: No authorization code received</p>
          <p>You can close this window now.</p>
        </body>
      </html>
    `);
  }
  
  try {
    // Store the code in the database for polling
    await db.authCodes.create({
      service: 'ebay',
      authorizationCode: code,
      state: state,
      processed: false
    });
    
    logger.info('Stored eBay authorization code in database for processing');
    
    // Return a nice success page
    return res.status(200).send(`
      <html>
        <body>
          <h1>Authorization Successful</h1>
          <p>Your eBay account has been connected successfully.</p>
          <p>You can close this window now.</p>
        </body>
      </html>
    `);
  } catch (error) {
    logger.error('Error storing authorization code', { error: error.message });
    
    // Return a simple error page
    return res.status(500).send(`
      <html>
        <body>
          <h1>Authorization Failed</h1>
          <p>Error: ${error.message}</p>
          <p>You can close this window now.</p>
        </body>
      </html>
    `);
  }
});

// OAuth callback route for production (direct processing)
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
    // For production, process the code immediately
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
    const dbToken = await db.tokens.findOne({ service: 'ebay', active: true }).sort({ createdAt: -1 });
    
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
    await db.tokens.updateMany({ service: 'ebay', active: true }, { active: false });
    
    res.json({ success: true, message: 'Tokens cleared successfully' });
  } catch (error) {
    logger.error('Error clearing tokens', { error: error.message });
    res.status(500).json({ error: 'Failed to clear tokens: ' + error.message });
  }
});

module.exports = router; 