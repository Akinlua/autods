const ebayAPI = require('../api/ebay');
const autoDSAPI = require('../api/autods');
const logger = require('../utils/logger');
const db = require('../db/database');
const config = require('../config/config');

class ProductRemovalScheduler {
  constructor() {
    this.batchSize = 50; // Process listings in batches
  }
 
  async run() {
    try {
      logger.info('Starting product removal process');
      
      // Get all active eBay listings
      const ebayListings = await ebayAPI.getSellerList();
      logger.info(`Found ${ebayListings.length} active eBay listings`);
      
      // Process in batches to avoid memory issues with large inventories
      for (let i = 0; i < ebayListings.length; i += this.batchSize) {
        const batch = ebayListings.slice(i, i + this.batchSize);
        await this.processBatch(batch);
        
        // Small delay between batches to avoid API rate limits
        if (i + this.batchSize < ebayListings.length) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
      
      logger.info('Product removal process completed');
      return true;
    } catch (error) {
      logger.error('Error in product removal scheduler', { error: error.message });
      throw error;
    }
  }
  
  async processBatch(listingsBatch) {
    for (const listing of listingsBatch) {
      try {
        // Skip if no SKU (we use SKU to match with AutoDS ID)
        if (!listing.sku) {
          logger.warn(`Listing ${listing.inventoryItemId} has no SKU, skipping`);
          continue;
        }
        
        // Get product stock from AutoDS
        const autodsId = listing.sku;
        let stockInfo;
        
        try {
          stockInfo = await autoDSAPI.getProductStock(autodsId);
        } catch (error) {
          // If product not found in AutoDS or other error, consider removing it
          logger.warn(`Product ${autodsId} not found in AutoDS or error occurred: ${error.message}`);
          stockInfo = { quantity: 0 };
        }
        
        // Check if out of stock
        if (stockInfo.quantity <= 0) {
          logger.info(`Product ${autodsId} is out of stock, removing eBay listing ${listing.inventoryItemId}`);
          
          // End the eBay listing
          await ebayAPI.endItem(listing.inventoryItemId);
          
          // Update database record
          await db.listings.findOneAndUpdate(
            { sku: autodsId },
            { active: false, endedAt: new Date(), endReason: 'out_of_stock' }
          );
          
          logger.info(`Successfully removed listing ${listing.inventoryItemId}`);
        } else {
          logger.debug(`Product ${autodsId} has stock (${stockInfo.quantity}), keeping listing active`);
        }
        
        // Small delay between each listing check to avoid API rate limits
        await new Promise(resolve => setTimeout(resolve, 500));
        
      } catch (error) {
        logger.error(`Error processing listing ${listing.inventoryItemId}`, { error: error.message });
        continue; // Continue with next listing
      }
    }
  }
}

const productRemovalScheduler = new ProductRemovalScheduler();
module.exports = { productRemovalScheduler };