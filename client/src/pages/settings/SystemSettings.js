import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Button,
  Alert,
  CircularProgress,
  Grid,
  Paper,
  Switch,
  FormControlLabel,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Slider,
  Divider,
  TextField,
} from '@mui/material';
import { Save as SaveIcon, CleaningServices as CleanIcon } from '@mui/icons-material';

const SystemSettings = () => {
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState({
    darkMode: false,
    notificationsEnabled: true,
    autoUpdate: true,
    logLevel: 'info',
    dataRetention: 30,
    clearDataOnExit: false,
    backupInterval: 24,
    language: 'en',
  });
  
  const [saveStatus, setSaveStatus] = useState(null); // null, 'success', 'error'
  const [cacheSizeKB, setCacheSizeKB] = useState(2048);

  // Fetch settings from API
  useEffect(() => {
    // Simulate API call
    setTimeout(() => {
      // Mock data - in a real app, fetch from your backend
      setSettings({
        darkMode: false,
        notificationsEnabled: true,
        autoUpdate: true,
        logLevel: 'info',
        dataRetention: 30,
        clearDataOnExit: false,
        backupInterval: 24,
        language: 'en',
      });
      setCacheSizeKB(2048);
      setLoading(false);
    }, 1000);
  }, []);

  // Handle form change
  const handleChange = (e) => {
    const { name, value, checked } = e.target;
    setSettings({
      ...settings,
      [name]: ['darkMode', 'notificationsEnabled', 'autoUpdate', 'clearDataOnExit'].includes(name) 
        ? checked 
        : value,
    });
  };
  
  // Handle slider change
  const handleSliderChange = (name) => (event, newValue) => {
    setSettings({
      ...settings,
      [name]: newValue,
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

  // Handle clearing cache
  const handleClearCache = () => {
    if (window.confirm('Are you sure you want to clear the application cache?')) {
      setLoading(true);
      
      // Simulate API call to clear cache
      setTimeout(() => {
        setCacheSizeKB(0);
        setLoading(false);
        setSaveStatus('success');
        
        // Clear status after 3 seconds
        setTimeout(() => setSaveStatus(null), 3000);
      }, 1500);
    }
  };

  if (loading && !settings.language) {
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
        Interface Settings
      </Typography>
      <Paper sx={{ p: 3, mb: 4 }}>
        <Grid container spacing={3}>
          <Grid item xs={12}>
            <FormControlLabel
              control={
                <Switch
                  checked={settings.darkMode}
                  onChange={handleChange}
                  name="darkMode"
                />
              }
              label="Dark Mode"
            />
          </Grid>
          <Grid item xs={12} md={6}>
            <FormControl fullWidth>
              <InputLabel id="language-label">Language</InputLabel>
              <Select
                labelId="language-label"
                name="language"
                value={settings.language}
                label="Language"
                onChange={handleChange}
              >
                <MenuItem value="en">English</MenuItem>
                <MenuItem value="es">Spanish</MenuItem>
                <MenuItem value="fr">French</MenuItem>
                <MenuItem value="de">German</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12}>
            <FormControlLabel
              control={
                <Switch
                  checked={settings.notificationsEnabled}
                  onChange={handleChange}
                  name="notificationsEnabled"
                />
              }
              label="Enable Desktop Notifications"
            />
          </Grid>
        </Grid>
      </Paper>
      
      <Typography variant="h5" gutterBottom>
        Data Management
      </Typography>
      <Paper sx={{ p: 3, mb: 4 }}>
        <Grid container spacing={3}>
          <Grid item xs={12}>
            <Typography gutterBottom>Data Retention Period (days)</Typography>
            <Slider
              value={settings.dataRetention}
              onChange={handleSliderChange('dataRetention')}
              aria-labelledby="data-retention-slider"
              valueLabelDisplay="auto"
              step={1}
              marks={[
                { value: 7, label: '7d' },
                { value: 30, label: '30d' },
                { value: 90, label: '90d' },
                { value: 365, label: '1y' },
              ]}
              min={1}
              max={365}
            />
          </Grid>
          <Grid item xs={12}>
            <FormControlLabel
              control={
                <Switch
                  checked={settings.clearDataOnExit}
                  onChange={handleChange}
                  name="clearDataOnExit"
                />
              }
              label="Clear sensitive data on application exit"
            />
          </Grid>
          <Grid item xs={12} md={6}>
            <TextField
              fullWidth
              label="Backup Interval (hours)"
              name="backupInterval"
              type="number"
              value={settings.backupInterval}
              onChange={handleChange}
              InputProps={{
                inputProps: { min: 1, max: 168 }
              }}
            />
          </Grid>
          <Grid item xs={12}>
            <Divider sx={{ my: 2 }} />
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Box>
                <Typography variant="subtitle1">Application Cache</Typography>
                <Typography variant="body2" color="text.secondary">
                  Current cache size: {(cacheSizeKB / 1024).toFixed(2)} MB
                </Typography>
              </Box>
              <Button
                variant="outlined"
                color="secondary"
                startIcon={<CleanIcon />}
                onClick={handleClearCache}
                disabled={cacheSizeKB === 0}
              >
                Clear Cache
              </Button>
            </Box>
          </Grid>
        </Grid>
      </Paper>
      
      <Typography variant="h5" gutterBottom>
        Advanced Settings
      </Typography>
      <Paper sx={{ p: 3, mb: 4 }}>
        <Grid container spacing={3}>
          <Grid item xs={12} md={6}>
            <FormControl fullWidth>
              <InputLabel id="log-level-label">Log Level</InputLabel>
              <Select
                labelId="log-level-label"
                name="logLevel"
                value={settings.logLevel}
                label="Log Level"
                onChange={handleChange}
              >
                <MenuItem value="error">Error Only</MenuItem>
                <MenuItem value="warn">Warning</MenuItem>
                <MenuItem value="info">Information</MenuItem>
                <MenuItem value="debug">Debug</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12}>
            <FormControlLabel
              control={
                <Switch
                  checked={settings.autoUpdate}
                  onChange={handleChange}
                  name="autoUpdate"
                />
              }
              label="Automatically check for updates"
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

export default SystemSettings; 