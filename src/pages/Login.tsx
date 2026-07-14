import React, { useState } from 'react';
import { useStore } from '../store/useStore';
import { ShoppingCart, User, Lock } from 'lucide-react';

const Login = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const { login, users, branches, addUser } = useStore();

  // Auto-seed if empty for testing
  React.useEffect(() => {
    if (users.length === 0) {
      console.log('Seeding dummy users for testing...');
      addUser({ id: 'u1', username: 'owner', password: '123', name: 'Owner System', role: 'owner' });
      addUser({ id: 'u2', username: 'admin1', password: '123', name: 'Admin Cabang 1', role: 'admin', branchId: 'b1' });
      addUser({ id: 'u3', username: 'kasir1', password: '123', name: 'Kasir Cabang 1', role: 'kasir', branchId: 'b1' });
    }
  }, [users.length, addUser]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setError('Username dan password tidak boleh kosong');
      return;
    }
    
    const success = login(username.trim(), password.trim());
    if (!success) {
      setError('Username atau password salah.');
    }
  };

  return (
    <div className="min-h-screen bg-brand-light flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
        <div className="bg-brand-dark p-8 text-center flex flex-col items-center">
          <div className="w-24 h-24 mb-4 bg-white/5 p-2 rounded-2xl border border-white/10 shadow-lg">
            <img src="/logo.png" alt="TokoKoe Logo" className="w-full h-full object-contain" />
          </div>
          <h1 className="text-3xl font-bold text-[#d4af37]">TokoKoe</h1>
          <p className="text-gray-400 mt-2">Premium Retail POS</p>
        </div>
        
        <div className="p-8">
          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div className="p-3 bg-red-100 text-red-700 rounded-lg text-sm">
                {error}
              </div>
            )}
            
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">Username</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <User className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="pl-10 w-full p-3 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#d4af37] focus:border-transparent transition-all outline-none"
                  placeholder="Masukkan username..."
                />
              </div>
              <p className="text-xs text-gray-500 mt-1">Hint: owner, admin1, kasir1, kasir2</p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">Password</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-10 w-full p-3 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#d4af37] focus:border-transparent transition-all outline-none"
                  placeholder="Masukkan password..."
                />
              </div>
            </div>

            <button
              type="submit"
              className="w-full bg-[#d4af37] hover:bg-[#c5a030] text-brand-dark font-bold py-3 px-4 rounded-xl shadow-lg transition-colors duration-200"
            >
              Masuk
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default Login;
