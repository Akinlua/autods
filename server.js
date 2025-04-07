const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const path = require('path');
const ejs = require('ejs');
const axios = require('axios');
const ebayAPI = require('./api/ebay');

// Initialize Express
const app = express();
const PORT = process.env.PORT || 3000;

// Set up middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// Set up session
app.use(session({
  secret: 'autods-ebay-dashboard-secret',
  resave: false,
  saveUninitialized: true,
  cookie: { secure: process.env.NODE_ENV === 'production' }
}));

// Set up view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Authentication middleware
const isAuthenticated = (req, res, next) => {
  if (req.session.isAuthenticated) {
    return next();
  }
  res.redirect('/login');
};

// Routes
// Login page
app.get('/login', (req, res) => {
  res.render('pages/login', { error: null });
});

app.post('/login', (req, res) => {
  const { email, password } = req.body;
  
  // Simple demo authentication
  if (email === 'admin@example.com' && password === 'admin123') {
    req.session.isAuthenticated = true;
    req.session.user = { email, name: 'Admin User' };
    res.redirect('/');
  } else {
    res.render('pages/login', { error: 'Invalid credentials. Try admin@example.com / admin123' });
  }
});

app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/login');
});

// Dashboard
app.get('/', isAuthenticated, async (req, res) => {
  try {
    // Mock data for demonstration
    const dashboardData = {
      stats: {
        activeListings: 42,
        totalSales: 128,
        pendingMessages: 7,
        profitMargin: 24.5,
      },
      salesData: {
        labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
        datasets: [
          {
            label: 'Sales',
            data: [65, 59, 80, 81, 56, 55],
          },
        ],
      },
      profitData: {
        labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
        datasets: [
          {
            label: 'Profit',
            data: [12, 19, 3, 5, 2, 3],
          },
        ],
      },
      recentListings: [
        { id: 1, title: 'Product A', price: 29.99, listedAt: new Date() },
        { id: 2, title: 'Product B', price: 39.99, listedAt: new Date() },
        { id: 3, title: 'Product C', price: 49.99, listedAt: new Date() },
      ],
    };
    
    res.render('pages/dashboard', { 
      user: req.session.user,
      page: 'dashboard',
      data: dashboardData
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    res.render('pages/dashboard', { 
      user: req.session.user,
      page: 'dashboard',
      data: null,
      error: 'Failed to load dashboard data'
    });
  }
});

// Listings page
app.get('/listings', isAuthenticated, async (req, res) => {
  try {
    // Mock data for demonstration
    const listings = [
      {
        id: 1,
        autodsId: 'AUTO-123',
        ebayListingId: 'EBAY-456',
        sku: 'SKU-789',
        title: 'Product A',
        price: 29.99,
        cost: 15.00,
        stock: 10,
        active: true,
        listedAt: new Date('2023-01-15'),
      },
      {
        id: 2,
        autodsId: 'AUTO-124',
        ebayListingId: 'EBAY-457',
        sku: 'SKU-790',
        title: 'Product B',
        price: 39.99,
        cost: 20.00,
        stock: 5,
        active: true,
        listedAt: new Date('2023-02-20'),
      },
      {
        id: 3,
        autodsId: 'AUTO-125',
        ebayListingId: 'EBAY-458',
        sku: 'SKU-791',
        title: 'Product C',
        price: 49.99,
        cost: 25.00,
        stock: 0,
        active: false,
        listedAt: new Date('2023-03-10'),
        endedAt: new Date('2023-04-01'),
        endReason: 'Out of stock',
      },
    ];
    
    res.render('pages/listings', { 
      user: req.session.user,
      page: 'listings',
      listings
    });
  } catch (error) {
    console.error('Listings error:', error);
    res.render('pages/listings', { 
      user: req.session.user,
      page: 'listings',
      listings: [],
      error: 'Failed to load listings'
    });
  }
});

// Messages page
app.get('/messages', isAuthenticated, async (req, res) => {
  try {
    // Mock data for demonstration
    const messages = [
      {
        id: 1,
        sender: 'customer123',
        subject: 'Question about item #123456789',
        text: 'Hello, I have a question about the product. Does it come with a warranty?',
        recipientID: 'myseller',
        creationDate: new Date('2023-05-10T14:30:00'),
        read: true,
        itemId: '123456789',
      },
      {
        id: 2,
        sender: 'buyer456',
        subject: 'Shipping inquiry for order #987654321',
        text: 'Hi there, I just ordered your product and was wondering when it will be shipped? Thanks!',
        recipientID: 'myseller',
        creationDate: new Date('2023-05-11T09:15:00'),
        read: false,
        itemId: '987654321',
      },
      {
        id: 3,
        sender: 'shopaholic789',
        subject: 'Return request for item #AB123456',
        text: 'I received the wrong item and would like to return it. How do I proceed with the return?',
        recipientID: 'myseller',
        creationDate: new Date('2023-05-12T11:45:00'),
        read: false,
        itemId: 'AB123456',
      },
    ];
    
    res.render('pages/messages', { 
      user: req.session.user,
      page: 'messages',
      messages
    });
  } catch (error) {
    console.error('Messages error:', error);
    res.render('pages/messages', { 
      user: req.session.user,
      page: 'messages',
      messages: [],
      error: 'Failed to load messages'
    });
  }
});

// Settings - Main page and specific settings pages
app.get('/settings', isAuthenticated, (req, res) => {
  res.redirect('/settings/ebay');
});

app.get('/settings/:section', isAuthenticated, async (req, res) => {
  const { section } = req.params;
  
  try {
    let settings = {};
    
    if (section === 'ebay') {
      settings = {
        clientId: 'ebay-app-12345',
        clientSecret: 's3cr3t-k3y-456',
        ruName: 'eBay-MyApp-PRD-12345abc-12345abc',
        connected: true,
        autoRefresh: true,
        defaultCategory: '15032',
        defaultShippingMethod: 'Economy',
        defaultLocation: 'US',
      };
    } else if (section === 'autods') {
      settings = {
        apiKey: 'autods-api-12345',
        apiSecret: 'autods-secret-67890',
        connected: true,
        autoSync: true,
        syncInterval: 60,
        importDrafts: false,
        profitMargin: 20,
        pricingStrategy: 'percentage',
      };
    } else if (section === 'system') {
      settings = {
        darkMode: false,
        notificationsEnabled: true,
        autoUpdate: true,
        logLevel: 'info',
        dataRetention: 30,
        clearDataOnExit: false,
        backupInterval: 24,
        language: 'en',
      };
    }
    
    res.render('pages/settings', {
      user: req.session.user,
      page: 'settings',
      section,
      settings
    });
  } catch (error) {
    console.error('Settings error:', error);
    res.render('pages/settings', { 
      user: req.session.user,
      page: 'settings',
      section,
      settings: {},
      error: 'Failed to load settings'
    });
  }
});

// POST endpoints for settings
app.post('/settings/ebay', isAuthenticated, (req, res) => {
  // Process eBay settings form submission
  res.redirect('/settings/ebay?success=true');
});

app.post('/settings/autods', isAuthenticated, (req, res) => {
  // Process AutoDS settings form submission
  res.redirect('/settings/autods?success=true');
});

app.post('/settings/system', isAuthenticated, (req, res) => {
  // Process system settings form submission
  res.redirect('/settings/system?success=true');
});

// API routes for AJAX operations
app.post('/api/messages/reply', isAuthenticated, (req, res) => {
  const { messageId, content } = req.body;
  // Process message reply
  res.json({ success: true });
});

app.post('/api/listings/add', isAuthenticated, (req, res) => {
  // Process add listing
  res.json({ success: true, id: Date.now() });
});

app.put('/api/listings/:id', isAuthenticated, (req, res) => {
  // Process update listing
  res.json({ success: true });
});

app.delete('/api/listings/:id', isAuthenticated, (req, res) => {
  // Process delete listing
  res.json({ success: true });
});

// 404 page
app.use((req, res) => {
  res.status(404).render('pages/notfound', { 
    user: req.session.user,
    page: 'notfound'
  });
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
}); 