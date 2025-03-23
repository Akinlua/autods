// services/productListing.js - Product listing service

const ebayAPI = require('../api/ebay');
const autoDSAPI = require('../api/autods');
const logger = require('../utils/logger');
const db = require('../db/database');
const config = require('../config/config');

class ProductListingScheduler {
  constructor() {
    this.markup = config.pricing.defaultMarkup || 1.3; // 30% markup by default
    this.stockThreshold = config.inventory.minimumStock || 5;
  }

  async run() {
    try {
      logger.info('Fetching products from AutoDS');
      // const products = await autoDSAPI.getProducts();
      // logger.info(`Found ${products.length} products from AutoDS`);

      // Get existing eBay listings to avoid duplicates
      const existingListings = await ebayAPI.getSellerList();
      console.log("exisging listings")
      console.log(existingListings)
      const existingSkus = existingListings.map(listing => listing.sku);

      // Filter products that are not already listed and have enough stock
      // for (const product of products) {
      //   try {
      //     // Skip if already listed
      //     if (existingSkus.includes(product.id.toString())) {
      //       logger.info(`Product ${product.id} already listed on eBay, skipping`);
      //       continue;
      //     }

      //     // Check stock
      //     const stockInfo = await autoDSAPI.getProductStock(product.id);
      //     console.log("stockInfo")
      //     console.log(stockInfo)
      //     if (stockInfo.quantity < this.stockThreshold) {
      //       logger.info(`Product ${product.id} has insufficient stock (${stockInfo.quantity}), skipping`);
      //       continue;
      //     }

      //     // Get detailed product info
      //     const productDetails = await autoDSAPI.getProductDetails(product.id);
      //     console.log("productDetails")
      //     console.log(productDetails)
          
      //     // Calculate price with markup
      //     const sellingPrice = (parseFloat(productDetails.price) * this.markup).toFixed(2);
          
      //     // Create eBay listing
      //     const itemData = {
      //       sku: product.id.toString(),
      //       product: {
      //         title: productDetails.title,
      //         description: productDetails.description,
      //         imageUrls: productDetails.images.map(img => img.url),
      //         aspects: this.mapProductAspects(productDetails),
      //         brand: productDetails.brand || "Unbranded"
      //       },
      //       availability: {
      //         shipToLocationAvailability: {
      //           quantity: Math.min(stockInfo.quantity, 10) // Limit to 10 at a time
      //         }
      //       },
      //       condition: "NEW",
      //       categoryId: this.mapToEbayCategory(productDetails.category),
      //       format: "FIXED_PRICE",
      //       listingPolicies: {
      //         fulfillmentPolicyId: process.env.EBAY_FULFILLMENT_POLICY_ID,
      //         paymentPolicyId: process.env.EBAY_PAYMENT_POLICY_ID,
      //         returnPolicyId: process.env.EBAY_RETURN_POLICY_ID
      //       },
      //       pricingSummary: {
      //         price: {
      //           currency: "USD",
      //           value: sellingPrice
      //         }
      //       }
      //     };

      //     // Add the item to eBay
      //     const result = await ebayAPI.addItem(itemData);
      //     logger.info(`Successfully listed product ${product.id} on eBay with listing ID ${result.listingId}`);
          
      //     // Store listing details in database
      //     await db.listings.create({
      //       autodsId: product.id,
      //       ebayListingId: result.listingId,
      //       sku: product.id.toString(),
      //       title: productDetails.title,
      //       price: sellingPrice,
      //       cost: productDetails.price,
      //       stock: stockInfo.quantity,
      //       listedAt: new Date()
      //     });
          
      //     // Small delay to avoid API rate limits
      //     await new Promise(resolve => setTimeout(resolve, 1000));
          
      //   } catch (error) {
      //     logger.error(`Error processing product ${product.id}`, { error: error.message });
      //     continue; // Continue with next product
      //   }
      // }
      
      return true;
    } catch (error) {
      logger.error('Error in product listing scheduler', { error: error.message });
      throw error;
    }
  }
  
  mapProductAspects(productDetails) {
    // Map product attributes to eBay aspects
    const aspects = {};
    
    // Map standard aspects
    if (productDetails.brand) aspects["Brand"] = [productDetails.brand];
    if (productDetails.model) aspects["Model"] = [productDetails.model];
    if (productDetails.color) aspects["Color"] = [productDetails.color];
    if (productDetails.size) aspects["Size"] = [productDetails.size];
    if (productDetails.material) aspects["Material"] = [productDetails.material];
    
    // Map custom attributes if they exist
    if (productDetails.attributes && Array.isArray(productDetails.attributes)) {
      productDetails.attributes.forEach(attr => {
        if (attr.name && attr.value) {
          aspects[attr.name] = [attr.value];
        }
      });
    }
    
    return aspects;
  }
  
  mapToEbayCategory(autodsCategory) {
    // This would ideally be a more comprehensive mapping
    // Simplified example mapping
    const categoryMap = {
      'electronics': '293',
      'clothing': '11450',
      'home': '11700',
      'toys': '220',
      'beauty': '26395',
      'sports': '888',
      // Add more categories as needed
    };
    
    return categoryMap[autodsCategory.toLowerCase()] || '220'; // Default to 'Everything Else' category
  }
}

const productListingScheduler = new ProductListingScheduler();
module.exports = { productListingScheduler };

// services/productRemoval.js - Product removal service


// services/customerMessages.js - Customer message handling service
