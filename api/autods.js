const axios = require('axios');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const db = require('../db/database');
const logger = require('../utils/logger');

// Apply stealth plugin to avoid detection
puppeteer.use(StealthPlugin());

class AutoDSAPI {
  constructor() {
    this.baseUrl = process.env.AUTODS_API_URL || 'https://v2-api.autods.com';
    this.username = process.env.AUTODS_USERNAME;
    this.password = process.env.AUTODS_PASSWORD;
    this.token = null;
    this.tokenExpiry = null;
    // Default store IDs as a comma-separated string
    this.storeIds = process.env.AUTODS_STORE_IDS || '1173617,1197312';
    this.dbInitialized = false;
  }

  async ensureAuthenticated() {
    // Check if token exists and is still valid (with 5-minute buffer)
    const now = new Date();
    if (this.token && this.tokenExpiry && this.tokenExpiry > new Date(now.getTime() + 5 * 60 * 1000)) {
      return this.token;
    }

    // Try to load token from database first
    await this.loadTokenFromDb();
    
    // Check if loaded token is valid
    if (this.token && this.tokenExpiry && this.tokenExpiry > new Date(now.getTime() + 5 * 60 * 1000)) {
      return this.token;
    }

    // Token doesn't exist, is expired, or not in DB, get a new one
    return this.authenticate();
  }

  // Initialize database connection
  async initializeDb() {
    if (!this.dbInitialized) {
      try {
        await db.initDatabase();
        this.dbInitialized = true;
        logger.info('Database connection initialized for AutoDS API');
      } catch (error) {
        logger.warn('Failed to initialize database connection', { error: error.message });
      }
    }
  }

  // Load token from database
  async loadTokenFromDb() {
    await this.initializeDb();
    
    if (!this.dbInitialized) {
      logger.warn('Database not initialized, skipping token loading');
      return false;
    }
    
    try {
      const token = await db.tokens.findOne({ service: 'autods', active: true }).sort({ createdAt: -1 }).lean().exec();
      
      if (token) {
        this.token = token.accessToken;
        this.tokenExpiry = new Date(token.expiresAt).getTime();
        logger.info('Loaded AutoDS token from database');
        return true;
      } else {
        logger.info('No active AutoDS token found in database');
        return false;
      }
    } catch (error) {
      logger.error('Failed to load token from database', { error: error.message });
      return false;
    }
  }

  // Save token to database
  async saveTokenToDb(accessToken, expiresIn) {
    await this.initializeDb();
    
    if (!this.dbInitialized) {
      logger.warn('Database not initialized, token will only be stored in memory');
      return;
    }
    
    try {
      const expiresAt = new Date(Date.now() + expiresIn);
      
      // Deactivate all existing tokens
      await db.tokens.updateMany({ service: 'autods', active: true }, { active: false });
      
      // Create new token document
      await db.tokens.create({
        service: 'autods',
        accessToken,
        expiresAt,
        active: true
      });
      
      logger.info('Saved AutoDS token to database');
    } catch (error) {
      logger.error('Failed to save token to database', { error: error.message });
    }
  }

  async authenticate() {
    try {
      logger.info('Starting browser-based authentication for AutoDS');
      
      if (!this.username || !this.password) {
        throw new Error('AutoDS username or password not configured');
      }
      
      // Launch browser with stealth mode
      const browser = await puppeteer.launch({
        headless: false, // Use the new headless mode
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
      
      const page = await browser.newPage();
      
      // Set up request interception before navigation
      await page.setRequestInterception(true);
      
      // Create a promise that will resolve when we get the token
      const tokenPromise = new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Token capture timed out after 30 seconds'));
        }, 30000);

        page.on('request', async request => {
          const url = request.url();
          // Allow the request to proceed
          await request.continue();
          
          // Capture token from API requests
          if (url.includes('v2-api.autods.com') && request.headers()['authorization']) {
            const authHeader = request.headers()['authorization'];
            if (authHeader && authHeader.startsWith('Bearer ')) {
              const authToken = authHeader.replace('Bearer ', '');
              console.log("authToken captured:", authToken);
              clearTimeout(timeout);
              resolve(authToken);
            }
          }
        });
      });
      
      // Navigate to login page
      await page.goto('https://platform.autods.com/login', { waitUntil: 'networkidle2' });
      
      // Wait for email and password fields to be available
      await page.waitForSelector('input[name="email"]');
      await page.waitForSelector('input[name="password"]');
      
      // Enter login credentials
      await page.type('input[name="email"]', this.username);
      await page.type('input[name="password"]', this.password);
      
      // Click login button and wait for navigation
      await Promise.all([
        page.click('button[type="submit"]'),
        page.waitForNavigation({ waitUntil: 'networkidle2' })
      ]);
      
      // Wait for the token to be captured
      const authToken = await tokenPromise;
      console.log("authToken captured:", authToken);
      if (!authToken) {
        throw new Error('Failed to capture authentication token');
      }
      
      // Close browser immediately after getting token
      await browser.close();
      
      // Set token and expiry
      this.token = authToken;
      this.tokenExpiry = Date.now() + (24 * 60 * 60 * 1000); // 24 hours
      
      // Save token to database
      const expiresIn = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
      await this.saveTokenToDb(authToken, expiresIn);
      
      logger.info('Successfully captured and saved auth token');
      return this.token;
    } catch (error) {
      logger.error('Authentication failed', { error: error.message });
      throw new Error(`Authentication failed: ${error.message}`);
    }
  }

  async getProducts(filters = [], limit = null, offset = 0) {
    try {
      const token = await this.ensureAuthenticated();
      
      // First, get the total count of products
      if (limit === null) {
        const countUrl = `${this.baseUrl}/products/${this.storeIds}/count/`;
        
        const countResponse = await axios({
          method: 'post',
          url: countUrl,
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          data: {
            condition: "or",
            filters,
            product_status: 2
          }
        });
        
        // Extract the total count from the response
        limit = countResponse.data.total_results || 20;
      }
      
      // Now get all products with the total count as the limit
      const url = `${this.baseUrl}/products/${this.storeIds}/list/`;

      const payload = {
        limit,
        offset,
        condition: "or",
        filters,
        order_by: { name: "upload_date", direction: "desc" },
        product_status: 2,
        projection: [
          "id", "title", "main_picture_url", "upload_date", "note", 
          "variation_statistics", "amount_of_variations", "total_sold_count", 
          "last_sold_date", "autods_store_id", "tags", "category", 
          "item_id_on_site", "site_id", "preview_url", "bulk_action_started", 
          "configuration", "file_exchange_update_status", "watchers", 
          "views", "days_left", "status", "system_keyword_violations", 
          "error_list", "catalog_asin", "mutation_status", 
          "dynamic_policy_enabled", "is_updated"
        ]
      };
      
      const response = await axios({
        method: 'post',
        url,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        data: payload
      });
      
      return response.data.results || [];
    } catch (error) {
      // If token has expired, try to re-authenticate once
      if (error.response && error.response.status === 401) {
        this.token = null;
        this.tokenExpiry = null;
        // Try one more time with a fresh token
        return this.getProducts(filters, limit, offset);
      }
      logger.error('Failed to get products from AutoDS', { error: error.response?.data?.message || error.message });
      throw new Error(`Failed to get products from AutoDS: ${error.response?.data?.message || error.message}`);
    }
  }

  async getProductStock(productId) {
    try {
      const token = await this.ensureAuthenticated();
      
      // Use the same list endpoint but with a filter for the specific product ID
      const url = `${this.baseUrl}/products/${this.storeIds}/list/`;

      const payload = {
        condition: "and",
        product_status: 2,
        filters: [
          {
            name: "id",
            value: productId,
            op: "=", 
            value_type: "string"
          }
        ],
        // Focus on variation_statistics which contains stock information
        projection: [
          "id", "variation_statistics", "amount_of_variations",
          "configuration", "status"
        ]
      };
      
      const response = await axios({
        method: 'post',
        url,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        data: payload
      });
      
      // Get the first result since we're filtering for a specific ID
      const results = response.data.results || [];
      if (results.length === 0) {
        throw new Error(`Product with ID ${productId} not found`);
      }
      
      const product = results[0];
      
      // Transform the response to match the expected stock information format
      return {
        productId: product.id,
        status: product.status,
        quantity: product.variation_statistics?.in_stock?.total || 0,
        variations: product.variation_statistics ? [{
          available: product.variation_statistics.in_stock?.total > 0,
          quantity: product.variation_statistics.in_stock?.total || 0,
          inStock: product.variation_statistics.in_stock?.total > 0,
          buyPrice: product.variation_statistics.min_buy_price,
          sellPrice: product.variation_statistics.min_sell_price
        }] : []
      };
    } catch (error) {
      // If token has expired, try to re-authenticate once
      if (error.response && error.response.status === 401) {
        this.token = null;
        this.tokenExpiry = null;
        return this.getProductStock(productId);
      }
      logger.error('Failed to get product stock', { error: error.response?.data?.message || error.message });
      throw new Error(`Failed to get product stock: ${error.response?.data?.message || error.message}`);
    }
  }

  async getProductDetails(productId) {
    try {
      const token = await this.ensureAuthenticated();
      
      // Use the same list endpoint but with a filter for the specific product ID
      const url = `${this.baseUrl}/products/${this.storeIds}/list/`;

      const payload = {
        condition: "and",
        product_status: 2,
        filters: [
          {
            name: "id",
            value: productId,
            op: "=", 
            value_type: "string"
          }
        ]
        // No need to specify projection, we want all available fields
      };
      
      const response = await axios({
        method: 'post',
        url,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        data: payload
      });
      
      // Get the first result since we're filtering for a specific ID
      const results = response.data.results || [];
      if (results.length === 0) {
        throw new Error(`Product with ID ${productId} not found`);
      }
      
      const product = results[0];
      
      return product;
    } catch (error) {
      // If token has expired, try to re-authenticate once
      if (error.response && error.response.status === 401) {
        this.token = null;
        this.tokenExpiry = null;
        return this.getProductDetails(productId);
      }
      logger.error('Failed to get product details', { error: error.response?.data?.message || error.message });
      throw new Error(`Failed to get product details: ${error.response?.data?.message || error.message}`);
    }
  }

  // Force re-authentication
  async forceRefreshToken() {
    this.token = null;
    this.tokenExpiry = null;
    logger.info('Forcing AutoDS re-authentication');
    return this.authenticate();
  }

  // Get the store IDs currently being used
  getStoreIds() {
    return this.storeIds;
  }
  
  // Set different store IDs if needed
  setStoreIds(storeIds) {
    if (typeof storeIds === 'string' && storeIds.trim() !== '') {
      this.storeIds = storeIds;
    } else if (Array.isArray(storeIds) && storeIds.length > 0) {
      this.storeIds = storeIds.join(',');
    } else {
      throw new Error('Store IDs must be a non-empty string or array');
    }
  }
}

module.exports = new AutoDSAPI();