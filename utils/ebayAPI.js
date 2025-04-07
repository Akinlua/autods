/**
 * eBay API Utility Module
 * 
 * Handles API operations for eBay integration including:
 * - Authentication
 * - Listing creation and management
 * - Order processing
 * - Messaging
 */

const axios = require('axios');
const config = require('../config/ebay');

class EbayAPI {
  constructor() {
    this.baseUrl = config.baseUrl;
    this.clientId = config.clientId;
    this.clientSecret = config.clientSecret;
    this.accessToken = null;
    this.tokenExpiry = null;
  }

  /**
   * Get access token for eBay API calls
   * @returns {Promise<string>} Access token
   */
  async getAccessToken() {
    // Check if token exists and is not expired
    if (this.accessToken && this.tokenExpiry > Date.now()) {
      return this.accessToken;
    }

    try {
      const authString = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');
      const response = await axios({
        method: 'post',
        url: `${this.baseUrl}/identity/v1/oauth2/token`,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${authString}`
        },
        data: 'grant_type=client_credentials&scope=https://api.ebay.com/oauth/api_scope'
      });

      this.accessToken = response.data.access_token;
      this.tokenExpiry = Date.now() + (response.data.expires_in * 1000);
      return this.accessToken;
    } catch (error) {
      console.error('Error getting eBay access token:', error.message);
      throw new Error('Failed to authenticate with eBay API');
    }
  }

  /**
   * Create an API request with authentication
   * @param {string} method - HTTP method
   * @param {string} endpoint - API endpoint
   * @param {Object} data - Request payload
   * @returns {Promise} API response
   */
  async makeRequest(method, endpoint, data = null) {
    try {
      const token = await this.getAccessToken();
      const response = await axios({
        method,
        url: `${this.baseUrl}${endpoint}`,
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        data: method !== 'get' ? data : null,
        params: method === 'get' ? data : null
      });
      return response.data;
    } catch (error) {
      console.error(`eBay API ${method} request failed:`, error.message);
      throw error;
    }
  }

  /**
   * Get all active listings for the authenticated user
   * @param {Object} filters - Optional filters
   * @returns {Promise<Array>} List of listings
   */
  async getListings(filters = {}) {
    // This is a mock implementation - in a real app, this would call the eBay API
    return this.makeRequest('get', '/sell/inventory/v1/inventory_item', filters);
  }

  /**
   * Create a new listing on eBay
   * @param {Object} listingData - Listing details
   * @returns {Promise<Object>} Created listing
   */
  async createListing(listingData) {
    return this.makeRequest('post', '/sell/inventory/v1/inventory_item', listingData);
  }

  /**
   * Update an existing listing
   * @param {string} listingId - eBay listing ID
   * @param {Object} listingData - Updated listing details
   * @returns {Promise<Object>} Updated listing
   */
  async updateListing(listingId, listingData) {
    return this.makeRequest('put', `/sell/inventory/v1/inventory_item/${listingId}`, listingData);
  }

  /**
   * Delete a listing
   * @param {string} listingId - eBay listing ID
   * @returns {Promise<Object>} Deletion result
   */
  async deleteListing(listingId) {
    return this.makeRequest('delete', `/sell/inventory/v1/inventory_item/${listingId}`);
  }

  /**
   * Get orders
   * @param {Object} filters - Order filters
   * @returns {Promise<Array>} List of orders
   */
  async getOrders(filters = {}) {
    return this.makeRequest('get', '/sell/fulfillment/v1/order', filters);
  }

  /**
   * Get order details
   * @param {string} orderId - eBay order ID
   * @returns {Promise<Object>} Order details
   */
  async getOrderDetails(orderId) {
    return this.makeRequest('get', `/sell/fulfillment/v1/order/${orderId}`);
  }

  /**
   * Update order status (e.g., mark as shipped)
   * @param {string} orderId - eBay order ID
   * @param {Object} updateData - Status update data
   * @returns {Promise<Object>} Update result
   */
  async updateOrderStatus(orderId, updateData) {
    return this.makeRequest('post', `/sell/fulfillment/v1/order/${orderId}/shipping_fulfillment`, updateData);
  }

  /**
   * Get messages from eBay
   * @param {Object} filters - Message filters
   * @returns {Promise<Array>} List of messages
   */
  async getMessages(filters = {}) {
    return this.makeRequest('get', '/sell/messaging/v1/message_summary', filters);
  }

  /**
   * Get specific message details
   * @param {string} messageId - eBay message ID
   * @returns {Promise<Object>} Message details
   */
  async getMessageDetails(messageId) {
    return this.makeRequest('get', `/sell/messaging/v1/message/${messageId}`);
  }

  /**
   * Send a message to a buyer
   * @param {Object} messageData - Message data
   * @returns {Promise<Object>} Sent message
   */
  async sendMessage(messageData) {
    return this.makeRequest('post', '/sell/messaging/v1/message', messageData);
  }

  /**
   * Get account data including limits and features
   * @returns {Promise<Object>} Account information
   */
  async getAccountInfo() {
    return this.makeRequest('get', '/sell/account/v1/privilege');
  }

  /**
   * Get metrics and analytics
   * @param {Object} filters - Time range and other filters
   * @returns {Promise<Object>} Metrics data
   */
  async getMetrics(filters = {}) {
    return this.makeRequest('get', '/sell/analytics/v1/seller_standards_profile', filters);
  }

  /**
   * Mock function to get sample data for development
   * This would be removed in production
   */
  getMockListings(count = 10) {
    const listings = [];
    const statuses = ['active', 'inactive', 'ended', 'draft'];
    
    for (let i = 1; i <= count; i++) {
      listings.push({
        id: `item_${i}`,
        itemId: `M${Math.floor(100000000 + Math.random() * 900000000)}`,
        sku: `SKU-${Math.floor(1000 + Math.random() * 9000)}`,
        title: `Test Product ${i} - Brand New Item with Amazing Features`,
        description: `This is a description for test product ${i}. It includes all the amazing features.`,
        price: parseFloat((10 + Math.random() * 90).toFixed(2)),
        quantity: Math.floor(1 + Math.random() * 50),
        sold: Math.floor(Math.random() * 20),
        status: statuses[Math.floor(Math.random() * statuses.length)],
        image: `https://via.placeholder.com/150?text=Product+${i}`,
        createdAt: new Date(Date.now() - Math.floor(Math.random() * 90) * 24 * 60 * 60 * 1000)
      });
    }
    
    return listings;
  }

  getMockMessages(count = 5) {
    const messages = [];
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;
    
    const conversations = [
      {
        id: 'conv_1',
        name: 'John Smith',
        avatar: 'https://via.placeholder.com/40?text=JS',
        online: true,
        unread: true,
        lastSeen: '2 hours ago',
        lastMessage: 'I have a question about the delivery time.',
        lastMessageTime: '2 hours ago',
        typingStatus: true,
        messages: [
          {
            id: 'msg_1_1',
            text: 'Hi there! I just purchased your product and was wondering about the delivery time.',
            timestamp: now - 2 * day,
            isMe: false,
            status: 'read'
          },
          {
            id: 'msg_1_2',
            text: 'Hello! Thank you for your purchase. The delivery should take 3-5 business days.',
            timestamp: now - 2 * day + 1 * 60 * 60 * 1000,
            isMe: true,
            status: 'read'
          },
          {
            id: 'msg_1_3',
            text: 'Great! That works for me. Thanks for the quick response.',
            timestamp: now - 2 * day + 2 * 60 * 60 * 1000,
            isMe: false,
            status: 'read'
          },
          {
            id: 'msg_1_4',
            text: 'Actually, I have one more question about the product. Does it come with a warranty?',
            timestamp: now - 2 * 60 * 60 * 1000,
            isMe: false,
            status: 'read'
          }
        ]
      },
      {
        id: 'conv_2',
        name: 'Jane Doe',
        avatar: 'https://via.placeholder.com/40?text=JD',
        online: false,
        unread: false,
        lastSeen: 'yesterday',
        lastMessage: 'Thanks for the information.',
        lastMessageTime: 'yesterday',
        typingStatus: false,
        messages: [
          {
            id: 'msg_2_1',
            text: 'Hello, I received my order but one item is missing.',
            timestamp: now - 3 * day,
            isMe: false,
            status: 'read'
          },
          {
            id: 'msg_2_2',
            text: "I'm sorry to hear that. Can you please provide your order number so I can investigate?",
            timestamp: now - 3 * day + 30 * 60 * 1000,
            isMe: true,
            status: 'read'
          },
          {
            id: 'msg_2_3',
            text: 'Sure, it\'s ORDER-12345.',
            timestamp: now - 3 * day + 45 * 60 * 1000,
            isMe: false,
            status: 'read'
          },
          {
            id: 'msg_2_4',
            text: 'Thank you. I\'ve checked and the missing item will be shipped tomorrow. Sorry for the inconvenience.',
            timestamp: now - 3 * day + 60 * 60 * 1000,
            isMe: true,
            status: 'read'
          },
          {
            id: 'msg_2_5',
            text: 'Thanks for the information.',
            timestamp: now - 1 * day,
            isMe: false,
            status: 'read'
          }
        ]
      }
    ];
    
    // Add some random conversations
    for (let i = 3; i <= count; i++) {
      const isOnline = Math.random() > 0.5;
      const isUnread = Math.random() > 0.7;
      const lastMessageTime = Math.floor(Math.random() * 7) + 1;
      const timeUnit = Math.random() > 0.5 ? 'days' : 'hours';
      
      conversations.push({
        id: `conv_${i}`,
        name: `User ${i}`,
        avatar: `https://via.placeholder.com/40?text=U${i}`,
        online: isOnline,
        unread: isUnread,
        lastSeen: isOnline ? 'online' : `${lastMessageTime} ${timeUnit} ago`,
        lastMessage: `This is the last message in conversation ${i}.`,
        lastMessageTime: `${lastMessageTime} ${timeUnit} ago`,
        typingStatus: false,
        messages: []
      });
    }
    
    return conversations;
  }

  getMockDashboardData() {
    return {
      stats: {
        activeListings: Math.floor(20 + Math.random() * 80),
        monthlyRevenue: Math.floor(5000 + Math.random() * 15000),
        orders: Math.floor(10 + Math.random() * 90),
        pendingMessages: Math.floor(1 + Math.random() * 10)
      },
      chartData: {
        labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul'],
        sales: [2500, 3200, 2800, 4100, 3600, 4800, 5200]
      },
      activities: [
        {
          date: '2 hours ago',
          icon: 'fas fa-shopping-cart text-primary',
          message: 'New order received - Order #12345'
        },
        {
          date: '4 hours ago',
          icon: 'fas fa-comment text-success',
          message: 'You have a new message from John Doe'
        },
        {
          date: 'Today, 9:30 AM',
          icon: 'fas fa-tag text-info',
          message: 'Your listing "Wireless Headphones" has been published'
        },
        {
          date: 'Yesterday',
          icon: 'fas fa-dollar-sign text-success',
          message: 'Payment received for Order #12340'
        },
        {
          date: 'Yesterday',
          icon: 'fas fa-truck text-warning',
          message: 'Order #12338 has been shipped'
        },
        {
          date: '3 days ago',
          icon: 'fas fa-check-circle text-success',
          message: 'New seller level achieved: Top Rated Seller'
        }
      ],
      topItems: [
        {
          id: 'item_1',
          title: 'Wireless Bluetooth Headphones',
          image: 'https://via.placeholder.com/50?text=Headphones',
          sold: 32,
          revenue: 2560,
          profit: 896,
          status: 'Active'
        },
        {
          id: 'item_2',
          title: 'Smartphone Power Bank 20000mAh',
          image: 'https://via.placeholder.com/50?text=PowerBank',
          sold: 28,
          revenue: 1120,
          profit: 560,
          status: 'Active'
        },
        {
          id: 'item_3',
          title: 'Smart Watch with Heart Rate Monitor',
          image: 'https://via.placeholder.com/50?text=Watch',
          sold: 24,
          revenue: 1680,
          profit: 720,
          status: 'Active'
        },
        {
          id: 'item_4',
          title: 'HD Webcam with Microphone',
          image: 'https://via.placeholder.com/50?text=Webcam',
          sold: 20,
          revenue: 1000,
          profit: 400,
          status: 'Low Stock'
        },
        {
          id: 'item_5',
          title: 'Mechanical Gaming Keyboard',
          image: 'https://via.placeholder.com/50?text=Keyboard',
          sold: 18,
          revenue: 1350,
          profit: 540,
          status: 'Active'
        }
      ]
    };
  }
}

module.exports = new EbayAPI(); 