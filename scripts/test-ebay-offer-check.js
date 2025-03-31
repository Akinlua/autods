// Script to test checking for existing offers on eBay
require('dotenv').config();
const ebayAPI = require('../api/ebay');
const db = require('../db/database');
const logger = require('../utils/logger');

async function testExistingOfferHandling() {
  try {
    console.log('Starting test for handling existing offers...');
    
    // Initialize database connection if needed
    await db.initDatabase();
    
    // Test inventory item key (use an existing one that has an offer)
    const testSku = process.argv[2] || `test-item-${Date.now()}`;
    
    console.log(`Using inventory item key: ${testSku}`);
    
    // Check for existing offers
    console.log('Checking for existing offers...');
    const existingOffers = await ebayAPI.getOffersForInventoryItem(testSku);
    
    if (existingOffers.length > 0) {
      console.log(`Found ${existingOffers.length} existing offers.`);
      
      // Show offer details
      existingOffers.forEach((offer, index) => {
        console.log(`\nOffer ${index + 1}:`);
        console.log(`  Offer ID: ${offer.offerId}`);
        console.log(`  Listing Status: ${offer.listing?.listingStatus || 'N/A'}`);
        console.log(`  Listing ID: ${offer.listing?.listingId || 'N/A'}`);
        console.log(`  Format: ${offer.format}`);
        console.log(`  Marketplace ID: ${offer.marketplaceId}`);
        
        // If you need to delete this offer, uncommenting the following:
        if (process.argv[3] === 'delete') {
          console.log(`\nDeleting offer ${offer.offerId}...`);
          ebayAPI.deleteOffer(offer.offerId)
            .then(result => console.log(`Deleted: ${result}`))
            .catch(err => console.error(`Delete error: ${err.message}`));
        }
      });
      
      if (process.argv[3] === 'update') {
        console.log(`\nUpdating offer ${existingOffers[0].offerId}...`);
        // Example update data
        const updateData = {
          availableQuantity: 5,
          categoryId: existingOffers[0].categoryId || "9355",
          format: existingOffers[0].format || "FIXED_PRICE",
          listingDescription: "Updated description from test script",
          listingPolicies: existingOffers[0].listingPolicies,
          marketplaceId: existingOffers[0].marketplaceId || "EBAY_US",
          merchantLocationKey: existingOffers[0].merchantLocationKey,
          pricingSummary: {
            price: {
              currency: "USD",
              value: "19.99"
            }
          },
          sku: testSku
        };
        
        try {
          const updateResult = await ebayAPI.updateOffer(existingOffers[0].offerId, updateData);
          console.log('Update result:', updateResult);
          
          // Try publishing the offer
          console.log(`\nPublishing offer ${existingOffers[0].offerId}...`);
          const token = await ebayAPI.getAccessToken();
          const axios = require('axios');
          const publishResponse = await axios({
            method: 'post',
            url: `${ebayAPI.baseUrl}/sell/inventory/v1/offer/${existingOffers[0].offerId}/publish`,
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            }
          });
          
          console.log('Publish result:', publishResponse.data);
        } catch (err) {
          console.error(`Update/publish error: ${err.message}`);
        }
      }
    } else {
      console.log('No existing offers found.');
      
      // If you want to test creating an item and an offer
      if (process.argv[3] === 'create') {
        console.log('\nCreating a test item and offer...');
        try {
          const result = await ebayAPI.addItem({
            sku: testSku,
            product: {
              title: "Test Item from Script",
              description: "This is a test item created by the script.",
              imageUrls: ["https://ir.ebaystatic.com/pictures/aw/pics/stockphoto/imgDef.jpg"],
              brand: "Test Brand",
              mpn: `MPN-${Date.now()}`
            },
            availability: {
              shipToLocationAvailability: {
                quantity: 1
              }
            },
            pricingSummary: {
              price: {
                currency: "USD",
                value: "9.99"
              }
            }
          });
          
          console.log('Item created successfully:');
          console.log(`  Inventory Item Key: ${result.inventoryItemKey}`);
          console.log(`  Offer ID: ${result.offerId}`);
          console.log(`  eBay Listing ID: ${result.ebayListingId}`);
        } catch (err) {
          console.error(`Creation error: ${err.message}`);
        }
      }
    }
  } catch (error) {
    console.error('Test failed:', error.message);
  } finally {
    // Exit process
    process.exit(0);
  }
}

// Run the test
testExistingOfferHandling(); 