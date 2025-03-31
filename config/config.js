// config/config.js - Application configuration

require('dotenv').config();

const config = {
  server: {
    port: process.env.PORT || 3000,
    env: process.env.NODE_ENV || 'development',
    logLevel: process.env.LOG_LEVEL || 'info'
  },
  
  database: {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 27017,
    name: process.env.DB_NAME || 'ebay_autods_integration',
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD
  },
  
  ebay: {
    apiUrl: process.env.EBAY_API_URL,
    clientId: process.env.EBAY_CLIENT_ID,
    clientSecret: process.env.EBAY_CLIENT_SECRET,
    ruName: process.env.EBAY_RU_NAME,
    tokenUrl: process.env.EBAY_TOKEN_URL,
    fulfillmentPolicyId: process.env.EBAY_FULFILLMENT_POLICY_ID,
    paymentPolicyId: process.env.EBAY_PAYMENT_POLICY_ID,
    returnPolicyId: process.env.EBAY_RETURN_POLICY_ID
  },
  
  autods: {
    apiUrl: process.env.AUTODS_API_URL,
    apiKey: process.env.AUTODS_API_KEY
  },
  
  pricing: {
    defaultMarkup: parseFloat(process.env.DEFAULT_MARKUP) || 1.3,
    minimumMargin: parseFloat(process.env.MINIMUM_MARGIN) || 0.2
  },
  
  inventory: {
    minimumStock: parseInt(process.env.MINIMUM_STOCK) || 5,
    maxListingQuantity: parseInt(process.env.MAX_LISTING_QUANTITY) || 10
  },
  
  customerService: {
    responseTimeHours: parseInt(process.env.RESPONSE_TIME_HOURS) || 24,
    escalationKeywords: (process.env.ESCALATION_KEYWORDS || '').split(',')
  },
  
  email: {
    enabled: process.env.EMAIL_ENABLED === 'true',
    host: process.env.EMAIL_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.EMAIL_PORT) || 587,
    secure: process.env.EMAIL_SECURE === 'true',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASSWORD
    },
    from: process.env.EMAIL_FROM || 'noreply@yourdomain.com',
    adminEmails: (process.env.ADMIN_EMAILS || '').split(',')
  },
  
  schedules: {
    listingCron: process.env.LISTING_CRON_SCHEDULE || '0 9 * * *', // Run every day at 9 AM
    removalCron: process.env.REMOVAL_CRON_SCHEDULE || '0 18 * * *', // Run every day at 6 PM
    messageCron: process.env.MESSAGE_CRON_SCHEDULE || '0 * * * *' // Run every hour
  }
};

module.exports = config; 