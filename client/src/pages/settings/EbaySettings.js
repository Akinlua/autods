import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  TextField,
  Button,
  Alert,
  CircularProgress,
  Grid,
  Paper,
  Divider,
  Switch,
  FormControlLabel,
  InputAdornment,
  IconButton,
} from '@mui/material';
import { Visibility, VisibilityOff, Save as SaveIcon, Link as LinkIcon } from '@mui/icons-material';

const EbaySettings = () => {
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState({
    clientId: '',
    clientSecret: '',
    ruName: '',
    connected: false,
    autoRefresh: true,
    defaultCategory: '1',
    defaultShippingMethod: 'Standard',
    defaultLocation: 'US',
  });
  
  const [showSecret, setShowSecret] = useState(false);
  const [saveStatus, setSaveStatus] = useState(null); // null, 'success', 'error'

  // Fetch settings from API
  useEffect(() => {
    // Simulate API call
    setTimeout(() => {
      // Mock data - in a real app, fetch from your backend
      setSettings({
        clientId: 'ebay-app-12345',
        clientSecret: 's3cr3t-k3y-456',
        ruName: 'eBay-MyApp-PRD-12345abc-12345abc',
        connected: true,
        autoRefresh: true,
        defaultCategory: '15032',
        defaultShippingMethod: 'Economy',
        defaultLocation: 'US',
      });
      setLoading(false);
    }, 1000);
  }, []);

  // Handle form change
  const handleChange = (e) => {
    const { name, value, checked } = e.target;
    setSettings({
      ...settings,
      [name]: name === 'autoRefresh' ? checked : value,
    });
  };

  // Handle eBay connection
  const handleConnectEbay = () => {
    setLoading(true);
    
    // Simulate API call to connect to eBay
    setTimeout(() => {
      setSettings({
        ...settings,
        connected: true,
      });
      setLoading(false);
      setSaveStatus('success');
      
      // Clear status after 3 seconds
      setTimeout(() => setSaveStatus(null), 3000);
    }, 1500);
  };
  
  // Handle form submission
  const handleSubmit = (e) => {
    e.preventDefault();
    setSaveStatus(null);
    setLoading(true);
    
    // Simulate API call to save settings
    setTimeout(() => {
      setLoading(false);
      setSaveStatus('success');
      
      // Clear status after 3 seconds
      setTimeout(() => setSaveStatus(null), 3000);
    }, 1000);
  };

  // Toggle client secret visibility
  const handleToggleSecretVisibility = () => {
    setShowSecret(!showSecret);
  };

  if (loading && !settings.clientId) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box component="form" onSubmit={handleSubmit}>
      {saveStatus === 'success' && (
        <Alert severity="success" sx={{ mb: 3 }}>
          Settings saved successfully!
        </Alert>
      )}
      
      {saveStatus === 'error' && (
        <Alert severity="error" sx={{ mb: 3 }}>
          Failed to save settings. Please try again.
        </Alert>
      )}
      
      <Typography variant="h5" gutterBottom>
        eBay API Configuration
      </Typography>
      <Paper sx={{ p: 3, mb: 4 }}>
        <Grid container spacing={3}>
          <Grid item xs={12} md={6}>
            <TextField
              fullWidth
              label="Client ID"
              name="clientId"
              value={settings.clientId}
              onChange={handleChange}
              required
              disabled={settings.connected}
            />
          </Grid>
          <Grid item xs={12} md={6}>
            <TextField
              fullWidth
              label="Client Secret"
              name="clientSecret"
              type={showSecret ? 'text' : 'password'}
              value={settings.clientSecret}
              onChange={handleChange}
              required
              disabled={settings.connected}
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      onClick={handleToggleSecretVisibility}
                      edge="end"
                    >
                      {showSecret ? <VisibilityOff /> : <Visibility />}
                    </IconButton>
                  </InputAdornment>
                )
              }}
            />
          </Grid>
          <Grid item xs={12}>
            <TextField
              fullWidth
              label="Redirect URI Name (RuName)"
              name="ruName"
              value={settings.ruName}
              onChange={handleChange}
              required
              disabled={settings.connected}
            />
          </Grid>
          <Grid item xs={12}>
            <Box sx={{ display: 'flex', gap: 2 }}>
              <Button
                variant="contained"
                color={settings.connected ? "success" : "primary"}
                startIcon={<LinkIcon />}
                onClick={handleConnectEbay}
                disabled={loading || (!settings.clientId || !settings.clientSecret || !settings.ruName)}
              >
                {settings.connected ? "Connected to eBay" : "Connect to eBay"}
              </Button>
              
              {settings.connected && (
                <Button
                  variant="outlined"
                  color="error"
                  onClick={() => {
                    setSettings({
                      ...settings,
                      connected: false
                    });
                  }}
                >
                  Disconnect
                </Button>
              )}
            </Box>
          </Grid>
        </Grid>
      </Paper>
      
      <Typography variant="h5" gutterBottom>
        Default Listing Settings
      </Typography>
      <Paper sx={{ p: 3, mb: 4 }}>
        <Grid container spacing={3}>
          <Grid item xs={12} md={6}>
            <TextField
              fullWidth
              label="Default Category ID"
              name="defaultCategory"
              value={settings.defaultCategory}
              onChange={handleChange}
              helperText="eBay category ID for new listings"
            />
          </Grid>
          <Grid item xs={12} md={6}>
            <TextField
              fullWidth
              label="Default Shipping Method"
              name="defaultShippingMethod"
              value={settings.defaultShippingMethod}
              onChange={handleChange}
            />
          </Grid>
          <Grid item xs={12} md={6}>
            <TextField
              fullWidth
              label="Default Item Location"
              name="defaultLocation"
              value={settings.defaultLocation}
              onChange={handleChange}
            />
          </Grid>
          <Grid item xs={12}>
            <FormControlLabel
              control={
                <Switch
                  checked={settings.autoRefresh}
                  onChange={handleChange}
                  name="autoRefresh"
                />
              }
              label="Automatically refresh token when expired"
            />
          </Grid>
        </Grid>
      </Paper>
      
      <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Button
          type="submit"
          variant="contained"
          startIcon={<SaveIcon />}
          disabled={loading}
        >
          {loading ? <CircularProgress size={24} /> : 'Save Settings'}
        </Button>
      </Box>
    </Box>
  );
};

export default EbaySettings; 