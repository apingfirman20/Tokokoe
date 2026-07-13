import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import POS from './pages/POS';
import Products from './pages/Products';
import Branches from './pages/Branches';
import ShiftManager from './pages/Shift';
import Users from './pages/Users';
import StockTransferPage from './pages/StockTransfer';
import ActivityLogPage from './pages/ActivityLog';
import SettingsPage from './pages/Settings';
import { useStore } from './store/useStore';
import { initFirebaseSync } from './lib/firestore';

function App() {
  const currentUser = useStore(state => state.currentUser);

  useEffect(() => {
    // Start listening to Firestore real-time updates
    const unsubscribe = initFirebaseSync();
    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={!currentUser ? <Login /> : <Navigate to="/" />} />
        
        <Route path="/" element={currentUser ? <Layout /> : <Navigate to="/login" />}>
          {/* Owner & Admin Routes */}
          {(currentUser?.role === 'owner' || currentUser?.role === 'admin') && (
            <>
              <Route index element={<Dashboard />} />
              <Route path="products" element={<Products />} />
              {currentUser?.role === 'owner' && (
                <>
                  <Route path="branches" element={<Branches />} />
                  <Route path="users" element={<Users />} />
                  <Route path="activity" element={<ActivityLogPage />} />
                </>
              )}
            </>
          )}

          {/* Kasir Routes */}
          {currentUser?.role === 'kasir' && (
            <>
              <Route index element={<Navigate to="/pos" />} />
              <Route path="pos" element={<POS />} />
            </>
          )}

          {/* Common Routes */}
          <Route path="shift" element={<ShiftManager />} />
          <Route path="transfer" element={<StockTransferPage />} />
          <Route path="settings" element={<SettingsPage />} />
          
          <Route path="*" element={<Navigate to="/" />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
