import { Business, Branch, BusinessType, ReceiptSettings } from "@/types";

export const PRESET_LOGOS = [
  {
    name: '☕ Kafe & FnB',
    type: 'fnb' as BusinessType,
    url: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="130" height="38" viewBox="0 0 130 38"><rect width="130" height="38" rx="6" fill="%23111827"/><path d="M22 13h14v8a6 6 0 0 1-6 6h-2a6 6 0 0 1-6-6v-8zm14 2h4a3 3 0 0 1 3 3v2a3 3 0 0 1-3 3h-4v-8z" fill="%23ffffff"/><text x="48" y="24" fill="%23ffffff" font-family="monospace" font-weight="bold" font-size="13">CAFE POS</text></svg>'
  },
  {
    name: '📱 Gadget Store',
    type: 'phone' as BusinessType,
    url: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="130" height="38" viewBox="0 0 130 38"><rect width="130" height="38" rx="6" fill="%230f172a"/><rect x="20" y="9" width="13" height="21" rx="2.5" fill="none" stroke="%23ffffff" stroke-width="2"/><circle cx="26.5" cy="25.5" r="1.5" fill="%23ffffff"/><text x="42" y="24" fill="%23ffffff" font-family="monospace" font-weight="bold" font-size="12">GADGET ID</text></svg>'
  },
  {
    name: '🛒 Retail Mart',
    type: 'retail' as BusinessType,
    url: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="130" height="38" viewBox="0 0 130 38"><rect width="130" height="38" rx="6" fill="%231e293b"/><path d="M18 12h4l3 11h10l3-8H24" fill="none" stroke="%23ffffff" stroke-width="2" stroke-linecap="round"/><circle cx="26" cy="27" r="2" fill="%23ffffff"/><circle cx="34" cy="27" r="2" fill="%23ffffff"/><text x="44" y="24" fill="%23ffffff" font-family="monospace" font-weight="bold" font-size="13">MART POS</text></svg>'
  }
];

/**
 * Returns specialized, industry-tailored default receipt settings based on business type and branch.
 */
export function getDefaultReceiptSettings(
  business: Business | null,
  branch?: Branch | null
): ReceiptSettings {
  const type: BusinessType = business?.businessType || 'retail';
  const bizName = business?.name || 'Tokokoe Store';
  const addr = branch?.address || business?.address || 'Jl. Operasional Utama No. 12';
  const phone = branch?.phone || business?.phone || '0812-3456-7890';

  if (type === 'fnb') {
    return {
      showLogo: true,
      logoUrl: PRESET_LOGOS[0].url,
      storeName: bizName,
      tagline: 'Artisan Cafe & Resto • Freshly Served',
      address: addr,
      phone: phone,
      footerMessage: 'Terima kasih atas kunjungan Anda! Selamat menikmati sajian kami.',
      footerNotes: 'Wifi: Tokokoe-Guest | Password: kopienak123\nKritik & Saran WA: ' + phone,
      customHeaderNote: 'BILL MEJA & DINE IN',
      showCashier: true,
      showCustomer: true,
      showTableOrService: true,
      showTax: true,
      paperSize: '80mm',
    };
  }

  if (type === 'phone') {
    return {
      showLogo: true,
      logoUrl: PRESET_LOGOS[1].url,
      storeName: bizName,
      tagline: 'Pusat Smartphone, Gadget & Service Resmi',
      address: addr,
      phone: phone,
      footerMessage: 'Terima kasih telah berbelanja gadget resmi di toko kami!',
      footerNotes: 'Klaim garansi wajib menunjukkan nota ini dan segel mesin utuh.\nGaransi unit resmi 1 tahun & garansi toko 30 hari tukar unit jika cacat pabrik.',
      customHeaderNote: 'NOTA ELEKTRONIK & GARANSI RESMI',
      showCashier: true,
      showCustomer: true,
      showImeiDetails: true,
      showTax: false,
      paperSize: '80mm',
    };
  }

  // Retail default
  return {
    showLogo: true,
    logoUrl: PRESET_LOGOS[2].url,
    storeName: bizName,
    tagline: 'Belanja Lengkap, Hemat & Terpercaya',
    address: addr,
    phone: phone,
    footerMessage: 'Terima kasih telah berbelanja di toko kami!',
    footerNotes: 'Barang yang sudah dibeli tidak dapat ditukar/dikembalikan kecuali cacat pabrik (maks 1x24 jam dengan struk fisik).',
    customHeaderNote: 'STRUK BELANJA KASIR RESMI',
    showCashier: true,
    showCustomer: true,
    showItemBarcode: true,
    showTax: true,
    paperSize: '80mm',
  };
}

/**
 * Returns specialized badge info for receipt settings headers.
 */
export function getIndustryReceiptBadge(businessType?: BusinessType) {
  switch (businessType) {
    case 'fnb':
      return {
        label: 'Format Khusus Restoran & Kafe (F&B)',
        badgeText: '🍽️ Resto / Kafe',
        colorClass: 'bg-amber-50 text-amber-800 border-amber-200',
        badgeBg: 'bg-amber-600',
        featuresText: 'Mendukung Nomor Meja, Dine In / Takeaway, Catatan Modifiers Minuman/Makanan, Biaya Layanan & Pajak PB1 Resto.'
      };
    case 'phone':
      return {
        label: 'Format Khusus Toko Handphone & Gadget',
        badgeText: '📱 Gadget & Phone',
        colorClass: 'bg-blue-50 text-blue-800 border-blue-200',
        badgeBg: 'bg-blue-600',
        featuresText: 'Mendukung Cetak IMEI 1 & IMEI 2, Status Garansi Unit 1 Tahun Resmi, Potongan Tukar Tambah (Trade-In), dan Syarat Segel Toko.'
      };
    case 'retail':
    default:
      return {
        label: 'Format Khusus Minimarket & Retail Mart',
        badgeText: '🛒 Retail & Supermarket',
        colorClass: 'bg-emerald-50 text-emerald-800 border-emerald-200',
        badgeBg: 'bg-emerald-600',
        featuresText: 'Mendukung Barcode / Kode SKU Barang, Total Jumlah Pcs Belanja, Diskon Penghematan Promosi, dan Kebijakan Retur Kasir.'
      };
  }
}

/**
 * Generates industry-specific sample items and totals for realistic live receipt preview.
 */
export function getIndustrySampleReceipt(
  businessType?: BusinessType,
  settings?: ReceiptSettings
) {
  const type: BusinessType = businessType || 'retail';

  if (type === 'fnb') {
    return {
      orderTypeLabel: 'DINE IN',
      metaDetails: [
        { label: 'No. Struk', value: 'FNB/20261021/042' },
        { label: 'Tanggal', value: '21/10/2026 12:45' },
        { label: 'Meja', value: 'Meja #04 (Lantai 2)' },
        { label: 'Kasir/Waiter', value: 'Rian (Kasir)' },
        { label: 'Tamu', value: 'Pak Anton (Dine In)' },
      ],
      items: [
        {
          name: 'Es Kopi Susu Aren Gula Aren',
          qty: 2,
          price: 24000,
          subtotal: 48000,
          options: 'Ice: Normal • Sugar: Less 50%',
          note: '+ Extra Shot Espresso',
        },
        {
          name: 'Butter Croissant Almond Warm',
          qty: 1,
          price: 28000,
          subtotal: 28000,
          options: 'Dipanaskan • Topping Almond',
          note: '',
        },
        {
          name: 'Nasi Goreng Wagyu Spesial',
          qty: 1,
          price: 45000,
          subtotal: 45000,
          options: 'Level Pedas: 2 • Telur: Setengah Matang',
          note: '',
        }
      ],
      subtotal: 121000,
      discount: 0,
      serviceCharge: 6050, // 5%
      tax: 12100, // 10% PB1
      tradeIn: null,
      total: 139150,
      paymentMethod: 'QRIS (BCA / GOPAY)',
      paymentStatus: 'LUNAS (SETTLED)',
      footerHighlight: '🍽️ Terima kasih atas kunjungannya, selamat menikmati!',
    };
  }

  if (type === 'phone') {
    return {
      orderTypeLabel: 'PENJUALAN UNIT GADGET',
      metaDetails: [
        { label: 'No. Nota', value: 'PHN/20261021/018' },
        { label: 'Tanggal', value: '21/10/2026 14:15' },
        { label: 'Kasir/Spesialis', value: 'Kevin (Staff Penjualan)' },
        { label: 'Pelanggan', value: 'Ibu Ratna Dewi (0812-8888-xxxx)' },
        { label: 'Status Garansi', value: 'GARANSI RESMI AKTIF' },
      ],
      items: [
        {
          name: 'iPhone 15 Pro 128GB Black Titanium',
          qty: 1,
          price: 18499000,
          subtotal: 18499000,
          imei: '356891234567890 (Kemenperin Aman)',
          options: 'Garansi Resmi TAM/iBox: 1 Tahun',
          note: 'Termasuk Adaptor 20W Original',
        },
        {
          name: 'Tempered Glass Anti-Spy 9D',
          qty: 1,
          price: 150000,
          subtotal: 150000,
          imei: null,
          options: 'Free Pasang Teknisi Toko',
          note: '',
        }
      ],
      subtotal: 18649000,
      discount: 200000,
      serviceCharge: 0,
      tax: 0,
      tradeIn: {
        deviceModel: 'iPhone 12 64GB Blue (Grade A)',
        estimatedValue: 4500000,
      },
      total: 13949000,
      paymentMethod: 'TRANSFER BANK (BCA)',
      paymentStatus: 'LUNAS (VERIFIED)',
      footerHighlight: '📱 Simpan nota & segel utuh untuk klaim garansi toko.',
    };
  }

  // Retail Default
  return {
    orderTypeLabel: 'BELANJA REGULER',
    metaDetails: [
      { label: 'No. Struk', value: 'POS/20261021/089' },
      { label: 'Tanggal', value: '21/10/2026 16:30' },
      { label: 'Kasir', value: 'Siti Rahma (POS 01)' },
      { label: 'Pelanggan', value: 'Member Toko #8821' },
      { label: 'Total Item', value: '3 Macam (5 Pcs)' },
    ],
    items: [
      {
        name: 'Beras Ramos Super Premium 5kg',
        qty: 1,
        price: 74500,
        subtotal: 74500,
        barcode: '8991234001923',
        options: '',
        note: '',
      },
      {
        name: 'Minyak Goreng Pouch 2 Liter',
        qty: 2,
        price: 34000,
        subtotal: 68000,
        barcode: '8992345004812',
        options: '',
        note: '',
      },
      {
        name: 'Kecap Manis Refill 550ml',
        qty: 2,
        price: 19500,
        subtotal: 39000,
        barcode: '8993456009104',
        options: '',
        note: '',
      }
    ],
    subtotal: 181500,
    discount: 15000, // Promo Hemat Member
    serviceCharge: 0,
    tax: 0,
    tradeIn: null,
    total: 166500,
    paymentMethod: 'TUNAI (CASH)',
    paymentStatus: 'LUNAS',
    footerHighlight: '🛒 Anda Berhemat Rp 15.000 Hari Ini!',
  };
}
