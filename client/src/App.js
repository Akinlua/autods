import React, { useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Box } from '@mui/material';

// Layouts
import MainLayout from './components/layouts/MainLayout';

// Pages
import Dashboard from './pages/Dashboard';
import Listings from './pages/Listings';
import Messages from './pages/Messages';
import Settings from './pages/Settings';
import NotFound from './pages/NotFound';
import Login from './pages/Login';

// Settings sub-pages
import EbaySettings from './pages/settings/EbaySettings';
import AutodsSettings from './pages/settings/AutodsSettings';
import SystemSettings from './pages/settings/SystemSettings';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(localStorage.getItem('token') !== null);

  // Simple authentication
  const handleLogin = (token) => {
    localStorage.setItem('token', token);
    setIsAuthenticated(true);
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    setIsAuthenticated(false);
  };

  // Protected route component
  const ProtectedRoute = ({ children }) => {
    if (!isAuthenticated) {
      return <Navigate to="/login" />;
    }
    return children;
  };

  return (
    <div className="app-container">
      <Routes>
        {/* Public route */}
        <Route path="/login" element={<Login onLogin={handleLogin} />} />
        
        {/* Protected routes with main layout */}
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <MainLayout onLogout={handleLogout} />
            </ProtectedRoute>
          }
        >
          <Route index element={<Dashboard />} />
          <Route path="listings" element={<Listings />} />
          <Route path="messages" element={<Messages />} />
          
          {/* Settings routes */}
          <Route path="settings" element={<Settings />}>
            <Route index element={<Navigate to="/settings/ebay" replace />} />
            <Route path="ebay" element={<EbaySettings />} />
            <Route path="autods" element={<AutodsSettings />} />
            <Route path="system" element={<SystemSettings />} />
          </Route>
          
          {/* Not found */}
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </div>
  );
}

export default App; 