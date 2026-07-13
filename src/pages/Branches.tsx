import React from 'react';
import { useStore } from '../store/useStore';
import { Store, MapPin, Activity } from 'lucide-react';

const Branches = () => {
  const { branches } = useStore();

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-brand-dark">Manajemen Cabang</h1>
        <p className="text-gray-500 mt-1">Kelola operasional dan informasi cabang</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {branches.map(branch => (
          <div key={branch.id} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition-shadow">
            <div className="bg-brand-dark p-4 flex justify-between items-center">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Store className="w-5 h-5 text-brand-orange" />
                {branch.name}
              </h3>
              <span className={`px-2 py-1 rounded-full text-xs font-semibold ${branch.isActive ? 'bg-green-500/20 text-brand-green' : 'bg-red-500/20 text-red-400'}`}>
                {branch.isActive ? 'Aktif' : 'Non-aktif'}
              </span>
            </div>
            <div className="p-4 space-y-4">
              <div className="flex items-start gap-3 text-sm text-gray-600">
                <MapPin className="w-4 h-4 mt-0.5 text-gray-400" />
                <p>{branch.address}</p>
              </div>
              
              <div className="pt-4 border-t border-gray-100">
                <button className="w-full flex justify-center items-center gap-2 px-4 py-2 bg-gray-50 hover:bg-gray-100 text-gray-700 rounded-lg transition-colors text-sm font-medium border border-gray-200">
                  <Activity className="w-4 h-4 text-brand-orange" />
                  Lihat Log Stok
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Branches;
