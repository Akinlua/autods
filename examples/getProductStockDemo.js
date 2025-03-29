require('dotenv').config();
const autoDSAPI = require('../api/autods');

async function demoGetProductStock() {
  try {
    // Get the store IDs being used
    const storeIds = autoDSAPI.getStoreIds();
    console.log(`Using store IDs: ${storeIds}`);
    
    // Example: Get stock for a specific product
    // Using a product ID from the sample data
    const productId = '67d80ad30d6a46c05fc0027f';
    console.log(`\nFetching stock for product ID: ${productId}...`);
    
    const stockInfo = await autoDSAPI.getProductStock(productId);
    
    console.log('\nProduct Stock Information:');
    console.log(`- Product ID: ${stockInfo.productId}`);
    console.log(`- Status: ${stockInfo.status}`);
    console.log(`- Total Quantity: ${stockInfo.quantity}`);
    
    // Display variation info if present
    if (stockInfo.variations && stockInfo.variations.length > 0) {
      console.log('\nVariations:');
      stockInfo.variations.forEach((variation, index) => {
        console.log(`\nVariation ${index + 1}:`);
        console.log(`- Available: ${variation.available ? 'Yes' : 'No'}`);
        console.log(`- Quantity: ${variation.quantity}`);
        console.log(`- Buy Price: ${variation.buyPrice}`);
        console.log(`- Sell Price: ${variation.sellPrice}`);
      });
    }
    
    // Test getting stock for a non-existent product
    try {
      console.log('\nTesting with a non-existent product ID...');
      const nonExistentId = '000000000000000000000000';
      await autoDSAPI.getProductStock(nonExistentId);
    } catch (error) {
      console.log(`Successfully caught error: ${error.message}`);
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

demoGetProductStock(); 