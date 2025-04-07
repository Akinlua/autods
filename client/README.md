# AutoDS-eBay Dashboard

A modern web application for managing your eBay dropshipping business with AutoDS integration. This dashboard provides an intuitive interface to monitor listings, track sales, manage messages, and configure settings for both eBay and AutoDS platforms.

## Features

- **Dashboard**: View key metrics, sales performance, and recent listings
- **Listings Management**: Create, edit, and manage eBay listings
- **Messages**: Handle customer inquiries and communication
- **Settings**: Configure eBay API, AutoDS integration, and system preferences

## Prerequisites

- Node.js (v14 or higher)
- npm or yarn

## Installation

1. Clone the repository:
   ```
   git clone https://github.com/yourusername/autods-ebay-dashboard.git
   cd autods-ebay-dashboard
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Create a `.env` file in the root directory with the following variables:
   ```
   REACT_APP_API_URL=http://localhost:3000/api
   ```

## Running the Application

### Development Mode

```
npm start
```

This will start the development server at [http://localhost:3000](http://localhost:3000).

### Production Build

```
npm run build
```

This will create a production-ready build in the `build` folder.

## Troubleshooting

### ESM Module Errors

If you encounter errors related to ES Modules like:
```
Error [ERR_REQUIRE_ESM]: require() of ES Module ... not supported
```

Try the following fixes:

1. Add an `.npmrc` file with the following content:
   ```
   legacy-peer-deps=true
   node-linker=hoisted
   ```

2. Or, reinstall dependencies with the legacy peer deps flag:
   ```
   npm install --legacy-peer-deps
   ```

## Demo Credentials

For testing purposes, you can use the following credentials:
- Email: admin@example.com
- Password: admin123

## License

MIT License 