require('dotenv').config();
const { initDatabase } = require('./db/database');
const logger = require('./utils/logger');

const initApp = async () => {
  try {
    // Initialize database
    await initDatabase();
    
    // Start the application
    require('./app');
    
    logger.info('Application initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize application', { error: error.message });
    process.exit(1);
  }
};

// Run initialization
initApp();