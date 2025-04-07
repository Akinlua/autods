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
  Switch,
  FormControlLabel,
  InputAdornment,
  IconButton,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
} from '@mui/material';
import { Visibility, VisibilityOff, Save as SaveIcon } from '@mui/icons-material';

const AutodsSettings = () => {
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState({
    apiKey: '',
    apiSecret: '',
    connected: false,
    autoSync: true,
    syncInterval: 30,
    importDrafts: true,
    profitMargin: 15,
    pricingStrategy: 'percentage',
  });
  
  const [showSecret, setShowSecret] = useState(false);
  const [saveStatus, setSaveStatus] = useState(null); // null, 'success', 'error'

  // Fetch settings from API
  useEffect(() => {
    // Simulate API call
    setTimeout(() => {
      // Mock data - in a real app, fetch from your backend
      setSettings({
        apiKey: 'autods-api-12345',
        apiSecret: 'autods-secret-67890',
        connected: true,
        autoSync: true,
        syncInterval: 60,
        importDrafts: false,
        profitMargin: 20,
        pricingStrategy: 'percentage',
      });
      setLoading(false);
    }, 1000);
  }, []);

  // Handle form change
  const handleChange = (e) => {
    const { name, value, checked } = e.target;
    setSettings({
      ...settings,
      [name]: name === 'autoSync' || name === 'importDrafts' ? checked : value,
    });
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

  // Toggle API secret visibility
  const handleToggleSecretVisibility = () => {
    setShowSecret(!showSecret);
  };

  if (loading && !settings.apiKey) {
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
        AutoDS API Configuration
      </Typography>
      <Paper sx={{ p: 3, mb: 4 }}>
        <Grid container spacing={3}>
          <Grid item xs={12} md={6}>
            <TextField
              fullWidth
              label="API Key"
              name="apiKey"
              value={settings.apiKey}
              onChange={handleChange}
              required
            />
          </Grid>
          <Grid item xs={12} md={6}>
            <TextField
              fullWidth
              label="API Secret"
              name="apiSecret"
              type={showSecret ? 'text' : 'password'}
              value={settings.apiSecret}
              onChange={handleChange}
              required
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
            <Alert severity={settings.connected ? "success" : "info"}>
              {settings.connected ? 
                "Your AutoDS account is connected and working properly." : 
                "Enter your AutoDS API credentials to connect your account."
              }
            </Alert>
          </Grid>
        </Grid>
      </Paper>
      
      <Typography variant="h5" gutterBottom>
        Synchronization Settings
      </Typography>
      <Paper sx={{ p: 3, mb: 4 }}>
        <Grid container spacing={3}>
          <Grid item xs={12}>
            <FormControlLabel
              control={
                <Switch
                  checked={settings.autoSync}
                  onChange={handleChange}
                  name="autoSync"
                />
              }
              label="Automatically synchronize products with AutoDS"
            />
          </Grid>
          <Grid item xs={12} md={6}>
            <TextField
              fullWidth
              label="Sync Interval (minutes)"
              name="syncInterval"
              type="number"
              value={settings.syncInterval}
              onChange={handleChange}
              disabled={!settings.autoSync}
              InputProps={{
                inputProps: { min: 5, max: 1440 }
              }}
            />
          </Grid>
          <Grid item xs={12}>
            <FormControlLabel
              control={
                <Switch
                  checked={settings.importDrafts}
                  onChange={handleChange}
                  name="importDrafts"
                />
              }
              label="Import draft products from AutoDS"
            />
          </Grid>
        </Grid>
      </Paper>
      
      <Typography variant="h5" gutterBottom>
        Pricing Settings
      </Typography>
      <Paper sx={{ p: 3, mb: 4 }}>
        <Grid container spacing={3}>
          <Grid item xs={12} md={6}>
            <FormControl fullWidth>
              <InputLabel id="pricing-strategy-label">Pricing Strategy</InputLabel>
              <Select
                labelId="pricing-strategy-label"
                name="pricingStrategy"
                value={settings.pricingStrategy}
                label="Pricing Strategy"
                onChange={handleChange}
              >
                <MenuItem value="percentage">Percentage Markup</MenuItem>
                <MenuItem value="fixed">Fixed Amount Markup</MenuItem>
                <MenuItem value="tiered">Tiered Pricing</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} md={6}>
            <TextField
              fullWidth
              label="Default Profit Margin (%)"
              name="profitMargin"
              type="number"
              value={settings.profitMargin}
              onChange={handleChange}
              InputProps={{
                inputProps: { min: 1, max: 500 },
                endAdornment: <InputAdornment position="end">%</InputAdornment>,
              }}
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

export default AutodsSettings; 