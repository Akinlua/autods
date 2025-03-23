
const axios = require('axios');

class AutoDSAPI {
  constructor() {
    this.baseUrl = process.env.AUTODS_API_URL;
    this.apiKey = process.env.AUTODS_API_KEY;
  }

  async getProducts() {
    try {
      const response = await axios({
        method: 'get',
        url: `${this.baseUrl}/products`,
        headers: {
          'Content-Type': 'application/json',
          'X-API-KEY': this.apiKey
        }
      });
      
      return response.data.products || [];
    } catch (error) {
      throw new Error(`Failed to get products from AutoDS: ${error.response?.data?.message || error.message}`);
    }
  }

  async getProductStock(productId) {
    try {
      const response = await axios({
        method: 'get',
        url: `${this.baseUrl}/products/${productId}/stock`,
        headers: {
          'Content-Type': 'application/json',
          'X-API-KEY': this.apiKey
        }
      });
      
      return response.data;
    } catch (error) {
      throw new Error(`Failed to get product stock: ${error.response?.data?.message || error.message}`);
    }
  }

  async getProductDetails(productId) {
    try {
      const response = await axios({
        method: 'get',
        url: `${this.baseUrl}/products/${productId}`,
        headers: {
          'Content-Type': 'application/json',
          'X-API-KEY': this.apiKey
        }
      });
      
      return response.data;
    } catch (error) {
      throw new Error(`Failed to get product details: ${error.response?.data?.message || error.message}`);
    }
  }
}

module.exports = new AutoDSAPI();