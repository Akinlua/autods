const axios = require('axios');
const ebayAPI = require('../api/ebay');
const autoDSAPI = require('../api/autods');
const logger = require('../utils/logger');
const db = require('../db/database');
const config = require('../config/config');

class ProductRemovalScheduler {
  constructor() {
    this.lastRun = null;
  }
 
  async run() {
    try {
      logger.info('Starting scheduled product removal process');
      
      // Get the number of products to remove from env or default to 5
      const productsToRemove = process.env.REMOVAL_COUNT ? parseInt(process.env.REMOVAL_COUNT) : 5;
      logger.info(`Will remove ${productsToRemove} products (the last ones added)`);
      
      // Get store ID from configuration
      const storeIds = autoDSAPI.getStoreIds();
      const storeId = storeIds.split(',')[0]; // Using the first store ID
      logger.info(`Using store ID: ${storeId}`);
      
      // Step 1: Get the last added products from database
      const lastAddedProducts = await this.getLastAddedProducts(productsToRemove);
      logger.info(`Found ${lastAddedProducts.length} last added products in database`);
      
      if (lastAddedProducts.length === 0) {
        logger.info('No products found to remove, ending process');
        this.lastRun = new Date();
        return false;
      }
      
      // Step 2: Get all current products from AutoDS
      const autodsProducts = await autoDSAPI.getProducts();
      logger.info(`Found ${autodsProducts.length} products in AutoDS`);
      
      // Step 3: Get all active eBay listings
      const ebayListings = await ebayAPI.getSellerList();
      logger.info(`Found ${ebayListings.length} active eBay listings`);
      
      // Create collections of products to remove
      const productsToProcess = [];
      const autodsProductIds = new Set();
      
      
      // Step 4: Identify products to remove
      for (const product of lastAddedProducts) {
        try {
          // Find matching products in AutoDS
          const autodsMatches = autodsProducts.filter(p => 
            p.id.toString() === product.autodsId || 
            (product.item_id_on_site && p.item_id_on_site === product.item_id_on_site)
          );
          
          // Find matching listings in eBay
          const ebayMatches = ebayListings.filter(listing => 
            listing.sku === product.sku || 
            (product.item_id_on_site && listing.itemId === product.item_id_on_site)
          );

          // for (const ebayListing of ebayMatches) {
          //   try {
          //     await ebayAPI.endItem(ebayListing.itemId);
          //     logger.info(`Successfully ended eBay listing for item ${ebayListing.itemId} - ${ebayListing.title}`);
          //   } catch (ebayError) {
          //     logger.error(`Failed to end eBay listing ${ebayListing.itemId}`, { error: ebayError.message });
          //   }
          // }
          
          logger.info(`Found ${autodsMatches.length} AutoDS matches and ${ebayMatches.length} eBay matches for product ${product.title}`);
          
          // Add to collection for processing
          if (autodsMatches.length > 0) {
            autodsProductIds.add(autodsMatches[0].id);
            productsToProcess.push({
              dbProduct: product,
              autodsMatches,
              ebayMatches
            });
          }
        } catch (error) {
          logger.error(`Error identifying product ${product.title} for removal`, { error: error.message });
          continue;
        }
      }
      
      // Step 5: Remove products from AutoDS (which will also remove from eBay marketplaces)
      if (autodsProductIds.size > 0) {
        const productIdsArray = Array.from(autodsProductIds);
        logger.info(`Removing ${productIdsArray.length} products from AutoDS and marketplaces: ${productIdsArray.join(', ')}`);
        
        try {
          await this.removeAutodsProduct(storeId, productIdsArray);
          logger.info(`Successfully sent bulk removal request for ${productIdsArray.length} products`);
          
          // Step 6: Update database records for all processed products
          for (const item of productsToProcess) {
            await db.listings.findByIdAndUpdate(
              item.dbProduct._id,
              { 
                active: false, 
                endedAt: new Date(), 
                endReason: 'scheduled_removal'
              }
            );
            logger.info(`Updated database record for product ${item.dbProduct.title}`);
          }
        } catch (error) {
          logger.error(`Failed to perform bulk removal`, { error: error.message });
        }
      } else {
        logger.info('No matching products found in AutoDS to remove');
      }
      
      // Update the last run time
      this.lastRun = new Date();
      
      logger.info('Product removal process completed');
      return true;
    } catch (error) {
      logger.error('Error in product removal scheduler', { error: error.message });
      this.lastRun = new Date();
      throw error;
    }
  }
  
  async getLastAddedProducts(count) {
    try {
      // Get the last 'count' products that were added to the database
      const products = await db.listings.find({ active: true })
        .sort({ listedAt: -1 })
        .limit(count)
        .lean();
      
      return products;
    } catch (error) {
      logger.error('Error getting last added products', { error: error.message });
      return [];
    }
  }
  
  async removeAutodsProduct(storeId, productIds) {
    try {
      const token = await autoDSAPI.ensureAuthenticated();
      
      const url = `https://v2-api.autods.com/products/${storeId}/bulk`;
      
      const payload = {
        "condition": "and",
        "filters": [
          {
            "name": "id",
            "value_list": Array.isArray(productIds) ? productIds : [productIds],
            "op": "in",
            "value_type": "list"
          }
        ],
        "remove_from_marketplace": true,
        "product_status": 2
      };
      
      const response = await axios({
        method: 'delete',
        url,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        data: payload
      });
      
      if (response.status === 200) {
        logger.info(`Bulk removal request sent successfully to AutoDS. Products will be removed from both AutoDS and marketplace.`);
        return true;
      } else {
        throw new Error(`Failed to remove products from AutoDS: ${response.statusText}`);
      }
    } catch (error) {
      logger.error(`Failed to remove products from AutoDS`, { error: error.message });
      throw error;
    }
  }
}

const productRemovalScheduler = new ProductRemovalScheduler();
module.exports = { productRemovalScheduler };