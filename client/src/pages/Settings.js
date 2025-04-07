import React from 'react';
import { Box, Tabs, Tab, Typography, Paper } from '@mui/material';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';

const Settings = () => {
  const navigate = useNavigate();
  const location = useLocation();
  
  // Determine which tab is active
  const getTabValue = () => {
    const path = location.pathname;
    if (path.includes('/settings/ebay')) return 0;
    if (path.includes('/settings/autods')) return 1;
    if (path.includes('/settings/system')) return 2;
    return 0;
  };

  // Handle tab change
  const handleTabChange = (event, newValue) => {
    switch (newValue) {
      case 0:
        navigate('/settings/ebay');
        break;
      case 1:
        navigate('/settings/autods');
        break;
      case 2:
        navigate('/settings/system');
        break;
      default:
        navigate('/settings/ebay');
    }
  };

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Settings
      </Typography>
      
      <Paper sx={{ mb: 3 }}>
        <Tabs 
          value={getTabValue()} 
          onChange={handleTabChange}
          indicatorColor="primary"
          textColor="primary"
          variant="fullWidth"
        >
          <Tab label="eBay Settings" />
          <Tab label="AutoDS Settings" />
          <Tab label="System Settings" />
        </Tabs>
      </Paper>
      
      <Paper sx={{ p: 3 }}>
        <Outlet />
      </Paper>
    </Box>
  );
};

export default Settings; 