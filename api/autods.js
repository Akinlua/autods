const axios = require('axios');

class AutoDSAPI {
  constructor() {
    this.baseUrl = process.env.AUTODS_API_URL || 'https://v2-api.autods.com';
    this.username = process.env.AUTODS_USERNAME;
    this.password = process.env.AUTODS_PASSWORD;
    this.token = null;
    this.tokenExpiry = null;
    // Default store IDs as a comma-separated string
    this.storeIds = process.env.AUTODS_STORE_IDS || '1173617,1197312';
  }

  async ensureAuthenticated() {
    // Check if token exists and is still valid (with 5-minute buffer)
    const now = new Date();
    if (this.token && this.tokenExpiry && this.tokenExpiry > new Date(now.getTime() + 5 * 60 * 1000)) {
      return this.token;
    }

    // Token doesn't exist or is expired, get a new one
    return this.authenticate();
  }

  async authenticate() {
    try {
      const response = await axios({
        method: 'post',
        url: `${this.baseUrl}/login`,
        headers: {
          'Content-Type': 'application/json'
        },
        data: {
          username: this.username,
          password: this.password
        }
      });

      // Extract token and set expiry (assuming token is valid for 24 hours if not specified)
      this.token = response.data.token;
      
      // Set token expiry time (adjust this based on actual API response)
      const expiresIn = response.data.expiresIn || 24 * 60 * 60 * 1000; // Default: 24 hours in milliseconds
      this.tokenExpiry = new Date(new Date().getTime() + expiresIn);
      
      return this.token;
    } catch (error) {
      throw new Error(`Authentication failed: ${error.response?.data?.message || error.message}`);
    }
  }

  async getProducts(filters = [], limit = 20, offset = 0) {
    try {
      const token = await this.ensureAuthenticated();
      
      // Always use the store IDs from the constructor
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
        return this.getProducts(filters, limit, offset);
      }
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
        return this.getProductStock(productId);
      }
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
      
      // // Add a description field if it doesn't exist (will be populated from elsewhere if needed)
      // if (!product.description) {
      //   product.description = product.title;
      // }
      
      // // Ensure we have image URLs array in a standard format
      // product.images = product.images || [];
      // if (product.main_picture_url && product.main_picture_url.url) {
      //   // Add the main picture to the images array if it's not already there
      //   if (!product.images.some(img => img.url === product.main_picture_url.url)) {
      //     product.images.unshift({
      //       url: product.main_picture_url.url,
      //       image_id: product.main_picture_url.image_id
      //     });
      //   }
      // }
      
      // // Extract brand from tags if possible (since the API doesn't seem to have a specific brand field)
      // // Set default brand if none found
      // product.brand = product.active_buy_item.brand || "Unbranded";
      
      return product;
    } catch (error) {
      // If token has expired, try to re-authenticate once
      if (error.response && error.response.status === 401) {
        this.token = null;
        return this.getProductDetails(productId);
      }
      throw new Error(`Failed to get product details: ${error.response?.data?.message || error.message}`);
    }
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