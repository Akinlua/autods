require('dotenv').config();
const autoDSAPI = require('../api/autods');

async function demoGetProducts() {
  try {
    // Get the store IDs being used
    const storeIds = autoDSAPI.getStoreIds();
    console.log(`Using store IDs: ${storeIds}`);
    
    // Fetch products using the default store IDs
    console.log('Fetching products...');
    const products = await autoDSAPI.getProducts();
    
    console.log(`Found ${products.length} products`);
    
    // Display brief summary of the first 3 products
    products.slice(0, 3).forEach((product, index) => {
      console.log(`\nProduct ${index + 1}:`);
      console.log(`- ID: ${product.id}`);
      console.log(`- Title: ${product.title}`);
      console.log(`- Store ID: ${product.autods_store_id}`);
      console.log(`- Status: ${product.status}`);
      console.log(`- Upload Date: ${product.upload_date}`);
      
      if (product.variation_statistics) {
        console.log(`- Price Range: ${product.variation_statistics.min_sell_price} - ${product.variation_statistics.max_sell_price} ${product.variation_statistics.sell_currency}`);
        console.log(`- Profit Range: ${product.variation_statistics.min_profit} - ${product.variation_statistics.max_profit} ${product.variation_statistics.sell_currency}`);
      }
      
      if (product.error_list && product.error_list.length > 0) {
        console.log(`- Errors: ${product.error_list.length}`);
        product.error_list.forEach(error => {
          console.log(`  * ${error.message}`);
        });
      }
    });
    
    // Example of changing store IDs (if needed)
    console.log('\nChanging store IDs to only use 1173617 for demonstration...');
    autoDSAPI.setStoreIds('1173617');
    console.log(`Now using store ID: ${autoDSAPI.getStoreIds()}`);
    
    // Fetch products from the changed store ID
    const productsFromOneStore = await autoDSAPI.getProducts();
    console.log(`Found ${productsFromOneStore.length} products from store 1173617`);
    
    // Restore the original store IDs from .env
    autoDSAPI.setStoreIds(process.env.AUTODS_STORE_IDS || '1173617,1197312');
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

demoGetProducts(); 