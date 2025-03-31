# AutoDS-eBay Integration Application

This application integrates AutoDS with eBay to automate product listings, manage inventory, and handle customer messages.

## Running the Application

### Using the Executable

1. Download the appropriate executable for your operating system:
   - Windows: `autods-win.exe`
   - macOS: `autods-macos`
   - Linux: `autods-linux`

2. Edit the `.env` file in the same directory as the executable with your API credentials:

```
# Required environment variables
MONGODB_URI=your_mongodb_connection_string
EBAY_USERNAME=your_ebay_username
EBAY_PASSWORD=your_ebay_password
EBAY_CLIENT_ID=your_ebay_client_id
EBAY_CLIENT_SECRET=your_ebay_client_secret
EBAY_DEV_ID=your_ebay_dev_id
EBAY_RU_NAME=your_ebay_ru_name
EBAY_FULFILLMENT_POLICY_ID=your_ebay_fulfillment_policy_id
EBAY_PAYMENT_POLICY_ID=your_ebay_payment_policy_id
EBAY_RETURN_POLICY_ID=your_ebay_return_policy_id
AUTODS_USERNAME=your_autods_username
AUTODS_PASSWORD=your_autods_password
AUTODS_STORE_IDS=your_autods_store_ids
```

You can refer to the `.env.example` file for the complete list of available configuration options.

3. Run the executable:
   - Windows: Double-click on `autods-win.exe` or run it from command prompt
   - macOS: Open terminal, navigate to the directory and run `./autods-macos`
   - Linux: Open terminal, navigate to the directory and run `./autods-linux`

The application will start and run on port 3000 by default. You can access it by opening a web browser and navigating to `http://localhost:3000`.

### Testing Individual Tasks

You can run individual tasks directly from the command line for testing purposes:

```
# Run product listing task
autods-win.exe list

# Run product removal task
autods-win.exe remove

# Run customer message handling task
autods-win.exe messages
```

For macOS and Linux:

```
# Run product listing task
./autods-macos list
./autods-linux list

# Run product removal task
./autods-macos remove
./autods-linux remove

# Run customer message handling task
./autods-macos messages
./autods-linux messages
```

This is useful for testing your configuration and ensuring each task works correctly before letting the application run on schedule.

### Complete Configuration Options

The `.env` file supports the following configuration options:

```
# Server configuration
PORT=3000                      # Port to run the application on
NODE_ENV=production            # Environment (production, development, test)
LOG_LEVEL=info                 # Logging level (info, debug, error, warn)

# Database configuration
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/db_name

# eBay API configuration
EBAY_USERNAME=your_ebay_username
EBAY_PASSWORD=your_ebay_password
EBAY_API_URL=https://api.ebay.com
EBAY_CLIENT_ID=your_ebay_client_id
EBAY_CLIENT_SECRET=your_ebay_client_secret
EBAY_DEV_ID=your_ebay_dev_id
EBAY_RU_NAME=your_ebay_ru_name
EBAY_TOKEN_URL=https://api.ebay.com/identity/v1/oauth2/token
EBAY_AUTH_URL=https://auth.ebay.com/oauth2/authorize
EBAY_FULFILLMENT_POLICY_ID=your_policy_id  # shipping policy
EBAY_PAYMENT_POLICY_ID=your_policy_id      # payment policy
EBAY_RETURN_POLICY_ID=your_policy_id       # return policy
EBAY_RU_NAME_URL=https://your-callback-url.com/

# AutoDS API configuration
AUTODS_API_URL=https://v2-api.autods.com
AUTODS_USERNAME=your_autods_username
AUTODS_PASSWORD=your_autods_password
AUTODS_STORE_IDS=your_store_id  # Comma-separated if multiple

# Business logic configuration
DEFAULT_MARKUP=1.3              # Default price markup (multiply by this value)
MINIMUM_MARGIN=0.2              # Minimum profit margin
MINIMUM_STOCK=1                 # Minimum stock level to keep a listing active
MAX_LISTING_QUANTITY=10         # Maximum quantity per listing
RESPONSE_TIME_HOURS=24          # Maximum time to respond to customer messages
ESCALATION_KEYWORDS=refund,broken,damaged,complaint,return,defective,not as described,wrong item

# Scheduling (cron format)
LISTING_CRON_SCHEDULE=0 9 * * *  # every day at 9 AM
REMOVAL_CRON_SCHEDULE=0 18 * * * # every day at 6 PM
MESSAGE_CRON_SCHEDULE=0 * * * *  # every hour

# Email configuration
EMAIL_ENABLED=true
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_SECURE=true
ADMIN_EMAILS=admin@yourdomain.com,support@yourdomain.com
```

## For Developers

If you want to modify the application, you'll need to have Node.js installed.

1. Clone the repository
2. Install dependencies: `npm install`
3. Create a `.env` file with your configuration (copy from `.env.example` and edit)
4. Run the application: `npm start`
5. For development with auto-reload: `npm run dev`

To build the executable:
```
npm run build
```

This will create executables for Windows, macOS, and Linux in the `dist` directory. 