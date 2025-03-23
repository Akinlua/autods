// db/database.js - Database connection and models

const mongoose = require('mongoose');
const logger = require('../utils/logger');

// Connection state tracking
let isConnected = false;

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
    unique: true
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
  service: {
    type: String,
    required: true,
    enum: ['ebay'],
    default: 'ebay'
  },
  accessToken: {
    type: String,
    required: true
  },
  refreshToken: {
    type: String,
    required: true
  },
  expiresAt: {
    type: Date,
    required: true
  },
  scopes: {
    type: [String],
    required: true
  },
  active: {
    type: Boolean,
    default: true
  }
}, { timestamps: true });

const AuthCodeSchema = new mongoose.Schema({
  service: {
    type: String,
    required: true,
    enum: ['ebay'],
    default: 'ebay'
  },
  authorizationCode: {
    type: String,
    required: true
  },
  state: {
    type: String
  },
  processed: {
    type: Boolean,
    default: false
  },
  createdAt: {
    type: Date,
    default: Date.now,
    expires: 3600 // Auto-expire in 1 hour
  }
});

// Create models
const Listing = mongoose.model('Listing', ListingSchema);
const Message = mongoose.model('Message', MessageSchema);
const Token = mongoose.model('Token', TokenSchema);
const AuthCode = mongoose.model('AuthCode', AuthCodeSchema);

// Initialize database
const initDatabase = async () => {
  // If already connected, return early
  if (isConnected) {
    logger.info('Database connection already established');
    return true;
  }
  
  try {
    if (mongoose.connection.readyState === 1) {
      isConnected = true;
      logger.info('Using existing database connection');
      return true;
    }
    
    // Connection options
    const options = {
      serverSelectionTimeoutMS: 5000, // Timeout after 5 seconds
      socketTimeoutMS: 45000, // Close sockets after 45 seconds of inactivity
      // family: 4, // Use IPv4, skip trying IPv6
      // directConnection: true,
      autoIndex: process.env.NODE_ENV !== 'production' // Don't build indexes in production
    };

    // Add credentials if provided
    if (process.env.DB_USER && process.env.DB_PASSWORD) {
      options.user = process.env.DB_USER;
      options.pass = process.env.DB_PASSWORD;
    }
    
    // Connect to MongoDB
    const dbUri = process.env.MONGODB_URI;
    console.log(dbUri);
    await mongoose.connect(dbUri);
    
    isConnected = true;
    logger.info('Database connection established successfully');
    
    // Add connection event listeners
    mongoose.connection.on('error', (err) => {
      logger.error('MongoDB connection error', { error: err.message });
      isConnected = false;
    });
    
    mongoose.connection.on('disconnected', () => {
      logger.warn('MongoDB disconnected');
      isConnected = false;
    });
    
    mongoose.connection.on('reconnected', () => {
      logger.info('MongoDB reconnected');
      isConnected = true;
    });
    
    return true;
  } catch (error) {
    isConnected = false;
    logger.error('Unable to connect to the database:', { error: error.message });
    throw error;
  }
};

// Export database connection and models
module.exports = {
  initDatabase,
  isConnected: () => isConnected,
  listings: Listing,
  messages: Message,
  tokens: Token,
  authCodes: AuthCode
};