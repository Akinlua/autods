// api/ebay.js - eBay API client

const axios = require('axios');
const crypto = require('crypto');
const { exec } = require('child_process');
const db = require('../db/database');
const logger = require('../utils/logger');
const xml2js = require('xml2js');

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

// Helper function to escape XML special characters
function escapeXml(unsafe) {
  if (!unsafe) return '';
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
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

  // Add a new method for automated authentication
  async automatedAuthFlow() {
    logger.info('Starting automated eBay authentication with Puppeteer');
    
    // Start polling for auth codes
    this.startPollingForAuthCodes();
    
    // Launch browser with stealth mode
    const puppeteer = require('puppeteer-extra');
    const StealthPlugin = require('puppeteer-extra-plugin-stealth');
    puppeteer.use(StealthPlugin());
    
    const browser = await puppeteer.launch({
      headless: process.env.NODE_ENV === 'development' ? false : 'new', // Use false in development, 'new' otherwise
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    try {
      const page = await browser.newPage();
      
      // Navigate to the authorization URL
      const authUrl = this.getAuthorizationUrl(this.scopes, this.currentAuthState);
      logger.info(`Navigating to authorization URL: ${authUrl}`);
      await page.goto(authUrl, { waitUntil: 'networkidle2' });
      
      // Wait for username field (first page) and enter username
      await page.waitForSelector('input#userid');
      await page.type('input#userid', process.env.EBAY_USERNAME);
      
      // Click Continue button
      await Promise.all([
        page.click('button#signin-continue-btn'),
        // page.waitForNavigation({ waitUntil: 'networkidle2' })
      ]);
      console.log("username");
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Wait for password field (second page) and enter password
      await page.waitForSelector('input#pass');
      console.log("password");
      await page.type('input#pass', process.env.EBAY_PASSWORD);
      console.log("password typed");

      // Wait a moment for any animations to complete
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Find and click the sign in button
      try {
        const signInButton = await page.waitForSelector('button#sgnBt', { visible: true, timeout: 10000 });
        if (signInButton) {
          await signInButton.click();
          console.log("Sign in button clicked");
          await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(err => {
            logger.warn('Navigation after sign-in timed out, continuing anyway', { error: err.message });
          });
        }
      } catch (error) {
        logger.warn('Could not find sign in button, attempting to continue', { error: error.message });
        // Try an alternative approach - sometimes the button has a different ID
        try {
          const altSignInButton = await page.$('button[type="submit"]');
          if (altSignInButton) {
            await altSignInButton.click();
            console.log("Alternative sign in button clicked");
            await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(err => {
              logger.warn('Navigation after sign-in timed out, continuing anyway', { error: err.message });
            });
          }
        } catch (altError) {
          logger.warn('Could not find alternative sign in button', { error: altError.message });
        }
      }
      
      // Check if there's an "Agree and Continue" button that might appear
      const redirectUrl = process.env.EBAY_RU_NAME_URL || 'https://autods.onrender.com/';
      
      try {
        // Wait for the agree button with a short timeout
        const agreeButton = await page.waitForSelector('button[name="agree"]', { timeout: 5000 });
        if (agreeButton) {
          await Promise.all([
            agreeButton.click(),
            page.waitForNavigation({ waitUntil: 'networkidle2' })
          ]);
        }
      } catch (error) {
        // Button wasn't found, which is fine if we're already at redirect URL
        logger.info('No agree button found, continuing with authentication flow');
      }
      
      // Check if we've been redirected to our callback URL
      const currentUrl = page.url();
      logger.info(`Current URL after authentication: ${currentUrl}`);
      
      if (currentUrl.includes(redirectUrl) || currentUrl.includes('code=')) {
        logger.info('Successfully redirected to callback URL');
        
        // Extract the authorization code from the URL
        const urlObj = new URL(currentUrl);
        const code = urlObj.searchParams.get('code');
        const state = urlObj.searchParams.get('state');
        
        if (code) {
          // Process the authorization code directly
          try {
            await this.exchangeCodeForToken(code);
            logger.info('Authorization code processed successfully');
          } catch (tokenError) {
            logger.error('Error processing authorization code', { error: tokenError.message });
            throw tokenError;
          }
        } else {
          logger.warn('No authorization code found in redirect URL');
        }
      } else {
        logger.warn(`Unexpected redirect URL: ${currentUrl}`);
      }
    } catch (error) {
      logger.error('Error during automated authentication', { error: error.message });
      throw error;
    } finally {
      // Always close the browser
      await browser.close();
    }
  }

  // Modify the existing triggerAuthorizationFlow method to use the automated approach first
  async triggerAuthorizationFlow() {
    if (this.authorizationInProgress) {
      // If authorization is already in progress, wait for it to complete
      return this.waitForTokenAuthentication();
    }
    
    this.authorizationInProgress = true;
    
    // Generate a state for this authorization request
    this.currentAuthState = crypto.randomBytes(16).toString('hex');
    
    try {
      // Try the automated flow first if credentials are available
      if (process.env.EBAY_USERNAME && process.env.EBAY_PASSWORD) {
        try {
          await this.automatedAuthFlow();
        } catch (error) {
          logger.warn('Automated authentication failed, falling back to manual flow', { error: error.message });
          // Fall back to the original method if automated fails
          await this.fallbackAuthFlow();
        }
      } else {
        // Fall back to the original method if credentials are missing
        logger.info('eBay credentials not found, using manual authentication flow');
        await this.fallbackAuthFlow();
      }
      
      // Wait for user to complete authorization
      return this.waitForTokenAuthentication();
    } catch (error) {
      this.authorizationInProgress = false;
      this.stopPollingForAuthCodes();
      throw error;
    }
  }

  // Rename the existing method to be the fallback
  async fallbackAuthFlow() {
    const authUrl = this.getAuthorizationUrl(this.scopes, this.currentAuthState);
    
    // Start polling for auth codes
    this.startPollingForAuthCodes();
    
    // For local development, open the browser
    if (process.env.NODE_ENV === 'development') {
      logger.info(`Opening browser for eBay authorization at: ${authUrl}`);
      
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

  async addItem(itemData, marketplaceId = 'EBAY_US') {
    const token = await this.getAccessToken();
    
    // Declare variables outside try block to make them available in catch block
    let inventoryItem = {};
    let inventoryItemKey = '';
    let merchantLocationKey = '';
    
    try {
      // Make sure we have a merchantLocationKey
      merchantLocationKey = itemData.merchantLocationKey || await this.getOrCreateMerchantLocationKey();
      console.log("merchantLocationKey", merchantLocationKey);
      // Use the provided SKU or generate one
      inventoryItemKey = itemData.sku || `item-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      
      // Prepare inventory item data
      inventoryItem = {
        availability: {
          shipToLocationAvailability: {
            quantity: itemData.availability?.shipToLocationAvailability?.quantity || 1
          },
          merchantLocationKey: merchantLocationKey
        },
        condition: itemData.condition || 'NEW',
        product: {
          title: itemData.product?.title?.substring(0, 79) || 'Item Title',
          description: itemData.product?.description || 'Item Description',
          aspects: itemData.product?.aspects || {},
          imageUrls: itemData.product?.imageUrls || []
        },
        locale: 'en-US',
        packageWeightAndSize: {
          weight: {
            value: itemData.packageWeightAndSize?.weight?.value || "1",
            unit: itemData.packageWeightAndSize?.weight?.unit || "POUND"
          }
        }
      };
      
      // Add country - this is required
      if (!inventoryItem.product) {
        inventoryItem.product = {};
      }
      inventoryItem.product.mpn = itemData.product?.mpn || `MPN-${Date.now()}`;
      inventoryItem.product.brand = itemData.product?.brand || 'Generic';
      inventoryItem.product.epid = itemData.product?.epid;
      inventoryItem.product.upc = itemData.product?.upc;
      inventoryItem.product.ean = itemData.product?.ean;
      inventoryItem.product.isbn = itemData.product?.isbn;
      
      // Set the country field that's causing the error
      inventoryItem.product.aspects = inventoryItem.product.aspects || {};
      
      // Ensure Country/Region of Manufacture is always set and is an array of strings
      inventoryItem.product.aspects["Country/Region of Manufacture"] = 
        (itemData.product?.aspects?.["Country/Region of Manufacture"] || 
         itemData.country || 
         ["United States"]);
        
      // Make sure it's an array
      if (!Array.isArray(inventoryItem.product.aspects["Country/Region of Manufacture"])) {
        inventoryItem.product.aspects["Country/Region of Manufacture"] = 
          [inventoryItem.product.aspects["Country/Region of Manufacture"]];
      }

      // For debugging
      console.log("Country data set to:", JSON.stringify(inventoryItem.product.aspects["Country/Region of Manufacture"]));
      
      // Create inventory item
      logger.info(`Creating inventory item with key: ${inventoryItemKey}`);
      const inventoryItemResponse = await axios({
        method: 'put',
        url: `${this.baseUrl}/sell/inventory/v1/inventory_item/${inventoryItemKey}`,
        headers: {
          'Content-Type': 'application/json',
          'Content-Language': 'en-US',
          'Authorization': `Bearer ${token}`
        },
        data: inventoryItem
      });
      console.log("inventoryItemResponse");
      // Now create an offer for this inventory item
      const offerData = {
        sku: inventoryItemKey,
        marketplaceId: marketplaceId,
        format: "FIXED_PRICE",
        availableQuantity: itemData.availability?.shipToLocationAvailability?.quantity || 1,
        categoryId: itemData.categoryId || "9355",
        listingDescription: itemData.product?.description || "Item Description",
        merchantLocationKey: merchantLocationKey,  // Use the merchant location key
        pricingSummary: {
          price: {
            currency: itemData.pricingSummary?.price?.currency || "USD",
            value: itemData.pricingSummary?.price?.value || "9.99"
          }
        },
        // shippingOptions: [  // Manually specifying shipping
        //     {
        //         costType: "FLAT_RATE",
        //         shippingServices: [
        //             {
        //                 shippingServiceType: "DOMESTIC",
        //                 shippingServiceName: "USPS First Class",
        //                 shippingCost: {
        //                     value: "5.00",
        //                     currency: "USD"
        //                 }
        //             }
        //         ]
        //     }
        // ],
        // paymentPolicy: {  // Manually specifying payment
        //     immediatePay: "REQUIRED",
        //     paymentMethods: [
        //         {
        //             paymentMethodType: "CREDIT_CARD"
        //         }
        //     ]
        // },
        // returnPolicy: {  // Manually specifying returns
        //     returnsAccepted: true,
        //     returnPeriod: {
        //         value: "30",
        //         unit: "DAY"
        //     },
        //     refundMethod: "MONEY_BACK",
        //     returnShippingCostPayer: "BUYER"
        // }
      };
      
      // Add listing policies if provided
      if (itemData.listingPolicies?.fulfillmentPolicyId && 
          itemData.listingPolicies?.paymentPolicyId && 
          itemData.listingPolicies?.returnPolicyId) {
        offerData.listingPolicies = {
          fulfillmentPolicyId: itemData.listingPolicies.fulfillmentPolicyId,
          paymentPolicyId: itemData.listingPolicies.paymentPolicyId,
          returnPolicyId: itemData.listingPolicies.returnPolicyId
        };
      } else {
        try {
          // We need to get account policies first if not provided
          const accountPolicies = await this.getAccountPolicies(marketplaceId);
          console.log("accountPolicies", accountPolicies);
          
          offerData.listingPolicies = {
            fulfillmentPolicyId: accountPolicies.fulfillmentPolicyId,
            paymentPolicyId: accountPolicies.paymentPolicyId,
            returnPolicyId: accountPolicies.returnPolicyId
          };
        } catch (policyError) {
          // Log the error but continue without policies if they can't be retrieved
          logger.warn('Failed to get account policies', { error: policyError.message });
          console.log('Failed to get account policies:', policyError.message);
        }
      }
      
      if (offerData.listingPolicies) {
        console.log("offerData.listingPolicies:", JSON.stringify(offerData.listingPolicies));
      } else {
        console.log("No listing policies set for offer");
      }
      
      // Create offer
      const offerResponse = await axios({
        method: 'post',
        url: `${this.baseUrl}/sell/inventory/v1/offer`,
        headers: {
          'Content-Type': 'application/json',
          'Content-Language': 'en-US',
          'Authorization': `Bearer ${token}`
        },
        data: offerData
      });
      
      // Get the offer ID
      const offerId = offerResponse.data.offerId;
      console.log("offerId", offerId);
      
      // Publish the offer to get the listing ID
      const publishResponse = await axios({
        method: 'post',
        url: `${this.baseUrl}/sell/inventory/v1/offer/${offerId}/publish`,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });
      
      // Extract the eBay listing ID from the response
      const ebayListingId = publishResponse.data.listingId;
      logger.info(`Ebay listing ID: ${ebayListingId}`);
      
      return {
        success: true,
        inventoryItemKey,
        offerId,
        ebayListingId,
        ...publishResponse.data
      };
    } catch (error) {
      // Capture complete error details
      // const errorDetails = {
      //   message: error.message,
      //   responseData: error.response?.data,
      //   statusCode: error.response?.status,
      //   inventoryItem: inventoryItem,
      //   inventoryItemKey: inventoryItemKey,
      //   merchantLocationKey: merchantLocationKey,
      //   stack: error.stack
      // };
      
      // // Log comprehensive error information
      // logger.error('Error adding eBay item', errorDetails);
      
      // console.log("Error adding item to eBay:");
      // console.log("Error message:", error.message);
      // console.log("Status code:", error.response?.status);
      
      // if (error.response?.data?.errors) {
      //   console.log("Error details:", JSON.stringify(error.response.data.errors, null, 2));
      // }
      
      throw new Error(`Failed to add item: ${error.response?.data?.errors?.[0]?.message || error.message}`);
    }
  }

  async getAccountPolicies(marketplaceId) {
    const token = await this.getAccessToken();
    
    try {
      // Get fulfillment policies
      const fulfillmentResponse = await axios({
        method: 'get',
        url: `${this.baseUrl}/sell/account/v1/fulfillment_policy`,
        headers: {
          'Authorization': `Bearer ${token}`
        },
        params: {
          marketplace_id: marketplaceId
        }
      });
      
      // Get payment policies
      const paymentResponse = await axios({
        method: 'get',
        url: `${this.baseUrl}/sell/account/v1/payment_policy`,
        headers: {
          'Authorization': `Bearer ${token}`
        },
        params: {
          marketplace_id: marketplaceId
        }
      });
      
      // Get return policies
      const returnResponse = await axios({
        method: 'get',
        url: `${this.baseUrl}/sell/account/v1/return_policy`,
        headers: {
          'Authorization': `Bearer ${token}`
        },
        params: {
          marketplace_id: marketplaceId
        }
      });
      
      // Get the first policy of each type (default)
      const fulfillmentPolicyId = fulfillmentResponse.data.fulfillmentPolicies[0]?.fulfillmentPolicyId;
      const paymentPolicyId = paymentResponse.data.paymentPolicies[0]?.paymentPolicyId;
      const returnPolicyId = returnResponse.data.returnPolicies[0]?.returnPolicyId;
      
      if (!fulfillmentPolicyId || !paymentPolicyId || !returnPolicyId) {
        throw new Error('Could not find all required policies for eBay account');
      }
      
      return {
        fulfillmentPolicyId,
        paymentPolicyId,
        returnPolicyId
      };
    } catch (error) {
      logger.error('Error getting account policies', { error: error.message });
      throw new Error(`Failed to get account policies: ${error.response?.data?.errors?.[0]?.message || error.message}`);
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
      console.log("response", response);
      
      return true;
    } catch (error) {
      throw new Error(`Failed to end listing ${listingId}: ${error.response?.data?.errors?.[0]?.message || error.message}`);
    }
  }

  async getMessages(timeFrom) {
    const token = await this.getAccessToken();
    
    try {
      // Create XML request for GetMyMessages
      const xmlRequest = `
        <?xml version="1.0" encoding="utf-8"?>
        <GetMyMessagesRequest xmlns="urn:ebay:apis:eBLBaseComponents">
          <RequesterCredentials>
            <eBayAuthToken>${token}</eBayAuthToken>
          </RequesterCredentials>
          <DetailLevel>ReturnMessages</DetailLevel>
          <StartTime>${timeFrom.toISOString()}</StartTime>
        </GetMyMessagesRequest>
      `;

      const response = await axios({
        method: 'post',
        url: process.env.EBAY_TRADING_API_URL || 'https://api.ebay.com/ws/api.dll',
        headers: {
          'Content-Type': 'text/xml',
          'X-EBAY-API-CALL-NAME': 'GetMyMessages',
          'X-EBAY-API-SITEID': '0',
          'X-EBAY-API-COMPATIBILITY-LEVEL': '1191', // Check documentation for current level
          'X-EBAY-API-IAF-TOKEN': token
        },
        data: xmlRequest
      });
      
      // Parse XML response
      const parser = new xml2js.Parser({ explicitArray: false });
      const result = await parser.parseStringPromise(response.data);
      
      logger.info('Successfully retrieved eBay messages');
      
      // Extract messages from response
      const messages = [];
      if (result.GetMyMessagesResponse.Messages && result.GetMyMessagesResponse.Messages.Message) {
        const apiMessages = Array.isArray(result.GetMyMessagesResponse.Messages.Message) 
          ? result.GetMyMessagesResponse.Messages.Message 
          : [result.GetMyMessagesResponse.Messages.Message];
        
        apiMessages.forEach(message => {
          messages.push({
            messageId: message.MessageID,
            sender: message.Sender,
            subject: message.Subject,
            text: message.Text,
            creationDate: new Date(message.ReceiveDate),
            read: message.Read === 'true',
            itemId: message.ItemID
          });
        });
      }
      
      return messages;
    } catch (error) {
      logger.error('Error getting eBay messages', { error: error.message });
      throw new Error(`Failed to get messages: ${error.message}`);
    }
  }

  async replyToMessage(messageId, content) {
    const token = await this.getAccessToken();
    
    try {
      // Create XML request for AddMemberMessageAAQToPartner
      const xmlRequest = `
        <?xml version="1.0" encoding="utf-8"?>
        <AddMemberMessageAAQToPartnerRequest xmlns="urn:ebay:apis:eBLBaseComponents">
          <RequesterCredentials>
            <eBayAuthToken>${token}</eBayAuthToken>
          </RequesterCredentials>
          <ItemID>${escapeXml(messageId)}</ItemID>
          <MemberMessage>
            <Subject>Response to your inquiry</Subject>
            <Body>${escapeXml(content)}</Body>
            <QuestionType>General</QuestionType>
          </MemberMessage>
        </AddMemberMessageAAQToPartnerRequest>
      `;

      const response = await axios({
        method: 'post',
        url: process.env.EBAY_TRADING_API_URL || 'https://api.ebay.com/ws/api.dll',
        headers: {
          'Content-Type': 'text/xml',
          'X-EBAY-API-CALL-NAME': 'AddMemberMessageAAQToPartner',
          'X-EBAY-API-SITEID': '0',
          'X-EBAY-API-COMPATIBILITY-LEVEL': '1191',
          'X-EBAY-API-IAF-TOKEN': token
        },
        data: xmlRequest
      });
      
      // Parse XML response
      const parser = new xml2js.Parser({ explicitArray: false });
      const result = await parser.parseStringPromise(response.data);
      
      if (result.AddMemberMessageAAQToPartnerResponse.Ack === 'Success' || 
          result.AddMemberMessageAAQToPartnerResponse.Ack === 'Warning') {
        logger.info(`Successfully replied to message ${messageId}`);
        return { success: true };
      } else {
        throw new Error(result.AddMemberMessageAAQToPartnerResponse.Errors.ShortMessage);
      }
    } catch (error) {
      logger.error(`Error replying to message ${messageId}`, { error: error.message });
      throw new Error(`Failed to reply to message ${messageId}: ${error.message}`);
    }
  }

  async getOrCreateMerchantLocationKey() {
    const token = await this.getAccessToken();
    
    try {
      // First check if we already have a location key
      const existingLocations = await axios({
        method: 'get',
        url: `${this.baseUrl}/sell/inventory/v1/location`,
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      console.log("existingLocations", existingLocations.data);
      
      // If we have at least one location, use the first one
      if (existingLocations.data.locations && existingLocations.data.locations.length > 0) {
        return existingLocations.data.locations[0].merchantLocationKey;
      }
      
      // No locations found, create one
      const locationKey = `WAREHOUSE-001`;
      
      // Create a new merchant location
      await axios({
        method: 'post',
        url: `${this.baseUrl}/sell/inventory/v1/location/${locationKey}`,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        data: {
          location: {
            address: {
              addressLine1: "123 Main St",
              addressLine2: "Suite 100",
              city: "San Jose",
              stateOrProvince: "CA",
              postalCode: "95131",
              country: "US",
              county: "Santa Clara"
            }
          },
          locationInstructions: "Default warehouse location for inventory items. Access through main entrance.",
          name: "Main Warehouse", 
          phone: "555-123-4567",
          merchantLocationStatus: "ENABLED",
          locationTypes: ["WAREHOUSE"],
          // operatingHours: [
          //   {
          //     dayOfWeekEnum: "MONDAY",
          //     intervals: [
          //       {
          //         open: "09:00",
          //         close: "18:00"
          //       }
          //     ]
          //   },
          //   {
          //     dayOfWeekEnum: "TUESDAY",
          //     intervals: [
          //       {
          //         open: "09:00",
          //         close: "18:00"
          //       }
          //     ]
          //   },
          //   {
          //     dayOfWeekEnum: "WEDNESDAY",
          //     intervals: [
          //       {
          //         open: "09:00",
          //         close: "18:00"
          //       }
          //     ]
          //   },
          //   {
          //     dayOfWeekEnum: "THURSDAY",
          //     intervals: [
          //       {
          //         open: "09:00",
          //         close: "18:00"
          //       }
          //     ]
          //   },
          //   {
          //     dayOfWeekEnum: "FRIDAY",
          //     intervals: [
          //       {
          //         open: "09:00",
          //         close: "18:00"
          //       }
          //     ]
          //   }
          // ],
          // specialHours: []
        }
      });
      
      return locationKey;
    } catch (error) {
      console.log("error", error.response?.data);
      logger.error('Error getting or creating merchant location key', { error: error.message });
      // If we can't create a location, use a default value and hope it exists
      return "WAREHOUSE-1";
    }
  }
}

module.exports = new EbayAPI();

// api/autods.js - AutoDS API client
