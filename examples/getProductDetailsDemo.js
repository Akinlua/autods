require('dotenv').config();
const autoDSAPI = require('../api/autods');

async function demoGetProductDetails() {
  try {
    // Get the store IDs being used
    const storeIds = autoDSAPI.getStoreIds();
    console.log(`Using store IDs: ${storeIds}`);
    
    // Example: Get details for a specific product using the updated method
    // Using a product ID from the sample data
    const productId = '67d80ad30d6a46c05fc0027f';
    console.log(`\nFetching details for product ID: ${productId}...`);
    
    const productDetails = await autoDSAPI.getProductDetails(productId);
    
    // Display a summary of the product details
    console.log('\nProduct Details Summary:');
    console.log(`- ID: ${productDetails.id}`);
    console.log(`- Title: ${productDetails.title}`);
    console.log(`- Store ID: ${productDetails.autods_store_id}`);
    console.log(`- Status: ${productDetails.status}`);
    console.log(`- Upload Date: ${productDetails.upload_date}`);
    console.log(`- Brand: ${productDetails.brand}`);
    
    console.log('\nCategory Information:');
    if (productDetails.category && productDetails.category.length > 0) {
      productDetails.category.forEach((cat, index) => {
        console.log(`- Category ${index + 1}: ${cat.name} (ID: ${cat.category_id || 'N/A'})`);
      });
    } else {
      console.log('- No category information available');
    }
    
    console.log('\nImage Information:');
    if (productDetails.main_picture_url && productDetails.main_picture_url.url) {
      console.log(`- Main Picture: ${productDetails.main_picture_url.url}`);
    }
    
    if (productDetails.images && productDetails.images.length > 0) {
      console.log(`- Additional Images: ${productDetails.images.length}`);
      productDetails.images.slice(0, 3).forEach((img, index) => {
        console.log(`  ${index + 1}. ${img.url}`);
      });
      if (productDetails.images.length > 3) {
        console.log(`  ... and ${productDetails.images.length - 3} more`);
      }
    }
    
    console.log('\nVariation Statistics:');
    if (productDetails.variation_statistics) {
      const stats = productDetails.variation_statistics;
      console.log(`- Currency: ${stats.sell_currency}`);
      console.log(`- Price Range: ${stats.min_sell_price} - ${stats.max_sell_price} ${stats.sell_currency}`);
      console.log(`- Buy Price Range: ${stats.min_buy_price} - ${stats.max_buy_price} ${stats.sell_currency}`);
      console.log(`- Profit Range: ${stats.min_profit} - ${stats.max_profit} ${stats.sell_currency}`);
      console.log(`- In Stock: ${stats.in_stock?.total || 0}`);
      console.log(`- Out of Stock: ${stats.out_of_stock?.total || 0}`);
      console.log(`- On Hold: ${stats.on_hold?.total || 0}`);
      
      if (stats.supplier_region && stats.supplier_region.length > 0) {
        console.log('\nSupplier Information:');
        stats.supplier_region.forEach((supplier, index) => {
          console.log(`- Supplier ${index + 1}: ID ${supplier.item_id_on_site}, Site ${supplier.site_id}, Region ${supplier.region}`);
          if (supplier.url) {
            console.log(`  URL: ${supplier.url}`);
          }
        });
      }
    } else {
      console.log('- No variation statistics available');
    }
    
    console.log('\nTags:');
    if (productDetails.tags && productDetails.tags.length > 0) {
      console.log(`- ${productDetails.tags.join(', ')}`);
    } else {
      console.log('- No tags available');
    }
    
    console.log('\nConfiguration:');
    if (productDetails.configuration) {
      const config = productDetails.configuration;
      Object.keys(config).forEach(key => {
        console.log(`- ${key}: ${config[key]}`);
      });
    } else {
      console.log('- No configuration available');
    }
    
    if (productDetails.error_list && productDetails.error_list.length > 0) {
      console.log('\nErrors:');
      productDetails.error_list.forEach(error => {
        console.log(`- ${error.message} (Severity: ${error.severity})`);
      });
    }
    
    // Test getting details for a non-existent product
    try {
      console.log('\nTesting with a non-existent product ID...');
      const nonExistentId = '000000000000000000000000';
      await autoDSAPI.getProductDetails(nonExistentId);
    } catch (error) {
      console.log(`Successfully caught error: ${error.message}`);
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

demoGetProductDetails(); 