// db/database.js - Database connection and models

const mongoose = require('mongoose');
const logger = require('../utils/logger');

// Connection state tracking
let isConnected = false;
let connectionPromise = null;

// Configure mongoose
mongoose.set('strictQuery', false);

// Define schemas
const ListingSchema = new mongoose.Schema({
  autodsId: {
    type: String,
    required: true
  },
  ebayListingId: {
    type: String,
    required: true,
    // unique: true
  },
  item_id_on_site: {
    type: String,
    sparse: true
  },
  sku: {
    type: String,
    required: true
  },
  title: {
    type: String,
    required: true
  },
  price: {
    type: mongoose.Schema.Types.Decimal128,
    required: true
  },
  cost: {
    type: mongoose.Schema.Types.Decimal128,
    required: true
  },
  stock: {
    type: Number,
    required: true,
    default: 0
  },
  active: {
    type: Boolean,
    required: true,
    default: true
  },
  listedAt: {
    type: Date,
    required: true
  },
  endedAt: {
    type: Date
  },
  endReason: {
    type: String
  }
}, { timestamps: true });

const MessageSchema = new mongoose.Schema({
  messageId: {
    type: String,
    required: true,
    unique: true
  },
  buyerUsername: {
    type: String,
    required: true
  },
  subject: {
    type: String,
    required: true
  },
  content: {
    type: String,
    required: true
  },
  receivedAt: {
    type: Date,
    required: true
  },
  responded: {
    type: Boolean,
    required: true,
    default: false
  },
  respondedAt: {
    type: Date
  },
  response: {
    type: String
  },
  escalated: {
    type: Boolean,
    required: true,
    default: false
  },
  escalatedAt: {
    type: Date
  },
  escalationReason: {
    type: String
  },
  resolved: {
    type: Boolean,
    required: true,
    default: false
  },
  resolvedAt: {
    type: Date
  }
}, { timestamps: true });

const TokenSchema = new mongoose.Schema({
  service: { type: String, required: true },
  accessToken: { type: String, required: true },
  refreshToken: { type: String },
  expiresAt: { type: Date, required: true },
  scopes: { type: [String], default: [] },
  active: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now }
});

const AuthCodeSchema = new mongoose.Schema({
  service: { type: String, required: true },
  authorizationCode: { type: String, required: true },
  state: { type: String },
  processed: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

// Create models
const Listing = mongoose.model('Listing', ListingSchema);
const Message = mongoose.model('Message', MessageSchema);
const Tokens = mongoose.model('Token', TokenSchema);
const AuthCodes = mongoose.model('AuthCode', AuthCodeSchema);

// Initialize database
const initDatabase = async () => {
  try {
    // If already connected or connecting, return the existing promise
    if (isConnected) {
      return;
    }
    
    if (connectionPromise) {
      return connectionPromise;
    }
    
    // Set up connection with retry logic
    connectionPromise = connectWithRetry();
    await connectionPromise;
    
    return;
  } catch (error) {
    logger.error('Failed to initialize database', { error: error.message });
    connectionPromise = null;
    throw error;
  }
};

// Connect with retry logic
async function connectWithRetry(retries = 5, interval = 5000) {
  try {
    const uri = process.env.MONGODB_URI;
    
    if (!uri) {
      throw new Error('MONGODB_URI environment variable is not set');
    }
    
    // Connect to MongoDB
    await mongoose.connect(uri, {
      // useNewUrlParser: true,
      // useUnifiedTopology: true,
    });
    
    // Initialize models if they don't exist
    if (!Tokens) {
      Tokens = mongoose.model('Token', TokenSchema);
    }
    
    if (!AuthCodes) {
      AuthCodes = mongoose.model('AuthCode', AuthCodeSchema);
    }
    
    // Set connection status
    isConnected = true;
    connectionPromise = null;
    
    logger.info('Successfully connected to database');
    
    // Add connection error handler
    mongoose.connection.on('error', (err) => {
      logger.error('MongoDB connection error', { error: err.message });
      isConnected = false;
    });
    
    // Add disconnection handler
    mongoose.connection.on('disconnected', () => {
      logger.warn('MongoDB disconnected, attempting to reconnect');
      isConnected = false;
      // Attempt to reconnect in the background
      setTimeout(() => {
        connectWithRetry().catch(error => {
          logger.error('Failed to reconnect to database', { error: error.message });
        });
      }, 5000);
    });
    
    return;
  } catch (error) {
    logger.error(`Database connection attempt failed (retries left: ${retries})`, { error: error.message });
    
    if (retries > 0) {
      // Wait and retry
      await new Promise(resolve => setTimeout(resolve, interval));
      return connectWithRetry(retries - 1, interval);
    }
    
    // Reset state
    connectionPromise = null;
    throw error;
  }
}

// Safe database operations with error handling
async function safeDBOperation(operation, fallback = null) {
  try {
    if (!isConnected) {
      await initDatabase();
    }
    return await operation();
  } catch (error) {
    logger.error('Database operation failed', { error: error.message });
    return fallback;
  }
}

// Export database connection and models
module.exports = {
  initDatabase,
  isConnected: () => isConnected,
  listings: Listing,
  messages: Message,
  tokens: Tokens ? Tokens : { 
    findOne: async (...args) => safeDBOperation(async () => Tokens.findOne(...args)),
    create: async (...args) => safeDBOperation(async () => Tokens.create(...args)),
    updateMany: async (...args) => safeDBOperation(async () => Tokens.updateMany(...args)),
    deleteMany: async (...args) => safeDBOperation(async () => Tokens.deleteMany(...args))
  },
  authCodes: AuthCodes ? AuthCodes : {
    findOne: async (...args) => safeDBOperation(async () => AuthCodes.findOne(...args)),
    create: async (...args) => safeDBOperation(async () => AuthCodes.create(...args)),
    updateOne: async (...args) => safeDBOperation(async () => AuthCodes.updateOne(...args)),
    deleteMany: async (...args) => safeDBOperation(async () => AuthCodes.deleteMany(...args))
  }
};