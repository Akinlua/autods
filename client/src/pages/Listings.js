import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Paper,
  Button,
  Chip,
  CircularProgress,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Grid,
  IconButton,
  Tooltip,
} from '@mui/material';
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  Edit as EditIcon,
  Refresh as RefreshIcon,
  Visibility as VisibilityIcon,
} from '@mui/icons-material';
import { DataGrid } from '@mui/x-data-grid';
import { format } from 'date-fns';

// Mock data for demonstration
const mockListings = [
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

const Listings = () => {
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [openDialog, setOpenDialog] = useState(false);
  const [selectedListing, setSelectedListing] = useState(null);
  const [dialogMode, setDialogMode] = useState('view'); // 'view', 'edit', 'add'
  const [formData, setFormData] = useState({
    title: '',
    price: '',
    cost: '',
    stock: '',
    sku: '',
  });

  // Fetch listings data
  useEffect(() => {
    const fetchListings = async () => {
      try {
        // In a real app, you would fetch data from your API
        // const response = await fetch('/api/listings');
        // const data = await response.json();
        
        // For now, we'll use mock data
        setTimeout(() => {
          setListings(mockListings);
          setLoading(false);
        }, 1000);
      } catch (err) {
        setError('Failed to load listings');
        setLoading(false);
      }
    };

    fetchListings();
  }, []);

  // Handle dialog open
  const handleOpenDialog = (mode, listing = null) => {
    setDialogMode(mode);
    setSelectedListing(listing);
    
    if (mode === 'view' || mode === 'edit') {
      setFormData({
        title: listing.title,
        price: listing.price,
        cost: listing.cost,
        stock: listing.stock,
        sku: listing.sku,
      });
    } else {
      setFormData({
        title: '',
        price: '',
        cost: '',
        stock: '',
        sku: '',
      });
    }
    
    setOpenDialog(true);
  };

  // Handle dialog close
  const handleCloseDialog = () => {
    setOpenDialog(false);
  };

  // Handle form input change
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData({
      ...formData,
      [name]: value,
    });
  };

  // Handle form submission
  const handleSubmit = (e) => {
    e.preventDefault();
    
    // In a real app, you would send data to your API
    if (dialogMode === 'add') {
      // Add new listing
      const newListing = {
        id: listings.length + 1,
        autodsId: `AUTO-${Math.floor(Math.random() * 1000)}`,
        ebayListingId: `EBAY-${Math.floor(Math.random() * 1000)}`,
        sku: formData.sku || `SKU-${Math.floor(Math.random() * 1000)}`,
        title: formData.title,
        price: parseFloat(formData.price),
        cost: parseFloat(formData.cost),
        stock: parseInt(formData.stock),
        active: true,
        listedAt: new Date(),
      };
      
      setListings([...listings, newListing]);
    } else if (dialogMode === 'edit') {
      // Update existing listing
      const updatedListings = listings.map((listing) => {
        if (listing.id === selectedListing.id) {
          return {
            ...listing,
            title: formData.title,
            price: parseFloat(formData.price),
            cost: parseFloat(formData.cost),
            stock: parseInt(formData.stock),
            sku: formData.sku,
          };
        }
        return listing;
      });
      
      setListings(updatedListings);
    }
    
    handleCloseDialog();
  };

  // Handle listing deletion
  const handleDeleteListing = (id) => {
    if (window.confirm('Are you sure you want to delete this listing?')) {
      // In a real app, you would send a delete request to your API
      const updatedListings = listings.filter((listing) => listing.id !== id);
      setListings(updatedListings);
    }
  };

  // Handle listing refresh
  const handleRefreshListings = () => {
    setLoading(true);
    
    // In a real app, you would fetch fresh data from your API
    setTimeout(() => {
      setListings(mockListings);
      setLoading(false);
    }, 1000);
  };

  // Define columns for the data grid
  const columns = [
    { field: 'id', headerName: 'ID', width: 70 },
    { field: 'autodsId', headerName: 'AutoDS ID', width: 120 },
    { field: 'ebayListingId', headerName: 'eBay ID', width: 120 },
    { field: 'sku', headerName: 'SKU', width: 120 },
    { field: 'title', headerName: 'Title', width: 250 },
    { 
      field: 'price', 
      headerName: 'Price', 
      width: 100,
      valueFormatter: (params) => `$${params.value.toFixed(2)}`,
    },
    { 
      field: 'cost', 
      headerName: 'Cost', 
      width: 100,
      valueFormatter: (params) => `$${params.value.toFixed(2)}`,
    },
    { field: 'stock', headerName: 'Stock', width: 100 },
    { 
      field: 'active', 
      headerName: 'Status', 
      width: 120,
      renderCell: (params) => (
        <Chip 
          label={params.value ? 'Active' : 'Inactive'} 
          color={params.value ? 'success' : 'error'} 
          size="small" 
        />
      ),
    },
    { 
      field: 'listedAt', 
      headerName: 'Listed Date', 
      width: 150,
      valueFormatter: (params) => format(new Date(params.value), 'MMM d, yyyy'),
    },
    {
      field: 'actions',
      headerName: 'Actions',
      width: 150,
      sortable: false,
      renderCell: (params) => (
        <Box>
          <Tooltip title="View">
            <IconButton 
              size="small" 
              onClick={() => handleOpenDialog('view', params.row)}
            >
              <VisibilityIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Edit">
            <IconButton 
              size="small" 
              onClick={() => handleOpenDialog('edit', params.row)}
            >
              <EditIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Delete">
            <IconButton 
              size="small" 
              onClick={() => handleDeleteListing(params.row.id)}
            >
              <DeleteIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
      ),
    },
  ];

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4">
          eBay Listings
        </Typography>
        <Box>
          <Button
            variant="outlined"
            startIcon={<RefreshIcon />}
            onClick={handleRefreshListings}
            sx={{ mr: 1 }}
          >
            Refresh
          </Button>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => handleOpenDialog('add')}
          >
            Add Listing
          </Button>
        </Box>
      </Box>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '50vh' }}>
          <CircularProgress />
        </Box>
      ) : error ? (
        <Alert severity="error">{error}</Alert>
      ) : (
        <Paper sx={{ height: 600, width: '100%' }}>
          <DataGrid
            rows={listings}
            columns={columns}
            pageSize={10}
            rowsPerPageOptions={[10, 25, 50]}
            checkboxSelection
            disableSelectionOnClick
            disableColumnMenu
          />
        </Paper>
      )}

      {/* Listing Dialog */}
      <Dialog 
        open={openDialog} 
        onClose={handleCloseDialog}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          {dialogMode === 'view' ? 'View Listing' : dialogMode === 'edit' ? 'Edit Listing' : 'Add New Listing'}
        </DialogTitle>
        <DialogContent>
          <Box component="form" onSubmit={handleSubmit} sx={{ mt: 2 }}>
            <Grid container spacing={2}>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="Title"
                  name="title"
                  value={formData.title}
                  onChange={handleInputChange}
                  disabled={dialogMode === 'view'}
                  required
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="Price"
                  name="price"
                  type="number"
                  value={formData.price}
                  onChange={handleInputChange}
                  disabled={dialogMode === 'view'}
                  required
                  InputProps={{
                    startAdornment: '$',
                  }}
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="Cost"
                  name="cost"
                  type="number"
                  value={formData.cost}
                  onChange={handleInputChange}
                  disabled={dialogMode === 'view'}
                  required
                  InputProps={{
                    startAdornment: '$',
                  }}
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="Stock"
                  name="stock"
                  type="number"
                  value={formData.stock}
                  onChange={handleInputChange}
                  disabled={dialogMode === 'view'}
                  required
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="SKU"
                  name="sku"
                  value={formData.sku}
                  onChange={handleInputChange}
                  disabled={dialogMode === 'view'}
                />
              </Grid>
              
              {dialogMode === 'view' && selectedListing && (
                <>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      fullWidth
                      label="AutoDS ID"
                      value={selectedListing.autodsId}
                      disabled
                    />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      fullWidth
                      label="eBay ID"
                      value={selectedListing.ebayListingId}
                      disabled
                    />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      fullWidth
                      label="Listed Date"
                      value={format(new Date(selectedListing.listedAt), 'MMM d, yyyy')}
                      disabled
                    />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      fullWidth
                      label="Status"
                      value={selectedListing.active ? 'Active' : 'Inactive'}
                      disabled
                    />
                  </Grid>
                  {!selectedListing.active && selectedListing.endedAt && (
                    <>
                      <Grid item xs={12} sm={6}>
                        <TextField
                          fullWidth
                          label="Ended Date"
                          value={format(new Date(selectedListing.endedAt), 'MMM d, yyyy')}
                          disabled
                        />
                      </Grid>
                      <Grid item xs={12} sm={6}>
                        <TextField
                          fullWidth
                          label="End Reason"
                          value={selectedListing.endReason || 'N/A'}
                          disabled
                        />
                      </Grid>
                    </>
                  )}
                </>
              )}
            </Grid>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog}>
            {dialogMode === 'view' ? 'Close' : 'Cancel'}
          </Button>
          {dialogMode !== 'view' && (
            <Button onClick={handleSubmit} variant="contained">
              {dialogMode === 'edit' ? 'Update' : 'Add'}
            </Button>
          )}
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default Listings; 