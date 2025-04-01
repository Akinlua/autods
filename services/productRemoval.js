const ebayAPI = require('../api/ebay');
const autoDSAPI = require('../api/autods');
const logger = require('../utils/logger');
const db = require('../db/database');
const config = require('../config/config');

class ProductRemovalScheduler {
  constructor() {
    this.batchSize = 50; // Process listings in batches
    // Store IDs are now handled in the AutoDS API client
  }
 
  async run() {
    try {
      logger.info('Starting product removal process');
      
      // Get all active eBay listings
      const ebayListings = await ebayAPI.getSellerList();
      logger.info(`Found ${ebayListings.length} active eBay listings`);
      // console.log("ebayListings", ebayListings);
      
      // Get current products from AutoDS to compare
      const storeIds = autoDSAPI.getStoreIds();
      logger.info(`Fetching products from AutoDS for store IDs: ${storeIds}`);
      const autodsProducts = await autoDSAPI.getProducts();
      logger.info(`Found ${autodsProducts.length} products from AutoDS`);
      
      // Create a map of AutoDS product IDs for quick lookup
      const autodsProductMap = new Map();
      autodsProducts.forEach(product => {
        // Store product with its ID along with stock information from variation_statistics
        autodsProductMap.set(product.id.toString(), {
          id: product.id,
          title: product.title,
          inStock: product.variation_statistics?.in_stock?.total || 0,
          status: product.status,
          hasErrors: product.error_list && product.error_list.length > 0
        });
      });
      
      // Process in batches to avoid memory issues with large inventories
      for (let i = 0; i < ebayListings.length; i += this.batchSize) {
        const batch = ebayListings.slice(i, i + this.batchSize);
        await this.processBatch(batch, autodsProductMap);
        
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
  
  async processBatch(listingsBatch, autodsProductMap) {
    for (const listing of listingsBatch) {
      try {
         
        // Skip if no SKU (we use SKU to match with AutoDS ID)
        // console.log("listing", listing.sku);
        if (!listing.sku) {
          logger.warn(`Listing ${listing.inventoryItemId} has no SKU, skipping`);
          continue;
        }
        
        const autodsId = listing.sku;
        
        // Check if product exists in AutoDS
        if (!autodsProductMap.has(autodsId)) {
          // logger.warn(`Product ${autodsId} not found in AutoDS, removing eBay listing ${listing.inventoryItemId}`);
          
          // // End the eBay listing
          // await ebayAPI.endItem(listing.inventoryItemId);
          
          // // Update database record
          // await db.listings.findOneAndUpdate(
          //   { sku: autodsId },
          //   { active: false, endedAt: new Date(), endReason: 'product_not_found' }
          // );
          
          // logger.info(`Successfully removed listing ${listing.inventoryItemId} due to product not found`);
          continue;
        }
        
        // Get product info from map
        const productInfo = autodsProductMap.get(autodsId);
        console.log("productInfo", productInfo);
        
        // Check if out of stock
        // console.log("productInfo", productInfo.inStock);
        if (productInfo.inStock <= 0) {
          logger.info(`Product ${autodsId} is out of stock, removing eBay listing ${listing.sku}`);
          
          // End the eBay listing
          await ebayAPI.endItem(listing.sku);
          
          // Update database record
          await db.listings.findOneAndUpdate(
            { sku: autodsId },
            { active: false, endedAt: new Date(), endReason: 'out_of_stock' }
          );
          
          logger.info(`Successfully removed listing ${listing.sku} due to out of stock`);
          continue;
        }
        
        // Check if product has errors
        // if (productInfo.hasErrors) {
        //   logger.info(`Product ${autodsId} has errors, removing eBay listing ${listing.inventoryItemId}`);
          
        //   // End the eBay listing
        //   await ebayAPI.endItem(listing.inventoryItemId);
          
        //   // Update database record
        //   await db.listings.findOneAndUpdate(
        //     { sku: autodsId },
        //     { active: false, endedAt: new Date(), endReason: 'product_errors' }
        //   );
          
        //   logger.info(`Successfully removed listing ${listing.inventoryItemId} due to product errors`);
        //   continue;
        // }
        
        // If we get here, the product is in stock and has no errors, so keep the listing active
        logger.debug(`Product ${autodsId} has stock (${productInfo.inStock}) and no errors, keeping listing active`);
        
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