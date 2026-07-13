import React, { useState } from 'react';
import { useStore } from '../store/useStore';
import { Plus, Trash2, Edit2, KeyRound } from 'lucide-react';
import type { User, Role } from '../types';

const Users = () => {
  const { users, branches, addUser, updateUser, deleteUser, currentUser } = useStore();
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [formData, setFormData] = useState<{username: string; password?: string; name: string; role: Role; branchId: string}>({
    username: '',
    password: '',
    name: '',
    role: 'kasir',
    branchId: ''
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingId) {
      updateUser({ ...formData, id: editingId });
    } else {
      addUser({ ...formData, password: formData.password || '123456', id: `u${Date.now()}` });
    }
    setShowModal(false);
    setEditingId(null);
    setFormData({ username: '', password: '', name: '', role: 'kasir', branchId: '' });
  };

  const handleEdit = (user: User) => {
    setFormData({ username: user.username, password: user.password || '', name: user.name, role: user.role, branchId: user.branchId || '' });
    setEditingId(user.id);
    setShowModal(true);
  };

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-brand-dark">Manajemen Pegawai</h1>
          <p className="text-gray-500 mt-1">Kelola akun kasir dan admin cabang</p>
        </div>
        <button 
          onClick={() => {
            setEditingId(null);
            setFormData({ username: '', password: '', name: '', role: 'kasir', branchId: branches[0]?.id || '' });
            setShowModal(true);
          }}
          className="flex items-center gap-2 bg-brand-green text-white px-4 py-2 rounded-lg hover:bg-green-600 transition-colors"
        >
          <Plus className="w-5 h-5" />
          Tambah Pegawai
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
              <th className="p-4 font-semibold text-gray-600">Nama</th>
              <th className="p-4 font-semibold text-gray-600">Username</th>
              <th className="p-4 font-semibold text-gray-600">Peran</th>
              <th className="p-4 font-semibold text-gray-600">Cabang</th>
              <th className="p-4 font-semibold text-gray-600 w-24 text-center">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {users.map(user => (
              <tr key={user.id} className="border-b border-gray-50 hover:bg-gray-50">
                <td className="p-4 font-medium">{user.name}</td>
                <td className="p-4 text-gray-600">{user.username}</td>
                <td className="p-4">
                  <span className={`px-2 py-1 rounded-md text-xs font-bold uppercase tracking-wider ${
                    user.role === 'owner' ? 'bg-purple-100 text-purple-700' :
                    user.role === 'admin' ? 'bg-blue-100 text-blue-700' :
                    'bg-green-100 text-green-700'
                  }`}>
                    {user.role}
                  </span>
                </td>
                <td className="p-4 text-gray-600">
                  {user.branchId ? branches.find(b => b.id === user.branchId)?.name : 'Semua Cabang'}
                </td>
                <td className="p-4 text-center">
                  {user.role !== 'owner' && (
                    <div className="flex justify-center gap-2">
                      <button onClick={() => handleEdit(user)} className="p-2 text-blue-500 hover:bg-blue-50 rounded-lg">
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button onClick={() => deleteUser(user.id)} className="p-2 text-red-500 hover:bg-red-50 rounded-lg">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-md p-6">
            <h3 className="text-xl font-bold mb-4">{editingId ? 'Edit Pegawai' : 'Tambah Pegawai'}</h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nama Lengkap</label>
                <input required type="text" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-brand-green outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Username (Untuk Login)</label>
                <input required type="text" value={formData.username} onChange={e => setFormData({...formData, username: e.target.value})} className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-brand-green outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                <input type="password" value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} placeholder={editingId ? "Kosongkan jika tidak ingin ganti" : "Password (default: 123456)"} className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-brand-green outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
                <select value={formData.role} onChange={e => setFormData({...formData, role: e.target.value as Role})} className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-brand-green outline-none">
                  <option value="kasir">Kasir</option>
                  <option value="admin">Admin Cabang</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Cabang Penugasan</label>
                <select value={formData.branchId} onChange={e => setFormData({...formData, branchId: e.target.value})} className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-brand-green outline-none">
                  {branches.map(b => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>
              <div className="flex gap-3 mt-6">
                <button type="button" onClick={() => setShowModal(false)} className="flex-1 py-2 border rounded-lg text-gray-700 hover:bg-gray-50">Batal</button>
                <button type="submit" className="flex-1 py-2 bg-brand-green text-white rounded-lg hover:bg-green-600">Simpan</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Users;
