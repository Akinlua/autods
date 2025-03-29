require('dotenv').config();
const { productListingScheduler } = require('../services/productListing');
const { productRemovalScheduler } = require('../services/productRemoval');
const logger = require('../utils/logger');

async function runServiceDemo() {
  try {
    // Demo both services
    logger.info('=== Starting Product Listing Demo ===');
    await productListingScheduler.run();
    
    logger.info('\n=== Starting Product Removal Demo ===');
    await productRemovalScheduler.run();
    
    logger.info('\n=== Service Demo Completed Successfully ===');
  } catch (error) {
    logger.error('Error in service demo:', error);
  }
}

// Run the demo if executed directly
if (require.main === module) {
  runServiceDemo();
}

module.exports = { runServiceDemo }; 