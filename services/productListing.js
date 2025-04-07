// services/productListing.js - Product listing service

const ebayAPI = require('../api/ebay');
const autoDSAPI = require('../api/autods');
const logger = require('../utils/logger');
const db = require('../db/database');
const config = require('../config/config');

class ProductListingScheduler {
  constructor() {
    this.markup = config.pricing.defaultMarkup || 1.3; // 30% markup by default
    this.stockThreshold = config.inventory.minimumStock || 1;
    // Store IDs are now handled in the AutoDS API client
  }

  async run() {
    try {
      const storeIds = autoDSAPI.getStoreIds();
      console.log(storeIds);
      logger.info(`Fetching products from AutoDS for store IDs: ${storeIds}`);
      
      // Get products from AutoDS using the updated API
      const products = await autoDSAPI.getProducts();
      logger.info(`Found ${products.length} products from AutoDS`);

      // Get existing eBay listings to avoid duplicates
      const existingListings = await ebayAPI.getSellerList();
      // console.log(existingListings);
      logger.info(`Found ${existingListings.length} existing eBay listings`);
      const existingSkus = existingListings.map(listing => listing.sku);

      // Filter products that are not already listed and have enough stock based on variation_statistics
      const eligibleProducts = products.filter(product => {
        // Skip products that are already listed
        if (existingSkus.includes(product.id.toString())) {
          logger.info(`Product ${product.id} already listed on eBay, skipping`);
          return false;
        }

        // Skip products with errors
        // if (product.error_list && product.error_list.length > 0) {
        //   const errorMessages = product.error_list.map(error => error.message).join('; ');
        //   logger.info(`Product ${product.id} has errors: ${errorMessages}, skipping`);
        //   return false;
        // }

        // Check if product has adequate stock from variation_statistics
        if (product.variation_statistics) {
          const inStock = product.variation_statistics.in_stock?.total || 0;
          if (inStock < this.stockThreshold) {
            logger.info(`Product ${product.id} has insufficient stock (${inStock}), skipping`);
            return false;
          }
          return true;
        }
        
        logger.info(`Product ${product.id} has no variation statistics, skipping`);
        return false;
      });

      logger.info(`Found ${eligibleProducts.length} eligible products to list`);

      // Process eligible products for listing
      for (const product of eligibleProducts) {
        try {
          // Get detailed product info (includes enriched data)
          const productDetails = await autoDSAPI.getProductDetails(product.id);
          
          // No need to separately get stock info since it's in variation_statistics
          
          // Calculate price with markup using variation_statistics
          const basePrice = productDetails.variation_statistics.min_sell_price;
          const sellingPrice = (parseFloat(basePrice) * this.markup).toFixed(2);
          
          // Extract all image URLs from the product
          const imageUrls = [];
          // Add main picture URL if present
          if (productDetails.main_picture_url && productDetails.main_picture_url.url) {
            imageUrls.push(productDetails.main_picture_url.url);
          }
          // Add any additional images
          if (productDetails.images && Array.isArray(productDetails.images)) {
            productDetails.images.forEach(image => {
              // Avoid duplicates
              if (image.url && !imageUrls.includes(image.url)) {
                imageUrls.push(image.url);
              }
            });
          }
          
          // Create eBay listing
          const itemData = {
            sku: productDetails.id.toString(),
            product: {
              title: productDetails.title,
              description: productDetails.description,
              imageUrls: imageUrls,
              aspects: this.mapProductAspects(productDetails),
              brand: productDetails.variations[0].active_buy_item.brand
            },
            availability: {
              shipToLocationAvailability: {
                quantity: Math.min(productDetails.variation_statistics.in_stock.total, 10) // Limit to 10 at a time
              }
            },
            condition: "NEW",
            categoryId: this.mapToEbayCategory(productDetails.category),
            format: "FIXED_PRICE",
            listingPolicies: {
              fulfillmentPolicyId: process.env.EBAY_FULFILLMENT_POLICY_ID,
              paymentPolicyId: process.env.EBAY_PAYMENT_POLICY_ID,
              returnPolicyId: process.env.EBAY_RETURN_POLICY_ID
            },
            pricingSummary: {
              price: {
                currency: productDetails.variation_statistics.sell_currency || "USD",
                value: sellingPrice
              }
            }
          };

          // Add the item to eBay
          const result = await ebayAPI.addItem(itemData);
          logger.info(`Successfully listed product ${product.id} on eBay with listing ID ${result.listingId}`);
          
          // Store listing details in database
          await db.listings.create({
            autodsId: product.id,
            ebayListingId: result.listingId,
            sku: product.id.toString(),
            title: productDetails.title,
            price: sellingPrice,
            cost: productDetails.variation_statistics.min_buy_price,
            stock: productDetails.variation_statistics.in_stock.total,
            listedAt: new Date()
          });
          
          // Small delay to avoid API rate limits
          logger.info('Waiting for 2 second before listing next product');
          await new Promise(resolve => setTimeout(resolve, 2000));
          
        } catch (error) {
          logger.error(`Error processing product ${product.id}`, { error: error.message });
          continue; // Continue with next product
        }
      }
      
      return true;
    } catch (error) {
      logger.error('Error in product listing scheduler', { error: error.message });
      throw error;
    }
  }
  
  mapProductAspects(productDetails) {
    const aspects = {};
    
    // Map standard aspects
    if (productDetails.variations[0].active_buy_item.brand) {
      aspects["Brand"] = [productDetails.variations[0].active_buy_item.brand];
    } else {
      aspects["Brand"] = ["Generic"];
    }

    // Add Color (required by eBay)
    if (!aspects["Color"]) {
      const commonColors = [
        "Black", "White", "Red", "Blue", "Green", "Yellow", "Purple", "Pink",
        "Brown", "Gray", "Orange", "Silver", "Gold", "Multicolor", "Beige"
      ];
      
      let color = "Other";
      const text = (productDetails.title + ' ' + productDetails.description).toLowerCase();
      
      for (const clr of commonColors) {
        if (text.includes(clr.toLowerCase())) {
          color = clr;
          break;
        }
      }
      
      // Check variations for color information
      if (productDetails.variations && Array.isArray(productDetails.variations)) {
        const colorVariations = productDetails.variations
          .map(v => v.active_buy_item?.color || v.color)
          .filter(Boolean);
        
        if (colorVariations.length > 0) {
          color = colorVariations[0];
        }
      }
      
      aspects["Color"] = [color];
    }

    // Add Material (required by eBay)
    if (!aspects["Material"]) {
      const commonMaterials = [
        "Cotton", "Polyester", "Plastic", "Metal", "Wood", "Glass", "Leather",
        "Silicone", "Nylon", "Spandex", "Wool", "Aluminum", "Steel", "Fabric",
        "Canvas", "Ceramic", "Rubber", "Stainless Steel", "Alloy"
      ];
      
      let material = "Other";
      const text = (productDetails.title + ' ' + productDetails.description).toLowerCase();
      
      for (const mat of commonMaterials) {
        if (text.includes(mat.toLowerCase())) {
          material = mat;
          break;
        }
      }
      
      aspects["Material"] = [material];
    }

    // Add Size if available
    if (!aspects["Size"]) {
      if (productDetails.variations && Array.isArray(productDetails.variations)) {
        const sizeVariations = productDetails.variations
          .map(v => v.active_buy_item?.size || v.size)
          .filter(Boolean);
        
        if (sizeVariations.length > 0) {
          aspects["Size"] = [sizeVariations[0]];
        } else {
          aspects["Size"] = ["One Size"];
        }
      }
    }

    // Add Model if available
    if (!aspects["Model"]) {
      const model = productDetails.variations[0]?.active_buy_item?.model 
        || productDetails.model 
        || `Model-${productDetails.id}`;
      aspects["Model"] = [model];
    }

    // Add MPN (Manufacturer Part Number)
    if (!aspects["MPN"]) {
      aspects["MPN"] = [`MPN-${productDetails.id}`];
    }

    // Add Style if it can be determined
    if (!aspects["Style"]) {
      const commonStyles = [
        "Casual", "Modern", "Classic", "Contemporary", "Traditional",
        "Vintage", "Retro", "Sports", "Business", "Fashion"
      ];
      
      let style = "Modern";
      const text = (productDetails.title + ' ' + productDetails.description).toLowerCase();
      
      for (const sty of commonStyles) {
        if (text.includes(sty.toLowerCase())) {
          style = sty;
          break;
        }
      }
      
      aspects["Style"] = [style];
    }

    // Add Department if applicable
    if (!aspects["Department"]) {
      const commonDepartments = ["Men", "Women", "Unisex", "Boys", "Girls", "Children"];
      let department = "Unisex";
      const text = (productDetails.title + ' ' + productDetails.description).toLowerCase();
      
      for (const dept of commonDepartments) {
        if (text.includes(dept.toLowerCase())) {
          department = dept;
          break;
        }
      }
      
      aspects["Department"] = [department];
    }

    // Add Type if not already set
    if (!aspects["Type"]) {
      const commonTypes = [
        "Shirt", "Pants", "Dress", "Shoes", "Hat", "Jacket", "Coat", "Sweater",
        "Tool", "Device", "Gadget", "Accessory", "Toy", "Game", "Phone", "Case",
        "Cover", "Holder", "Stand", "Cable", "Charger", "Adapter", "Set", "Kit"
      ];
      
      let typeValue = "Other";
      const title = productDetails.title || "";
      
      for (const type of commonTypes) {
        if (title.includes(type)) {
          typeValue = type;
          break;
        }
      }
      
      aspects["Type"] = [typeValue];
    }

    // Add tags as aspects
    if (productDetails.tags && Array.isArray(productDetails.tags)) {
      productDetails.tags.forEach(tag => {
        if (!aspects[tag] && tag.length < 30) {
          aspects[tag] = ["Yes"];
        }
      });
    }

    // Map category into aspects
    if (productDetails.category && productDetails.category.length > 0) {
      const categoryName = productDetails.category[0].name || '';
      if (categoryName.includes('->')) {
        const categories = categoryName.split('->').map(c => c.trim());
        categories.forEach(cat => {
          if (cat && !aspects[cat] && cat.length < 30) {
            aspects[cat] = ["Yes"];
          }
        });
      }
    }

    return aspects;
  }
  
  mapToEbayCategory(categories) {
    // Extract category from the AutoDS category format
    // Categories in v2 API might be in an array format
    if (!categories || !Array.isArray(categories) || categories.length === 0) {
      return '220'; // Default to 'Everything Else' category
    }
    
    // Try to get the category ID from the first category entry
    const firstCategory = categories[0];
    if (firstCategory.category_id) {
      return firstCategory.category_id;
    }
    
    // Fallback to category mapping based on name
    if (firstCategory.name) {
      const categoryName = firstCategory.name.toLowerCase();
      // This would ideally be a more comprehensive mapping
      const categoryMap = {
        // Electronics
        'electronics': '293',
        'computers': '58058',
        'tablets': '171485',
        'cell phones': '15032',
        'smartphones': '9355',
        'cameras': '625',
        'video games': '1249',
        'car electronics': '14923',
        'tv': '32852',
        'audio': '14969',
        'headphones': '112529',
        'smart home': '175574',
        
        // Fashion
        'clothing': '11450',
        'men': '1059',
        'women': '15724',
        'shoes': '63889',
        'jewelry': '281',
        'watches': '14324',
        'accessories': '4251',
        'handbags': '169291',
        'kids clothing': '171146',
        
        // Home & Garden
        'home': '11700',
        'kitchen': '20625',
        'furniture': '3197',
        'bedding': '20444',
        'bathroom': '26677',
        'garden': '159912',
        'tools': '631',
        'decor': '10033',
        'appliances': '20710',
        'lighting': '20697',
        
        // Toys & Hobbies
        'toys': '220',
        'collectibles': '1',
        'action figures': '246',
        'dolls': '237',
        'games': '233',
        'puzzles': '19169',
        'rc toys': '2562',
        'building toys': '183446',
        
        // Health & Beauty
        'beauty': '26395',
        'health': '67588',
        'makeup': '31786',
        'skin care': '11863',
        'fragrances': '180345',
        'hair care': '11854',
        'bath & body': '11838',
        'massage': '36447',
        'vitamins': '180959',
        
        // Sports & Outdoors
        'sports': '888',
        'fitness': '15273',
        'cycling': '7294',
        'camping': '16034',
        'fishing': '1492',
        'hunting': '7301',
        'golf': '1513',
        'swimming': '74952',
        'tennis': '1585',
        'winter sports': '1059',
        'outdoor recreation': '159043',
        
        // Pets
        'pet supplies': '1281',
        'dog supplies': '20742',
        'cat supplies': '20741',
        'fish supplies': '20753',
        'bird supplies': '20744',
        'small animal supplies': '20754',
        
        // Automotive
        'automotive': '6028',
        'car parts': '33612',
        'motorcycle parts': '10063',
        'atv parts': '43962',
        'boat parts': '26429',
        'truck parts': '33637',
        
        // Business & Industrial
        'business': '12576',
        'industrial': '11804',
        'office': '1185',
        'manufacturing': '92074',
        'retail': '11818',
        
        // Books, Movies & Music
        'books': '267',
        'movies': '11232',
        'music': '11233',
        'magazines': '280',
        
        // Baby
        'baby': '2984',
        'baby clothing': '3082',
        'strollers': '66700',
        'car seats': '66692',
        'feeding': '20400',
        'toys': '19069',
        
        // Crafts
        'crafts': '14339',
        'art supplies': '28102',
        'sewing': '160737',
        'scrapbooking': '160724',
        'knitting': '160722',
        
        // Musical Instruments
        'instruments': '619',
        'guitars': '33034',
        'drums': '180010',
        'keyboards': '180016',
        
        // Default
        'other': '220' // Everything Else
      };
      
      // Check if any keywords from the map are in the category name
      for (const [key, value] of Object.entries(categoryMap)) {
        if (categoryName.includes(key)) {
          return value;
        }
      }
    }
    
    return '220'; // Default to 'Everything Else' category
  }
}

const productListingScheduler = new ProductListingScheduler();
module.exports = { productListingScheduler };

// services/productRemoval.js - Product removal service


// services/customerMessages.js - Customer message handling service
