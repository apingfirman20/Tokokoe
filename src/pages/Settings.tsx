import React, { useState } from 'react';
import { useStore } from '../store/useStore';
import { Printer, Save, CheckCircle2 } from 'lucide-react';

const SettingsPage = () => {
  const { currentUser, updatePrinterSetting } = useStore();
  const [printerType, setPrinterType] = useState(currentUser?.printerSetting || 'cable');
  const [showSaved, setShowSaved] = useState(false);

  const handleSave = () => {
    if (currentUser) {
      updatePrinterSetting(currentUser.id, printerType as 'bluetooth' | 'cable');
      setShowSaved(true);
      setTimeout(() => setShowSaved(false), 3000);
    }
  };

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-brand-dark">Pengaturan</h1>
        <p className="text-gray-500 mt-1">Sesuaikan preferensi aplikasi Anda</p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-6 border-b border-gray-100">
          <div className="flex items-center gap-3 mb-1">
            <Printer className="w-5 h-5 text-brand-orange" />
            <h2 className="text-xl font-bold text-brand-dark">Pengaturan Printer Struk</h2>
          </div>
          <p className="text-sm text-gray-500">Pilih metode pencetakan struk yang sesuai dengan perangkat Anda.</p>
        </div>

        <div className="p-6 space-y-6">
          <label className="flex items-start gap-4 p-4 border rounded-xl cursor-pointer hover:border-brand-green transition-colors has-[:checked]:border-brand-green has-[:checked]:bg-green-50/30">
            <input 
              type="radio" 
              name="printer" 
              value="cable"
              checked={printerType === 'cable'}
              onChange={() => setPrinterType('cable')}
              className="mt-1 w-4 h-4 text-brand-green focus:ring-brand-green"
            />
            <div>
              <h3 className="font-bold text-brand-dark">Printer Kabel / Browser Default</h3>
              <p className="text-sm text-gray-500 mt-1">Menggunakan dialog print bawaan browser. Cocok untuk printer kasir yang tersambung via kabel USB/LAN.</p>
            </div>
          </label>

          <label className="flex items-start gap-4 p-4 border rounded-xl cursor-pointer hover:border-brand-green transition-colors has-[:checked]:border-brand-green has-[:checked]:bg-green-50/30">
            <input 
              type="radio" 
              name="printer" 
              value="bluetooth"
              checked={printerType === 'bluetooth'}
              onChange={() => setPrinterType('bluetooth')}
              className="mt-1 w-4 h-4 text-brand-green focus:ring-brand-green"
            />
            <div>
              <h3 className="font-bold text-brand-dark">Printer Bluetooth (Web Bluetooth API)</h3>
              <p className="text-sm text-gray-500 mt-1">Menyambung langsung ke thermal printer bluetooth dari browser. (Hanya didukung di Chrome/Edge pada Android, Mac, atau PC dengan Bluetooth).</p>
            </div>
          </label>

          <div className="flex items-center justify-between pt-4 border-t">
            <div className="text-brand-green flex items-center gap-2 font-medium h-6">
              {showSaved && <><CheckCircle2 className="w-5 h-5" /> Pengaturan disimpan</>}
            </div>
            <button 
              onClick={handleSave}
              className="flex items-center gap-2 bg-brand-green text-white px-6 py-2 rounded-lg hover:bg-green-600 transition-colors font-bold"
            >
              <Save className="w-4 h-4" />
              Simpan Pengaturan
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsPage;
