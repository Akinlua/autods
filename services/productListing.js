// services/productListing.js - Product listing service

const axios = require('axios');
const ebayAPI = require('../api/ebay');
const autoDSAPI = require('../api/autods');
const logger = require('../utils/logger');
const db = require('../db/database');
const config = require('../config/config');

class ProductListingScheduler {
  constructor() {
    this.markup = config.pricing.defaultMarkup || 1.3; // 30% markup by default
    this.stockThreshold = config.inventory.minimumStock || 1;
    this.lastRun = null;
    // Store IDs are handled in the AutoDS API client
  }

  async run() {
    try {
      logger.info('Starting product listing process from AutoDS marketplace to products tab');
      
      // Get store ID and supplier_filter from configuration
      const storeIds = autoDSAPI.getStoreIds();
      const storeId = storeIds.split(',')[0]; // Using the first store ID
      logger.info(`Using store ID: ${storeId}`);
      

        // Get existing eBay listings to avoid duplicates
        const existingListings = await ebayAPI.getSellerList();
        // console.log(existingListings);
        logger.info(`Found ${existingListings.length} existing eBay listings`);
        const existingSkus = existingListings.map(listing => listing.sku);






      // Get max number of products to import from env or default to 10
      const productsToImport = process.env.MAX_LISTING_QUANTITY ? parseInt(process.env.MAX_LISTING_QUANTITY) : 10;
      logger.info(`Will import ${productsToImport} products`);
      
      // Determine the supplier filter from env or default to empty
      let supplier_filter = [];
      if (process.env.SUPPLIER_FILTER === 'amazon') {
        supplier_filter = [{ name: "site_name", value_type: "list", op: "in", value: "amazon" }];
        logger.info('Using Amazon as supplier filter');
      } else if (process.env.SUPPLIER_FILTER === 'private_suppliers') {
        supplier_filter = [{ name: "site_name", value_type: "list", op: "in", value: "private_suppliers" }];
        logger.info('Using Private Suppliers as supplier filter');
      } else {
        logger.info('No supplier filter specified, will use all suppliers');
      }
      
      // Step 1: Get filtered products from marketplace
      const filteredProducts = await this.getFilteredProducts(storeId, supplier_filter);
      logger.info(`Retrieved ${filteredProducts.length} products from marketplace`);
      
      if (!filteredProducts || filteredProducts.length === 0) {
        logger.warn('No products found in marketplace, ending process');
        this.lastRun = new Date();
        return false;
      }
      
      // Get already imported products from database to avoid duplicates
      const importedProducts = await this.getImportedProducts();
      logger.info(`Found ${importedProducts.length} previously imported products`);
      
      // Filter out already imported products
      const availableProducts = filteredProducts.filter(product => 
        !importedProducts.includes(product._id) && 
        !importedProducts.includes(product.id_on_site)
      );
      
      logger.info(`Found ${availableProducts.length} products available for import after filtering`);
      
      if (availableProducts.length === 0) {
        logger.warn('No new products available to import, ending process');
        this.lastRun = new Date();
        return false;
      }
      
      // Randomize and select products up to the desired count
      const selectedProducts = this.getRandomizedProducts(availableProducts, productsToImport);
      logger.info(`Selected ${selectedProducts.length} products to import`);
      
      // Step 2: Import products to draft
      const importedToDraft = await this.importProductsToDraft(storeId, selectedProducts);
      
      if (importedToDraft.length === 0) {
        logger.warn('Failed to import any products to draft, ending process');
        this.lastRun = new Date();
        return false;
      }
      
      // Step 3: Wait 30 seconds for drafts to process
      logger.info('Waiting 30 seconds for drafts to process...');
      await new Promise(resolve => setTimeout(resolve, 30000));
      
      // Step 4: Get list of drafts
      const drafts = await this.getProductDrafts(storeId);
      logger.info(`Found ${drafts.length} drafts in store`);
      
      if (!drafts || drafts.length === 0) {
        logger.warn('No drafts found in store, ending process');
        this.lastRun = new Date();
        return false;
      }
      
      // Find the drafts that match our imported products
      const ourDrafts = this.matchDraftsToProducts(drafts, importedToDraft);
      logger.info(`Matched ${ourDrafts.length} drafts to our imported products`);
      
      // Step 5: Import drafts to products tab
      const importedToProducts = await this.importDraftsToProductsTab(storeId, ourDrafts);
      logger.info(`Successfully imported ${importedToProducts.length} products to products tab`);
      
      // Step 6: Wait 60 seconds for products to process
      logger.info('Waiting 60 seconds for products to process...');
      await new Promise(resolve => setTimeout(resolve, 60000));
      
      // Step 7: Get list of products in store to confirm import
      const productsInStore = await autoDSAPI.getProducts();
      logger.info(`Found ${productsInStore.length} products in store`);
      
      // Verify which products were successfully imported
      const successfulImports = await this.verifyImportedProducts(productsInStore, importedToProducts);
      logger.info(`Verified ${successfulImports.length} products were successfully imported`);
      
      // Save imported products to database
      if (successfulImports.length > 0) {
        await this.saveImportedProducts(successfulImports);
      } else {
        logger.warn('No products were successfully verified for import');
      }
      
      // Check if we need to import more products to reach the desired count
      const remainingCount = productsToImport - (successfulImports.length || 0);
      
      if (remainingCount > 0) {
        logger.info(`Need to import ${remainingCount} more products to reach the desired count of ${productsToImport}`);
        
        // Recursive call to import remaining products, with the maxAttempts parameter
        await this.importRemainingProducts(storeId, supplier_filter, remainingCount, 1, 3);
      }
      
      this.lastRun = new Date();
      logger.info('Product listing process completed successfully');
      return true;
      
    } catch (error) {
      logger.error('Error in product listing scheduler', { error: error.message });
      this.lastRun = new Date();
      throw error;
    }
  }
  
  async getFilteredProducts(storeId, filters = []) {
    try {
      const token = await autoDSAPI.ensureAuthenticated();
      
      const url = 'https://gw.autods.com/marketplace/api/products/';
      
      const payload = {
        "projection": {
          "title": {},
          "images": {},
          "supplier_name": {},
          "site_name": {},
          "id_on_site": {},
          "product_details": {},
          "region": {},
          "private_supplier": {},
          "is_winning_product": {},
          "is_free_winning_product": {},
          "categories": {}
        },
        "order_by": {
            "direction": "desc",
            "name": "spv_param"
        },
        "condition": "and",
        "limit": 100,
        "offset": 0,
        "filters": filters,
      };
      
      const response = await axios({
        method: 'post',
        url,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        data: payload
      });
      
      return response.data.results || [];
    } catch (error) {
      logger.error('Failed to get filtered products from marketplace', { error: error.message });
      return [];
    }
  }
  
  getRandomizedProducts(products, count) {
    // Shuffle the array using Fisher-Yates algorithm
    const shuffled = [...products];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    
    // Take the first 'count' elements
    return shuffled.slice(0, Math.min(count, shuffled.length));
  }
  
  async getImportedProducts() {
    try {
      // Get products that were previously imported from the database
      const importedListings = await db.listings.find({}).lean();
      return importedListings.map(listing => listing.autodsId);
    } catch (error) {
      logger.error('Error getting imported products from database', { error: error.message });
      return [];
    }
  }
  
  async importProductsToDraft(storeId, products) {
    const importedProducts = [];
    
    for (const product of products) {
      try {
        const token = await autoDSAPI.ensureAuthenticated();
        
        const url = `https://v2-api.autods.com/products/single_draft_product/${storeId}/`;
        
        const isSitePrivateSuppliers = product.site_name === "private_suppliers";
        
        const payload = {
          "urls": [],
          "region": 1,
          "status": 1,
          "buy_site_id": isSitePrivateSuppliers ? 27 : 1,
          "upload_as_draft": false,
          "is_sample_loading": false,
          "upload_type": "marketplace",
          "action_source": 4,
          "new_products": [
            {
              "asin": isSitePrivateSuppliers ? product._id : product.id_on_site
            }
          ]
        };
        
        const response = await axios({
          method: 'post',
          url,
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          data: payload
        });
        
        if (response.status === 200) {
          logger.info(`Successfully imported product ${product._id} - ${product.title} to draft`);
          importedProducts.push({
            id: product._id,
            id_on_site: product.id_on_site,
            site_name: product.site_name,
            title: product.title
          });
        }
        
        // Add a small delay to avoid API rate limits
        await new Promise(resolve => setTimeout(resolve, 1000));
        
      } catch (error) {
        console.log(error);
        logger.error(`Error importing product ${product._id} to draft`, { error: error.message });
      }
    }
    
    return importedProducts;
  }
  
  async getProductDrafts(storeId) {
    try {
      const token = await autoDSAPI.ensureAuthenticated();
      
      const url = `https://v2-api.autods.com/products/${storeId}/list/`;
      
      const payload = {
        limit: 100,
        offset: 0,
        condition: "and",
        filters: [],
        order_by: {
            "name": "id",
            "direction": "desc"
        },
        product_status: 1,
        projection: [
            "id",
            "main_picture_url",
            "site_id",
            "title",
            "autods_store_id",
            "bulk_action_started",
            "amount_of_variations",
            "category",
            "tags",
            "configuration",
            "note",
            "variation_statistics",
            "manufacturer",
            "status",
            "scheduled_datetime",
            "payment_policy_id",
            "payment_policy_name",
            "shipping_policy_id",
            "shipping_policy_name",
            "return_policy_id",
            "return_policy_name",
            "recomended_category",
            "postal_code",
            "error_list",
            "facebook_shop_channel_status",
            "catalog_asin",
            "mutation_status",
            "dynamic_policy_enabled",
            "is_updated"
        ]
      };
      
      const response = await axios({
        method: 'post',
        url,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        data: payload
      });
      
      return response.data.results || [];
    } catch (error) {
      logger.error('Failed to get drafts from store', { error: error.message });
      return [];
    }
  }
  
  matchDraftsToProducts(drafts, importedProducts) {
    // Match drafts to our imported products based on title or other identifiers
    // This is an approximation as there's no direct ID mapping between marketplace and drafts
    const matchedDrafts = [];
    
    for (const draft of drafts) {
      for (const product of importedProducts) {
        // Try to match by title comparison
        if (draft.title && product.title && 
            draft.title.toLowerCase().includes(product.title.toLowerCase()) ||
            product.title.toLowerCase().includes(draft.title.toLowerCase())) {
          matchedDrafts.push({
            draft_id: draft.id,
            product_id: product._id,
            title: draft.title
          });
          break;
        }
      }
    }
    
    return matchedDrafts;
  }
  
  async importDraftsToProductsTab(storeId, drafts) {
    const importedDrafts = [];
    
    for (const draft of drafts) {
      try {
        const token = await autoDSAPI.ensureAuthenticated();
        
        const url = `https://v2-api.autods.com/products/${storeId}/import_to_marketplace`;

        const payload = {
            "condition": "and",
            "filters": [
                {
                    "name": "id",
                    "value_list": [
                        draft.draft_id
                    ],
                    "op": "in",
                    "value_type": "list"
                }
            ],
            "product_status": 1
        }
      
        
        const response = await axios({
          method: 'post',
          url,
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          data: payload
        });
        
        if (response.status === 200) {
          logger.info(`Successfully imported draft ${draft.draft_id}- ${draft.title} to products tab`);
          importedDrafts.push({
            draft_id: draft.draft_id,
            product_id: draft.product_id,
            title: draft.title
          });
        }
        
        // Add a small delay to avoid API rate limits
        await new Promise(resolve => setTimeout(resolve, 1000));
        
      } catch (error) {
        logger.error(`Error importing draft ${draft.draft_id} to products tab`, { error: error.message });
      }
    }
    
    return importedDrafts;
  }
  
  async verifyImportedProducts(productsInStore, importedToProducts) {
    if (!productsInStore || !importedToProducts || !Array.isArray(productsInStore) || !Array.isArray(importedToProducts)) {
      logger.warn(`Invalid input to verifyImportedProducts. productsInStore: ${!!productsInStore}, importedToProducts: ${!!importedToProducts}`);
      return [];
    }
    
    const verifiedProducts = [];
    
    for (const importedProduct of importedToProducts) {
      if (!importedProduct) continue;
      
      for (const storeProduct of productsInStore) {
        if (!storeProduct || !storeProduct.title) continue;
        
        // Match by title or ID if available
        if (importedProduct.title && 
            (storeProduct.title.toLowerCase().includes(importedProduct.title.toLowerCase()) ||
            importedProduct.title.toLowerCase().includes(storeProduct.title.toLowerCase()))) {
          
          verifiedProducts.push({
            autods_id: storeProduct.id,
            title: storeProduct.title,
            marketplace_id: importedProduct.product_id,
            item_id_on_site: storeProduct.item_id_on_site || ''
          });
          break;
        }
      }
    }
    
    logger.info(`Verified ${verifiedProducts.length} products with details: ${JSON.stringify(verifiedProducts.map(p => p.title))}`);
    return verifiedProducts;
  }
  
  async saveImportedProducts(products) {
    if (!products || !Array.isArray(products) || products.length === 0) {
      logger.warn('No products to save to database');
      return;
    }
    
    for (const product of products) {
      try {
        if (!product || !product.autods_id) {
          logger.warn(`Invalid product data, skipping: ${JSON.stringify(product)}`);
          continue;
        }
        
        // Save to database as a listing without eBay info
        await db.listings.create({
          autodsId: product.autods_id.toString(),
          ebayListingId: 'pending_' + Date.now(), // Using timestamp to ensure uniqueness
          item_id_on_site: product.item_id_on_site || '',
          sku: product.autods_id.toString(),
          title: product.title || 'Unknown Product',
          price: 0, // Will be updated later
          cost: 0, // Will be updated later
          stock: 0, // Will be updated later
          active: true,
          listedAt: new Date()
        });
        
        logger.info(`Saved imported product ${product.autods_id} to database with item_id_on_site: ${product.item_id_on_site || 'N/A'}`);
      } catch (error) {
        logger.error(`Error saving product ${product.autods_id} to database`, { error: error.message });
      }
    }
  }
  
  async importRemainingProducts(storeId, supplier_filter, count, attempt = 1, maxAttempts = 3) {
    try {
      logger.info(`Starting process to import ${count} additional products (attempt ${attempt} of ${maxAttempts})`);
      
      // Get filtered products from marketplace
      const filteredProducts = await this.getFilteredProducts(storeId, supplier_filter);
      logger.info(`Retrieved ${filteredProducts.length} products from marketplace for additional import`);
      
      if (!filteredProducts || filteredProducts.length === 0) {
        logger.warn('No products found in marketplace for additional import, ending process');
        return false;
      }
      
      // Get already imported products from database to avoid duplicates
      const importedProducts = await this.getImportedProducts();
      logger.info(`Found ${importedProducts.length} previously imported products`);
      
      // Filter out already imported products
      const availableProducts = filteredProducts.filter(product => 
        !importedProducts.includes(product._id) && 
        !importedProducts.includes(product.id_on_site)
      );
      
      logger.info(`Found ${availableProducts.length} products available for additional import after filtering`);
      
      if (availableProducts.length === 0) {
        logger.warn('No new products available for additional import, ending process');
        return false;
      }
      
      // Randomize and select products up to the desired count
      const selectedProducts = this.getRandomizedProducts(availableProducts, count);
      logger.info(`Selected ${selectedProducts.length} products for additional import`);
      
      // Import products to draft
      const importedToDraft = await this.importProductsToDraft(storeId, selectedProducts);
      
      if (importedToDraft.length === 0) {
        logger.warn('Failed to import any additional products to draft, ending process');
        return false;
      }
      
      // Wait 30 seconds for drafts to process
      logger.info('Waiting 30 seconds for additional drafts to process...');
      await new Promise(resolve => setTimeout(resolve, 30000));
      
      // Get list of drafts
      const drafts = await this.getProductDrafts(storeId);
      logger.info(`Found ${drafts.length} drafts in store for additional import`);
      
      if (!drafts || drafts.length === 0) {
        logger.warn('No drafts found in store for additional import, ending process');
        return false;
      }
      
      // Find the drafts that match our imported products
      const ourDrafts = this.matchDraftsToProducts(drafts, importedToDraft);
      logger.info(`Matched ${ourDrafts.length} drafts to our additional imported products`);
      
      // Import drafts to products tab
      const importedToProducts = await this.importDraftsToProductsTab(storeId, ourDrafts);
      logger.info(`Successfully imported ${importedToProducts.length} additional products to products tab`);
      
      // Wait 30 seconds for products to process
      logger.info('Waiting 30 seconds for additional products to process...');
      await new Promise(resolve => setTimeout(resolve, 30000));
      
      // Get list of products in store to confirm import
      const productsInStore = await autoDSAPI.getProducts();
      logger.info(`Found ${productsInStore.length} products in store after additional import`);
      
      // Verify which products were successfully imported
      const successfulImports = await this.verifyImportedProducts(productsInStore, importedToProducts);
      logger.info(`Verified ${successfulImports.length} additional products were successfully imported`);
      
      // Save imported products to database
      if (successfulImports.length > 0) {
        await this.saveImportedProducts(successfulImports);
      } else {
        logger.info('No additional products were successfully verified for import');
      }
      
      // Check if we need to import more products to reach the desired count
      const remainingCount = count - (successfulImports.length || 0);
      
      if (remainingCount > 0 && attempt < maxAttempts) {
        logger.info(`Still need to import ${remainingCount} more products to reach the desired count of ${count} (attempt ${attempt} of ${maxAttempts})`);
        
        // Recursive call to import the remaining products
        return await this.importRemainingProducts(storeId, supplier_filter, remainingCount, attempt + 1, maxAttempts);
      } else if (remainingCount > 0) {
        // logger.warn(`Couldn't import all requested products after ${maxAttempts} attempts. Successfully imported ${count - remainingCount} out of ${count} products.`);
      }
      
      return true;
    } catch (error) {
      logger.error('Error in additional product import', { error: error.message });
      return false;
    }
  }
  
  // Utility methods for eBay listing (kept from original implementation)
  mapProductAspects(product) {
    const aspects = {};
    
    if (product.variations && product.variations[0].active_buy_item) {
      const item = product.variations[0].active_buy_item;
      
      // Map common aspects like brand, model, etc.
      if (item.brand) aspects.Brand = [item.brand];
      if (item.model) aspects.Model = [item.model];
      if (item.color) aspects.Color = [item.color];
      if (item.size) aspects.Size = [item.size];
      if (item.material) aspects.Material = [item.material];
      
      // Map any other aspects from the item's specifications
      if (item.specifications && Array.isArray(item.specifications)) {
        item.specifications.forEach(spec => {
          if (spec.name && spec.value) {
            aspects[spec.name] = [spec.value];
          }
        });
      }
    }
    
    return aspects;
  }
  
  mapToEbayCategory(category) {
    // Simplified version, in production would use a more robust category mapping
    const categoryMap = {
      'Electronics': '293',
      'Clothing': '11450',
      'Home & Garden': '11700',
      'Toys & Hobbies': '220',
      'Sporting Goods': '888',
      'Jewelry & Watches': '281',
      'Health & Beauty': '26395'
    };
    
    if (category && categoryMap[category]) {
      return categoryMap[category];
    }
    
    // Default to "Everything Else" category
    return '99';
  }
}

const productListingScheduler = new ProductListingScheduler();
module.exports = { productListingScheduler };

// services/productRemoval.js - Product removal service


// services/customerMessages.js - Customer message handling service
