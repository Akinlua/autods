// api/ebay.js - eBay API client

const axios = require('axios');
const crypto = require('crypto');
const { exec } = require('child_process');
const db = require('../db/database');
const logger = require('../utils/logger');

// Cross-platform function to open URL in browser
function openBrowser(url) {
  const platform = process.platform;
  
  return new Promise((resolve, reject) => {
    let command;
    
    if (platform === 'win32') {
      // On Windows, we need to wrap the URL in quotes to handle special characters
      command = `start "" "${url}"`;
    } else if (platform === 'darwin') {
      command = `open "${url}"`;
    } else {
      command = `xdg-open "${url}"`;
    }
    
    exec(command, (error) => {
      if (error) {
        logger.error(`Failed to open browser: ${error.message}`);
        reject(error);
      } else {
        resolve();
      }
    });
  });
}

// Define the required scopes for the application
const DEFAULT_SCOPES = [
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

class EbayAPI {
  constructor()  {
    this.baseUrl = process.env.EBAY_API_URL;
    this.clientId = process.env.EBAY_CLIENT_ID;
    this.clientSecret = process.env.EBAY_CLIENT_SECRET;
    this.ruName = process.env.EBAY_RU_NAME;
    this.tokenUrl = process.env.EBAY_TOKEN_URL;
    this.authUrl = process.env.EBAY_AUTH_URL || 'https://auth.sandbox.ebay.com/oauth2/authorize';
    this.accessToken = null;
    this.refreshToken = null;
    this.tokenExpiry = null;
    this.scopes = DEFAULT_SCOPES;
    this.authorizationInProgress = false;
    this.tokenCallbacks = [];
    this.dbInitialized = false;
    this.loadTokens= false;
    this.pollingInterval = null;
    this.currentAuthState = null;
    
    // Initialize by loading tokens from database - don't await in constructor
    this.initializeTokens();
  }

  // Initialize and load tokens
  async initializeTokens() {
    try {
      // Check if DB is connected first
      if (!db.isConnected()) {
        try {
          await db.initDatabase();
          this.dbInitialized = true;
        } catch (dbError) {
          logger.warn('Database connection not available, tokens will not be persisted', { error: dbError.message });
          return;
        }
      } else {
        this.dbInitialized = true;
      }
      
      // Now load tokens
      await this.loadTokensFromDb();
    } catch (error) {
      logger.error('Error during token initialization', { error: error.message });
    }
  }

  // Load tokens from database
  async loadTokensFromDb() {
    if (!this.dbInitialized) {
      logger.warn('Database not initialized, skipping token loading');
      return;
    }
    
    try {
      const token = await db.tokens.findOne({ service: 'ebay', active: true }).sort({ createdAt: -1 }).lean().exec();
      // console.log(token);
      if (token) {
        this.accessToken = token.accessToken;
        this.refreshToken = token.refreshToken;
        this.tokenExpiry = new Date(token.expiresAt).getTime();
        this.scopes = token.scopes;
        this.loadTokens = true;
        logger.info('Loaded eBay tokens from database');
      } else {
        logger.info('No active eBay tokens found in database');
      }
    } catch (error) {
      logger.error('Failed to load tokens from database', { error: error.message });
    }
  }

  // Save tokens to database
  async saveTokensToDb(accessToken, refreshToken, expiresIn, scopes) {
    if (!this.dbInitialized) {
      try {
        await db.initDatabase();
        this.dbInitialized = true;
      } catch (dbError) {
        logger.warn('Database connection not available, tokens will be stored in-memory only', { error: dbError.message });
        // Keep tokens in memory even if we can't save to DB
        this.accessToken = accessToken;
        this.refreshToken = refreshToken;
        this.tokenExpiry = Date.now() + (expiresIn * 1000) - 300000; // 5 min buffer
        this.scopes = scopes;
        return;
      }
    }
    
    try {
      const expiresAt = new Date(Date.now() + (expiresIn * 1000));
      
      // Deactivate all existing tokens
      await db.tokens.updateMany({ service: 'ebay', active: true }, { active: false });
      
      // Create new token document
      await db.tokens.create({
        service: 'ebay',
        accessToken,
        refreshToken,
        expiresAt,
        scopes,
        active: true
      });
      
      logger.info('Saved eBay tokens to database');
    } catch (error) {
      logger.error('Failed to save tokens to database, using in-memory tokens only', { error: error.message });
      // Ensure we keep the tokens in memory even if DB save fails
      this.accessToken = accessToken;
      this.refreshToken = refreshToken;
      this.tokenExpiry = Date.now() + (expiresIn * 1000) - 300000; // 5 min buffer
      this.scopes = scopes;
    }
  }

  // Start polling for authorization codes in development mode
  startPollingForAuthCodes() {
    if (this.pollingInterval) {
      // Already polling
      return;
    }
    
    logger.info('Starting to poll for eBay authorization codes every 15 seconds');
    
    this.pollingInterval = setInterval(async () => {
      try {
        if (!this.dbInitialized) {
          return; // Skip if DB not initialized
        }
        
        // Find unprocessed auth codes, sorted by creation time (oldest first)
        const authCode = await db.authCodes.findOne({ 
          service: 'ebay',
          processed: false,
          state: this.currentAuthState // Match the state for security
        }).sort({ createdAt: 1 }).lean().exec();
        
        if (authCode) {
          logger.info('Found authorization code in database, processing...');
          
          // Mark as processed immediately to prevent duplicate processing
          await db.authCodes.updateOne(
            { _id: authCode._id },
            { processed: true }
          );
          
          // Process the code
          try {
            await this.exchangeCodeForToken(authCode.authorizationCode);
            logger.info('Successfully processed authorization code from database');
          } catch (error) {
            logger.error('Failed to process authorization code from database', { error: error.message });
          }
        }
      } catch (error) {
        logger.error('Error polling for authorization codes', { error: error.message });
        // Continue polling despite errors
      }
    }, 15000); // Poll every 15 seconds
  }
  
  // Stop polling for authorization codes
  stopPollingForAuthCodes() {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
      logger.info('Stopped polling for eBay authorization codes');
    }
  }

  // Function to trigger authorization flow
  async triggerAuthorizationFlow() {
    if (this.authorizationInProgress) {
      // If authorization is already in progress, wait for it to complete
      return this.waitForTokenAuthentication();
    }
    
    this.authorizationInProgress = true;
    
    // Generate a state for this authorization request
    this.currentAuthState = crypto.randomBytes(16).toString('hex');
    const authUrl = this.getAuthorizationUrl(this.scopes, this.currentAuthState);
    
    try {
      // For local development, open the browser and start polling
      if (process.env.NODE_ENV === 'development') {
        logger.info(`Opening browser for eBay authorization at: ${authUrl}`);
        
        // Start polling for auth codes
        this.startPollingForAuthCodes();
        
        try {
          await openBrowser(authUrl);
        } catch (err) {
          logger.warn(`Failed to automatically open browser. Please visit: ${authUrl}`);
          console.log(`Please visit this URL to authorize the application: ${authUrl}`);
        }
      } else {
        // For production, log the URL
        logger.info(`eBay authorization required. Please visit: ${authUrl}`);
        console.log(`eBay authorization required. Please visit: ${authUrl}`);
        // Here you could also implement email notification
      }
      
      // Wait for user to complete authorization
      return this.waitForTokenAuthentication();
    } catch (error) {
      this.authorizationInProgress = false;
      this.stopPollingForAuthCodes();
      throw error;
    }
  }

  // Called by the callback route when authorization is completed
  authorizationCompleted(error = null) {
    // Stop polling as we've completed authorization
    this.stopPollingForAuthCodes();
    
    if (error) {
      // Reject all pending promises
      this.tokenCallbacks.forEach(callback => callback.reject(error));
    } else {
      // Resolve all pending promises
      this.tokenCallbacks.forEach(callback => callback.resolve(this.accessToken));
    }
    
    // Clear the callback queue and reset flag
    this.tokenCallbacks = [];
    this.authorizationInProgress = false;
    this.currentAuthState = null;
  }

  // Generate the consent URL for the user to authorize the application
  getAuthorizationUrl(scopes = DEFAULT_SCOPES, state = null) {
    this.scopes = scopes;
    const scopeString = Array.isArray(scopes) ? scopes.join(' ') : scopes;
    
    // Use provided state or generate a new one
    const authState = state || crypto.randomBytes(16).toString('hex');
    
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.ruName,
      response_type: 'code',
      scope: scopeString,
      state: authState
    });

    return `${this.authUrl}?${params.toString()}`;
  }

  // Helper function to create a promise that resolves when authorization is completed
  waitForTokenAuthentication() {
    return new Promise((resolve, reject) => {
      // Add the callback to the queue
      this.tokenCallbacks.push({ resolve, reject });
      
      // If we're the first one waiting, set a timeout
      if (this.tokenCallbacks.length === 1) {
        setTimeout(() => {
          // If we still don't have a token after 5 minutes, reject all pending promises
          if (this.authorizationInProgress) {
            const error = new Error('Authorization timed out after 5 minutes');
            this.tokenCallbacks.forEach(callback => callback.reject(error));
            this.tokenCallbacks = [];
            this.authorizationInProgress = false;
          }
        }, 5 * 60 * 1000); // 5 minutes timeout
      }
    });
  }

  // Exchange authorization code for access and refresh tokens
  async exchangeCodeForToken(code) {
    try {
      const response = await axios({
        method: 'post',
        url: this.tokenUrl,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64')}`
        },
        data: `grant_type=authorization_code&code=${code}&redirect_uri=${this.ruName}`
      });

      this.accessToken = response.data.access_token;
      this.refreshToken = response.data.refresh_token;
      this.tokenExpiry = Date.now() + (response.data.expires_in * 1000) - 300000; // 5 min buffer
      
      // Save tokens to database
      try {
        await this.saveTokensToDb(
          this.accessToken, 
          this.refreshToken, 
          response.data.expires_in,
          this.scopes
        );
      } catch (dbError) {
        logger.error('Error saving tokens to database', { error: dbError.message });
        // Continue even if db save fails - we have tokens in memory
      }
      
      // Notify any waiting processes
      this.authorizationCompleted();
      
      return {
        accessToken: this.accessToken,
        refreshToken: this.refreshToken,
        expiresIn: response.data.expires_in
      };
    } catch (error) {
      // Notify any waiting processes of the error
      this.authorizationCompleted(error);
      
      logger.error('Error exchanging code for token:', { 
        error: error.message,
        response: error.response?.data
      });
      throw new Error(`Failed to exchange authorization code: ${error.message}`);
    }
  }

  // Refresh an expired access token using refresh token
  async refreshAccessToken() {
    if (!this.refreshToken) {
      throw new Error('No refresh token available. User needs to re-authorize the application.');
    }

    try {
      const scopeString = Array.isArray(this.scopes) ? this.scopes.join(' ') : this.scopes;
      console.log("scopeString");
      
      const response = await axios({
        method: 'post',
        url: this.tokenUrl,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64')}`
        },
        data: `grant_type=refresh_token&refresh_token=${this.refreshToken}&scope=${encodeURIComponent(scopeString)}`
      });

      this.accessToken = response.data.access_token;
      this.tokenExpiry = Date.now() + (response.data.expires_in * 1000) - 300000; // 5 min buffer
      
      // Save the updated access token to database
      await this.saveTokensToDb(
        this.accessToken, 
        this.refreshToken, 
        response.data.expires_in,
        this.scopes
      );
      
      return this.accessToken;
    } catch (error) {
      console.error('Error refreshing token:', error.response?.data || error.message);
      
      // If refresh token is invalid, clear it
      this.refreshToken = null;
      
      // If we get token expired or invalid error, trigger the authorization flow
      if (error.response?.status === 400 || error.response?.status === 401) {
        logger.warn('Refresh token invalid or expired, triggering new authorization flow');
        return this.triggerAuthorizationFlow();
      }
      
      throw new Error(`Failed to refresh access token: ${error.message}`);
    }
  }

  async getAccessToken() {
    try {
      // Check if token exists and is not expired
      if (this.accessToken && this.tokenExpiry > Date.now()) {
        return this.accessToken;
      }
  
      // Try connecting to DB if not initialized yet
      if (!this.loadTokens) {
        try {
          console.log("getacces")
          await this.initializeTokens();
        } catch (error) {
          logger.warn('Failed to initialize database connection, proceeding with in-memory tokens only');
        }
      }
  
      // If we have a refresh token, try to refresh the access token
      if (this.refreshToken) {
        try {
          return await this.refreshAccessToken();
        } catch (error) {
          logger.error('Failed to refresh token', { error: error.message });
          // If refresh fails, continue to authorization flow
        }
      }
  
      // If we don't have tokens or refresh failed, trigger authorization flow
      console.log("triggerAuthorizationFlow");
      return this.triggerAuthorizationFlow();
    } catch (error) {
      logger.error('Unexpected error in getAccessToken', { error: error.message, stack: error.stack });
      throw new Error(`Failed to get access token: ${error.message}`);
    }
  }

  // Set tokens manually (e.g., when loading from database)
  setTokens(accessToken, refreshToken, expiryTime, scopes = this.scopes) {
    this.accessToken = accessToken;
    this.refreshToken = refreshToken;
    this.tokenExpiry = expiryTime;
    this.scopes = scopes;
  }

  async addItem(itemData) {
    const token = await this.getAccessToken();
    
    try {
      const response = await axios({
        method: 'post',
        url: `${this.baseUrl}/sell/inventory/v1/offer`,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        data: itemData
      });
      
      return response.data;
    } catch (error) {
      throw new Error(`Failed to add item: ${error.response?.data?.errors?.[0]?.message || error.message}`);
    }
  }

  async getSellerList() {
    const token = await this.getAccessToken();
    
    try {
      const response = await axios({
        method: 'get',
        url: `${this.baseUrl}/sell/inventory/v1/inventory_item`,
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      return response.data.inventoryItems || [];
    } catch (error) {
      console.log(error.response?.data || error);
      throw new Error(`Failed to get seller listings: ${error.response?.data?.errors?.[0]?.message || error.message}`);
    }
  }

  async endItem(listingId) {
    const token = await this.getAccessToken();
    
    try {
      const response = await axios({
        method: 'delete',
        url: `${this.baseUrl}/sell/inventory/v1/inventory_item/${listingId}`,
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      return true;
    } catch (error) {
      throw new Error(`Failed to end listing ${listingId}: ${error.response?.data?.errors?.[0]?.message || error.message}`);
    }
  }

  async getMessages(timeFrom) {
    const token = await this.getAccessToken();
    
    try {
      const response = await axios({
        method: 'get',
        url: `${this.baseUrl}/sell/messaging/v1/member_message`,
        headers: {
          'Authorization': `Bearer ${token}`
        },
        params: {
          creation_date_range_from: timeFrom.toISOString(),
          limit: 100
        }
      });
      
      return response.data.messages || [];
    } catch (error) {
      throw new Error(`Failed to get messages: ${error.response?.data?.errors?.[0]?.message || error.message}`);
    }
  }

  async replyToMessage(messageId, content) {
    const token = await this.getAccessToken();
    
    try {
      const response = await axios({
        method: 'post',
        url: `${this.baseUrl}/sell/messaging/v1/member_message/${messageId}/reply`,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        data: {
          responseText: content
        }
      });
      
      return response.data;
    } catch (error) {
      throw new Error(`Failed to reply to message ${messageId}: ${error.response?.data?.errors?.[0]?.message || error.message}`);
    }
  }
}

module.exports = new EbayAPI();

// api/autods.js - AutoDS API client
