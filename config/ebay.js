/**
 * eBay API Configuration
 * In production, these values would be loaded from environment variables
 */

module.exports = {
  // API endpoints
  baseUrl: 'https://api.ebay.com',
  
  // API credentials
  clientId: process.env.EBAY_CLIENT_ID || 'your-ebay-client-id',
  clientSecret: process.env.EBAY_CLIENT_SECRET || 'your-ebay-client-secret',
  ruName: process.env.EBAY_RU_NAME || 'your-ebay-ru-name',
  
  // API scopes
  scopes: [
    'https://api.ebay.com/oauth/api_scope',
    'https://api.ebay.com/oauth/api_scope/sell.inventory',
    'https://api.ebay.com/oauth/api_scope/sell.marketing',
    'https://api.ebay.com/oauth/api_scope/sell.account',
    'https://api.ebay.com/oauth/api_scope/sell.fulfillment'
  ],
  
  // eBay categories
  categories: {
    electronics: '625',
    clothing: '1059',
    collectibles: '1'
  },
  
  // Listing settings
  listingSettings: {
    returnPolicy: {
      returnsAccepted: true,
      returnPeriod: 'DAYS_30',
      returnShippingCostPayer: 'BUYER',
      description: 'If you are not satisfied with your purchase, you can return it within 30 days for a full refund.'
    },
    shippingOptions: [
      {
        name: 'Standard Shipping',
        cost: 4.99,
        days: '3-5 business days'
      },
      {
        name: 'Expedited Shipping',
        cost: 9.99,
        days: '1-2 business days'
      }
    ],
    paymentMethods: ['PAYPAL', 'CREDIT_CARD'],
    defaultCondition: 'NEW'
  }
}; 