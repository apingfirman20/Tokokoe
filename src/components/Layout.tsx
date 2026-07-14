import React from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { useStore } from '../store/useStore';
import { LogOut, LayoutDashboard, ShoppingCart, Package, Store, Users, ArrowRightLeft, FileText, Settings } from 'lucide-react';
import clsx from 'clsx';

const Layout = () => {
  const { currentUser, logout } = useStore();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const navItems = [
    { name: 'Dashboard', icon: LayoutDashboard, path: '/', roles: ['owner', 'admin'] },
    { name: 'Kasir (POS)', icon: ShoppingCart, path: '/pos', roles: ['kasir'] },
    { name: 'Manajemen Shift', icon: ShoppingCart, path: '/shift', roles: ['kasir', 'admin', 'owner'] },
    { name: 'Produk', icon: Package, path: '/products', roles: ['owner', 'admin'] },
    { name: 'Cabang', icon: Store, path: '/branches', roles: ['owner'] },
    { name: 'Pegawai', icon: Users, path: '/users', roles: ['owner'] },
    { name: 'Transfer Stok', icon: ArrowRightLeft, path: '/transfer', roles: ['kasir', 'admin', 'owner'] },
    { name: 'Log Aktivitas', icon: FileText, path: '/activity', roles: ['owner'] },
    { name: 'Pengaturan', icon: Settings, path: '/settings', roles: ['kasir', 'admin', 'owner'] },
  ];

  const allowedNavItems = navItems.filter(item => item.roles.includes(currentUser?.role || ''));

  return (
    <div className="flex h-screen bg-brand-light">
      {/* Sidebar */}
      <aside className="w-64 bg-brand-dark text-white flex flex-col">
        <div className="p-6">
          <div className="flex items-center gap-3 mb-3">
            <img src="/logo.png" alt="TokoKoe Logo" className="w-11 h-11 rounded-lg object-contain" />
            <div>
              <h1 className="text-lg font-bold text-[#d4af37]">TokoKoe</h1>
              <p className="text-[10px] tracking-widest uppercase text-gray-400 font-medium">Premium Retail POS</p>
            </div>
          </div>
          <div className="mt-2 text-sm text-gray-400 bg-white/5 rounded-lg px-3 py-2">
            {currentUser?.name} <span className="text-[#d4af37] font-medium">({currentUser?.role})</span>
          </div>
        </div>
        
        <nav className="flex-1 px-4 space-y-2 mt-4">
          {allowedNavItems.map((item) => (
            <button
              key={item.name}
              onClick={() => navigate(item.path)}
              className="flex items-center gap-3 w-full px-4 py-3 text-left rounded-lg hover:bg-[#d4af37]/10 hover:text-[#d4af37] transition-colors"
            >
              <item.icon className="w-5 h-5 text-[#d4af37]" />
              {item.name}
            </button>
          ))}
        </nav>

        <div className="p-4 border-t border-gray-800">
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 w-full px-4 py-3 text-left rounded-lg hover:bg-red-500/10 text-red-400 transition-colors"
          >
            <LogOut className="w-5 h-5" />
            Logout
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
};

export default Layout;
