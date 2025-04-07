# AutoDS eBay Integration

This application automates the process of integrating AutoDS with eBay for dropshipping. It provides a streamlined interface for managing listings, handling customer messages, and configuring system settings.

## Core Features

- **Automated Product Listing**: Scheduled job that lists products from AutoDS to eBay with customizable pricing and options
- **Product Removal**: Automatically removes listings when products are out of stock or no longer profitable
- **Customer Message Handling**: Responds to customer messages using customizable templates
- **eBay OAuth Integration**: Secure authentication with the eBay API

## Getting Started

### Prerequisites

- Node.js (v14 or higher)
- MongoDB database
- eBay Developer Account
- AutoDS Account

### Installation

1. Clone the repository
2. Install dependencies:
   ```
   npm install
   ```
3. Copy `.env.example` to `.env` and update with your configuration
4. Start the application:
   ```
   npm start
   ```

## Usage

### Web Interface

The application provides a simple web interface for managing your integration:

- **Dashboard**: View key statistics and job status
- **Listings**: View and manage active/ended eBay listings
- **Message Templates**: Customize automatic response templates
- **Settings**: Configure application settings

### eBay Authorization

Before using the application, you need to authorize it with your eBay account:

1. Go to Settings > API Connections
2. Click "Authorize eBay"
3. Complete the authorization process on eBay's website
4. The application will store your credentials securely

### Configuration

All application settings can be configured through the web interface:

- **Business Rules**: Markup, minimum margins, stock thresholds
- **Scheduling**: When tasks run using cron syntax
- **Message Templates**: Customize automatic responses

### Command Line Usage

The application can also be run from the command line for specific tasks:

```
# Run product listing job
node app.js list

# Run product removal job
node app.js remove

# Run customer message handler
node app.js messages
```

## Integrating with AutoDS

The application uses the AutoDS API to fetch product data. You'll need to add your AutoDS credentials in the `.env` file:

```
AUTODS_API_URL=https://v2-api.autods.com
AUTODS_USERNAME=your_username
AUTODS_PASSWORD=your_password
AUTODS_STORE_IDS=your_store_id
```

## Customizing Message Templates

You can customize the automatic response templates through the web interface. The following variables are available:

- `{{buyerName}}`: The name of the buyer
- `{{itemTitle}}`: The title of the item being discussed
- `{{orderNumber}}`: The order number, if available
- `{{sellerName}}`: Your eBay seller name 