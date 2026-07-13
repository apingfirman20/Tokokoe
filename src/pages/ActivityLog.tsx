import React from 'react';
import { useStore } from '../store/useStore';
import { FileText, ArrowRightLeft, UserPlus, ShoppingCart, KeyRound, AlertCircle } from 'lucide-react';

const ActivityLogPage = () => {
  const { activityLogs, users, branches } = useStore();

  const getIcon = (action: string) => {
    if (action.includes('transfer')) return <ArrowRightLeft className="w-5 h-5 text-blue-500" />;
    if (action.includes('user')) return <UserPlus className="w-5 h-5 text-green-500" />;
    if (action.includes('shift')) return <KeyRound className="w-5 h-5 text-orange-500" />;
    if (action.includes('sold')) return <ShoppingCart className="w-5 h-5 text-brand-green" />;
    return <FileText className="w-5 h-5 text-gray-500" />;
  };

  // Sort logs by newest
  const sortedLogs = [...activityLogs].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-brand-dark">Log Aktivitas</h1>
          <p className="text-gray-500 mt-1">Rekam jejak seluruh aktivitas di sistem</p>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-4 border-b border-gray-100 bg-gray-50 flex gap-4">
          <input type="text" placeholder="Cari aktivitas..." className="flex-1 p-2 border rounded-lg outline-none focus:border-brand-green text-sm" />
          <select className="p-2 border rounded-lg outline-none focus:border-brand-green text-sm bg-white">
            <option value="">Semua Cabang</option>
            {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <select className="p-2 border rounded-lg outline-none focus:border-brand-green text-sm bg-white">
            <option value="">Semua User</option>
            {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </div>
        
        {sortedLogs.length === 0 ? (
          <div className="p-10 text-center text-gray-500 flex flex-col items-center">
            <AlertCircle className="w-12 h-12 mb-3 opacity-20" />
            <p>Belum ada aktivitas tercatat.</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {sortedLogs.map(log => {
              const user = users.find(u => u.id === log.userId);
              const branch = branches.find(b => b.id === log.branchId);
              
              return (
                <div key={log.id} className="p-4 hover:bg-gray-50 flex items-start gap-4">
                  <div className="p-2 bg-white rounded-lg shadow-sm border border-gray-100 mt-1">
                    {getIcon(log.action)}
                  </div>
                  <div className="flex-1">
                    <div className="flex justify-between items-start mb-1">
                      <p className="font-semibold text-brand-dark">
                        {user?.name || 'Unknown User'} <span className="text-gray-400 font-normal">di {branch?.name || 'Unknown Branch'}</span>
                      </p>
                      <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">
                        {new Date(log.timestamp).toLocaleString('id-ID')}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600">{log.description}</p>
                    <div className="mt-2 text-xs font-mono text-gray-400 uppercase">
                      Action: {log.action}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default ActivityLogPage;
