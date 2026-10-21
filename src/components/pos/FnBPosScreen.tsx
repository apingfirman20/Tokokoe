'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useBusiness } from '@/context/BusinessContext';
import { Product, CartLineItem, OrderType, PaymentMethod, Sale } from '@/types';
import { formatRupiah, parseRupiah } from '@/lib/utils';
import { 
  Coffee, Search, Plus, Minus, Trash2, CreditCard, 
  Banknote, Receipt, CheckCircle2, Clock, X, ChefHat, 
  UtensilsCrossed, AlertCircle, Printer, RotateCcw, ArrowDownLeft,
  ChevronRight, SlidersHorizontal, Users, MoreHorizontal, Sparkles,
  BellRing, QrCode as QrCodeIcon, AlertTriangle, ExternalLink
} from 'lucide-react';
import { ReceiptModal } from './ReceiptModal';
import { playPosSound } from '@/lib/audio';
import { generateDynamicQrisWithLogo } from '@/lib/qr-generator';

export function FnBPosScreen() {
  const { 
    activeBusiness, 
    activeBranch, 
    products, 
    tables, 
    sales,
    updateOrderStatus,
    activeShift, 
    openShift, 
    closeShift, 
    recordCashMovement,
    processCheckout,
    openFnBOrder,
    addItemsToFnBOrder,
    moveTable,
    mergeTables
  } = useBusiness();

  // Category filter state
  const [selectedCategory, setSelectedCategory] = useState<string>('Semua');
  const [searchQuery, setSearchQuery] = useState('');

  // Cart & Order State
  const [cart, setCart] = useState<CartLineItem[]>([]);
  const [orderType, setOrderType] = useState<OrderType>('dine_in');
  const [selectedTableId, setSelectedTableId] = useState<string>('');
  const [selectedTable, setSelectedTable] = useState<string>('Meja 01');
  const [customerName, setCustomerName] = useState('');

  // Modals & Sub-states
  const [showTableModal, setShowTableModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [showShiftModal, setShowShiftModal] = useState(false);
  const [lastSale, setLastSale] = useState<Sale | null>(null);

  // Customization Modal State (Options, Modifiers, Notes)
  const [showCustomizeModal, setShowCustomizeModal] = useState(false);
  const [customizingProduct, setCustomizingProduct] = useState<Product | null>(null);
  const [selectedOptions, setSelectedOptions] = useState<Record<string, string>>({});
  const [selectedModifiers, setSelectedModifiers] = useState<string[]>([]);
  const [lineItemNotes, setLineItemNotes] = useState<string>('');

  // Table Move / Merge action states
  const [showMoveModal, setShowMoveModal] = useState(false);
  const [showMergeModal, setShowMergeModal] = useState(false);
  const [targetTableId, setTargetTableId] = useState('');
  const [tableActionLoading, setTableActionLoading] = useState(false);

  // Incoming QR Table Orders States (Self-Order awaiting Cashier confirmation)
  const [showIncomingOrdersModal, setShowIncomingOrdersModal] = useState(false);
  const [forwardingSaleId, setForwardingSaleId] = useState<string | null>(null);

  // Dedicated Cash Payment Modal state for table self-orders / open bills
  const [payingOrder, setPayingOrder] = useState<Sale | null>(null);
  const [orderCashAmount, setOrderCashAmount] = useState<number>(0);
  const [orderPaymentError, setOrderPaymentError] = useState<string>('');

  const incomingSelfOrders = React.useMemo(() => {
    return (sales || []).filter(
      s => s.businessId === activeBusiness?.id && s.orderStatus === 'waiting_cashier'
    );
  }, [sales, activeBusiness?.id]);

  // Find active unpaid order for the currently selected table
  const selectedTableUnpaidSale = React.useMemo(() => {
    if (!selectedTable) return null;
    return (sales || []).find(
      s => s.businessId === activeBusiness?.id && 
           s.tableNumber === selectedTable && 
           s.paymentStatus === 'pending'
    );
  }, [sales, activeBusiness?.id, selectedTable]);

  // Audio notification when new customer QR order arrives
  const prevIncomingCountRef = React.useRef(incomingSelfOrders.length);
  React.useEffect(() => {
    if (incomingSelfOrders.length > prevIncomingCountRef.current) {
      playPosSound('notification');
    }
    prevIncomingCountRef.current = incomingSelfOrders.length;
  }, [incomingSelfOrders.length]);

  const handleForwardToKitchen = async (sale: Sale, markAsPaid?: boolean) => {
    setForwardingSaleId(sale.id);
    try {
      if (markAsPaid) {
        await updateOrderStatus(sale.id, 'new', 'paid', sale.grandTotal, 0);
      } else {
        await updateOrderStatus(sale.id, 'new');
      }
      playPosSound('checkout_success');
      setOrderFeedbackMsg(`Pesanan ${sale.tableNumber || 'Meja'} (${sale.customerName || 'Tamu'}) berhasil diteruskan ke Dapur 👨‍🍳!`);
      setTimeout(() => setOrderFeedbackMsg(''), 4500);
      if (incomingSelfOrders.length <= 1) {
        setShowIncomingOrdersModal(false);
      }
    } catch (err: any) {
      alert(err.message || 'Gagal meneruskan pesanan ke dapur.');
    } finally {
      setForwardingSaleId(null);
    }
  };

  // Process cash payment with change calculation & receipt modal for table order
  const handleExecuteCashPaymentForOrder = async () => {
    if (!payingOrder) return;
    if (orderCashAmount < payingOrder.grandTotal) {
      setOrderPaymentError(`Uang tunai kurang ${formatRupiah(payingOrder.grandTotal - orderCashAmount)}.`);
      return;
    }

    setForwardingSaleId(payingOrder.id);
    setOrderPaymentError('');
    try {
      const change = Math.max(0, orderCashAmount - payingOrder.grandTotal);
      const newKitchenStatus = payingOrder.orderStatus === 'waiting_cashier' ? 'new' : payingOrder.orderStatus;
      
      // Update order status and paymentStatus to 'paid' with paidAmount & changeAmount
      await updateOrderStatus(payingOrder.id, newKitchenStatus, 'paid', orderCashAmount, change);

      const completedSale: Sale = {
        ...payingOrder,
        paidAmount: orderCashAmount,
        changeAmount: change,
        paymentMethod: 'cash',
        paymentStatus: 'paid',
        orderStatus: newKitchenStatus,
        updatedAt: Date.now(),
      };

      playPosSound('checkout_success');
      setLastSale(completedSale);
      setPayingOrder(null);
      setShowIncomingOrdersModal(false);
      setShowReceiptModal(true); // Automatically show cashier receipt modal for printing!
      setOrderFeedbackMsg(`✓ Pembayaran tunai ${payingOrder.tableNumber || ''} (${payingOrder.customerName || 'Tamu'}) berhasil! Kembalian: ${formatRupiah(change)}. Pesanan diteruskan ke Dapur 👨‍🍳`);
      setTimeout(() => setOrderFeedbackMsg(''), 5000);
    } catch (err: any) {
      setOrderPaymentError(err.message || 'Gagal memproses pembayaran kasir.');
    } finally {
      setForwardingSaleId(null);
    }
  };

  // Process QRIS payment for table order (verify money received & open receipt)
  const handleExecuteQrisPaymentForOrder = async () => {
    if (!payingOrder) return;

    setForwardingSaleId(payingOrder.id);
    setOrderPaymentError('');
    try {
      const newKitchenStatus = payingOrder.orderStatus === 'waiting_cashier' ? 'new' : payingOrder.orderStatus;
      
      // Update order status and paymentStatus to 'paid' with paymentMethod 'qris'
      await updateOrderStatus(payingOrder.id, newKitchenStatus, 'paid', payingOrder.grandTotal, 0, 'qris');

      const completedSale: Sale = {
        ...payingOrder,
        paidAmount: payingOrder.grandTotal,
        changeAmount: 0,
        paymentMethod: 'qris',
        paymentStatus: 'paid',
        orderStatus: newKitchenStatus,
        updatedAt: Date.now(),
      };

      playPosSound('checkout_success');
      setLastSale(completedSale);
      setPayingOrder(null);
      setShowIncomingOrdersModal(false);
      setShowReceiptModal(true); // Automatically show cashier receipt modal for instant printing!
      setOrderFeedbackMsg(`✓ Pembayaran QRIS ${payingOrder.tableNumber || ''} (${payingOrder.customerName || 'Tamu'}) Rp ${payingOrder.grandTotal.toLocaleString('id-ID')} berhasil diverifikasi! Struk tercetak & pesanan diteruskan ke Dapur 👨‍🍳`);
      setTimeout(() => setOrderFeedbackMsg(''), 5000);
    } catch (err: any) {
      setOrderPaymentError(err.message || 'Gagal memproses pembayaran QRIS.');
    } finally {
      setForwardingSaleId(null);
    }
  };

  // Cash payment calculation state
  const [paidAmount, setPaidAmount] = useState<number>(0);
  const [paymentError, setPaymentError] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [isOpenOrderProcessing, setIsOpenOrderProcessing] = useState<boolean>(false);
  const [orderFeedbackMsg, setOrderFeedbackMsg] = useState<string>('');

  const [checkoutPaymentMethod, setCheckoutPaymentMethod] = useState<'cash' | 'qris'>('cash');
  const [checkoutQrisDataUrl, setCheckoutQrisDataUrl] = useState<string>('');
  const [isGeneratingCheckoutQris, setIsGeneratingCheckoutQris] = useState<boolean>(false);
  const [checkoutMidtransNotConfigured, setCheckoutMidtransNotConfigured] = useState<boolean>(false);
  const [checkoutMidtransError, setCheckoutMidtransError] = useState<string>('');
  const [checkoutMidtransOrderId, setCheckoutMidtransOrderId] = useState<string>('');

  const isMidtransActive = Boolean(activeBusiness?.midtransSettings?.isEnabled && activeBusiness?.midtransSettings?.serverKey?.trim());

  // Table order payment method & QRIS state
  const [payingOrderPaymentMethod, setPayingOrderPaymentMethod] = useState<'cash' | 'qris'>('cash');
  const [payingOrderQrisDataUrl, setPayingOrderQrisDataUrl] = useState<string>('');
  const [isGeneratingPayingOrderQris, setIsGeneratingPayingOrderQris] = useState<boolean>(false);
  const [payingOrderMidtransNotConfigured, setPayingOrderMidtransNotConfigured] = useState<boolean>(false);
  const [payingOrderMidtransError, setPayingOrderMidtransError] = useState<string>('');
  const [payingOrderMidtransOrderId, setPayingOrderMidtransOrderId] = useState<string>('');

  // Shift form states
  const [shiftOpeningCash, setShiftOpeningCash] = useState<number>(200000);
  const [shiftActualClosingCash, setShiftActualClosingCash] = useState<number>(0);
  const [shiftNotes, setShiftNotes] = useState('');
  const [shiftLoading, setShiftLoading] = useState(false);
  const [shiftError, setShiftError] = useState('');
  const [showCashMovementModal, setShowCashMovementModal] = useState(false);
  const [movementType, setMovementType] = useState<'cash_in' | 'cash_out'>('cash_in');
  const [movementAmount, setMovementAmount] = useState<number>(50000);
  const [movementReason, setMovementReason] = useState('');

  // Synchronize table selection with first table
  React.useEffect(() => {
    if (tables.length > 0 && !selectedTableId) {
      setSelectedTableId(tables[0].id);
      setSelectedTable(tables[0].tableNumber);
    }
  }, [tables, selectedTableId]);

  // Filter products by category & search (excluding archived/inactive)
  const defaultFnBCategories = ['Makanan', 'Minuman', 'Dessert', 'Coffee Base', 'Non-Coffee', 'Signature', 'Pastry & Bakery', 'Makanan Berat'];
  const productCategories = Array.from(new Set(products.filter(p => p.isActive !== false).map(p => p.category).filter(Boolean)));
  const categories = ['Semua', ...Array.from(new Set([...defaultFnBCategories, ...productCategories]))];
  const filteredProducts = products.filter(p => {
    if (p.isActive === false || p.available === false) return false;
    const matchCategory = selectedCategory === 'Semua' || p.category === selectedCategory;
    const matchSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase());
    return matchCategory && matchSearch;
  });

  // Authoritative Business Tax & Service Charge (PB1 derived, never hard-coded 10%)
  const taxRate = activeBusiness?.taxRate !== undefined ? activeBusiness.taxRate : 10;
  const serviceChargeRate = activeBusiness?.serviceChargeRate !== undefined ? activeBusiness.serviceChargeRate : 0;

  // Cart Calculations
  const subtotal = cart.reduce((acc, item) => acc + item.subtotal, 0);
  const tax = Math.round((subtotal * taxRate) / 100);
  const serviceCharge = Math.round((subtotal * serviceChargeRate) / 100);
  const grandTotal = subtotal + tax + serviceCharge;
  const changeAmount = Math.max(0, paidAmount - grandTotal);

  // Line item uniqueness key helper
  const getItemKey = (item: CartLineItem) => {
    const optStr = item.selectedOptions ? JSON.stringify(Object.entries(item.selectedOptions).sort()) : '';
    const modStr = item.selectedModifiers ? [...item.selectedModifiers].sort().join(',') : '';
    const notesStr = item.notes || '';
    return `${item.productId}::${optStr}::${modStr}::${notesStr}`;
  };

  // Cart Actions with full variant / modifier isolation
  const addToCartWithCustomization = (
    product: Product,
    options?: Record<string, string>,
    modifiers?: string[],
    notes?: string
  ) => {
    if (product.isActive === false || product.available === false) {
      alert(`Produk "${product.name}" sedang nonaktif / diarsipkan.`);
      return;
    }

    // Compute authoritative options surcharge
    let optionsExtra = 0;
    if (options && product.options) {
      for (const [optName, choiceLabel] of Object.entries(options)) {
        const optObj = product.options.find(o => o.name === optName);
        if (optObj?.choices) {
          const choice = optObj.choices.find(c => c.label === choiceLabel);
          if (choice?.extraPrice) optionsExtra += choice.extraPrice;
        }
      }
    }

    // Compute authoritative modifiers surcharge
    let modifiersExtra = 0;
    if (modifiers && product.modifiers) {
      for (const modName of modifiers) {
        const modObj = product.modifiers.find(m => m.name === modName);
        if (modObj?.price) modifiersExtra += modObj.price;
      }
    }

    const unitPrice = product.sellingPrice + optionsExtra + modifiersExtra;
    const newItem: CartLineItem = {
      productId: product.id,
      productName: product.name,
      quantity: 1,
      unitPrice,
      subtotal: unitPrice,
      notes: notes?.trim() || undefined,
      selectedOptions: options && Object.keys(options).length > 0 ? options : undefined,
      selectedModifiers: modifiers && modifiers.length > 0 ? modifiers : undefined,
    };

    const targetKey = getItemKey(newItem);

    setCart(prev => {
      const existingIdx = prev.findIndex(item => getItemKey(item) === targetKey);
      if (existingIdx >= 0) {
        return prev.map((item, idx) => 
          idx === existingIdx
            ? { ...item, quantity: item.quantity + 1, subtotal: (item.quantity + 1) * item.unitPrice }
            : item
        );
      }
      return [...prev, newItem];
    });
  };

  const handleProductClick = (product: Product) => {
    if (product.isActive === false || product.available === false) {
      alert(`Produk "${product.name}" sedang nonaktif / diarsipkan.`);
      return;
    }
    if ((product.options && product.options.length > 0) || (product.modifiers && product.modifiers.length > 0)) {
      setCustomizingProduct(product);
      const initialOptions: Record<string, string> = {};
      if (product.options) {
        product.options.forEach(opt => {
          if (opt.choices && opt.choices.length > 0) {
            initialOptions[opt.name] = opt.choices[0].label;
          }
        });
      }
      setSelectedOptions(initialOptions);
      setSelectedModifiers([]);
      setLineItemNotes('');
      setShowCustomizeModal(true);
    } else {
      addToCartWithCustomization(product);
    }
  };

  const updateQuantityByIndex = (index: number, delta: number) => {
    setCart(prev => {
      return prev.map((item, idx) => {
        if (idx === index) {
          const newQty = item.quantity + delta;
          if (newQty <= 0) return null;
          return { ...item, quantity: newQty, subtotal: newQty * item.unitPrice };
        }
        return item;
      }).filter(Boolean) as CartLineItem[];
    });
  };

  const removeFromCartByIndex = (index: number) => {
    setCart(prev => prev.filter((_, idx) => idx !== index));
  };

  const clearCart = () => {
    setCart([]);
  };

  // Open Order / Send to Kitchen without immediate payment
  const handleOpenOrder = async () => {
    if (cart.length === 0 || isOpenOrderProcessing) return;
    setIsOpenOrderProcessing(true);
    setPaymentError('');
    try {
      const curTbl = tables.find(t => t.id === selectedTableId || t.tableNumber === selectedTable);
      if (curTbl?.activeSaleId) {
        // Append items to active unpaid order
        const res = await addItemsToFnBOrder(curTbl.activeSaleId, cart);
        if (res.success) {
          setOrderFeedbackMsg(`✓ Menu tambahan berhasil dikirim ke KDS Dapur untuk ${selectedTable}!`);
          clearCart();
          setTimeout(() => setOrderFeedbackMsg(''), 5000);
        } else {
          setPaymentError(res.error || 'Gagal menambahkan menu ke pesanan meja.');
        }
      } else {
        // Open new order and lock table
        const res = await openFnBOrder({
          orderType: orderType === 'takeaway' ? 'takeaway' : 'dine_in',
          tableId: selectedTableId || undefined,
          tableNumber: selectedTable,
          customerName: customerName || undefined,
          lineItems: cart,
        });
        if (res.success) {
          setOrderFeedbackMsg(`✓ Pesanan baru berhasil dibuka & dikirim ke KDS Dapur untuk ${selectedTable}!`);
          clearCart();
          setTimeout(() => setOrderFeedbackMsg(''), 5000);
        } else {
          setPaymentError(res.error || 'Gagal mengirim pesanan ke dapur.');
        }
      }
    } finally {
      setIsOpenOrderProcessing(false);
    }
  };

  // Checkout execution
  const handleCheckout = async () => {
    if (isProcessing) return;
    if (cart.length === 0) return;
    if (paidAmount < grandTotal) {
      setPaymentError('Nominal uang yang dibayarkan kurang dari total tagihan.');
      return;
    }

    if (!activeShift) {
      setPaymentError('Sesi kasir (shift) belum dibuka. Buka sesi shift kasir terlebih dahulu untuk transaksi tunai.');
      setShowShiftModal(true);
      return;
    }

    setIsProcessing(true);
    setPaymentError('');

    try {
      const res = await processCheckout({
        lineItems: cart,
        subtotal,
        discount: 0,
        tax,
        serviceCharge,
        grandTotal,
        paidAmount,
        changeAmount,
        paymentMethod: 'cash',
        orderType,
        tableNumber: orderType === 'dine_in' ? selectedTable : undefined,
        tableId: orderType === 'dine_in' ? selectedTableId : undefined,
        customerName: customerName || undefined,
      });

      if (res.success && res.sale) {
        playPosSound('checkout_success');
        setLastSale(res.sale);
        setShowPaymentModal(false);
        setShowReceiptModal(true);
        clearCart();
      } else {
        playPosSound('scan_error');
        setPaymentError(res.error || 'Terjadi kesalahan pemrosesan transaksi.');
      }
    } finally {
      setIsProcessing(false);
    }
  };

  // QRIS Checkout execution with instant receipt modal popup
  const handleCheckoutQris = async () => {
    if (isProcessing) return;
    if (cart.length === 0) return;

    setIsProcessing(true);
    setPaymentError('');

    try {
      const res = await processCheckout({
        lineItems: cart,
        subtotal,
        discount: 0,
        tax,
        serviceCharge,
        grandTotal,
        paidAmount: grandTotal,
        changeAmount: 0,
        paymentMethod: 'qris',
        orderType,
        tableNumber: orderType === 'dine_in' ? selectedTable : undefined,
        tableId: orderType === 'dine_in' ? selectedTableId : undefined,
        customerName: customerName || undefined,
      });

      if (res.success && res.sale) {
        playPosSound('checkout_success');
        setLastSale(res.sale);
        setShowPaymentModal(false);
        setShowReceiptModal(true); // Automatically show cashier receipt modal for instant printing!
        clearCart();
      } else {
        playPosSound('scan_error');
        setPaymentError(res.error || 'Terjadi kesalahan pemrosesan pembayaran QRIS.');
      }
    } finally {
      setIsProcessing(false);
    }
  };

  // Generate dynamic QRIS for direct POS checkout via Midtrans Core API
  React.useEffect(() => {
    if (!isMidtransActive) {
      setIsGeneratingCheckoutQris(false);
      return;
    }
    if (showPaymentModal && checkoutPaymentMethod === 'qris' && grandTotal > 0 && activeBusiness?.id) {
      let isMounted = true;
      setIsGeneratingCheckoutQris(true);
      setCheckoutMidtransNotConfigured(false);
      setCheckoutMidtransError('');
      setCheckoutMidtransOrderId('');
      setCheckoutQrisDataUrl('');

      const effectiveLogo = activeBusiness?.receiptSettings?.logoUrl || activeBusiness?.logoUrl;

      fetch('/api/payments/midtrans/charge-qris', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessId: activeBusiness.id,
          grossAmount: grandTotal,
          customerName: customerName || 'Pelanggan Kasir',
        }),
      })
        .then(res => res.json())
        .then(async data => {
          if (!isMounted) return;
          if (data.notConfigured) {
            setCheckoutMidtransNotConfigured(true);
            setCheckoutMidtransError(data.error);
            setIsGeneratingCheckoutQris(false);
            return;
          }
          if (!data.success) {
            setCheckoutMidtransError(data.error || 'Gagal menerbitkan QRIS di Midtrans.');
            setIsGeneratingCheckoutQris(false);
            return;
          }

          setCheckoutMidtransOrderId(data.orderId);
          if (data.qrString) {
            const { dataUrl } = await generateDynamicQrisWithLogo(
              grandTotal,
              activeBusiness?.name || 'Tokokoe Resto',
              effectiveLogo,
              {},
              data.qrString
            );
            if (isMounted) setCheckoutQrisDataUrl(dataUrl);
          } else if (data.qrUrl) {
            if (isMounted) setCheckoutQrisDataUrl(data.qrUrl);
          }
          if (isMounted) setIsGeneratingCheckoutQris(false);
        })
        .catch(err => {
          if (!isMounted) return;
          console.error('Error generating Midtrans QRIS:', err);
          setCheckoutMidtransError(err.message || 'Gagal menghubungi API Midtrans.');
          setIsGeneratingCheckoutQris(false);
        });

      return () => { isMounted = false; };
    }
  }, [showPaymentModal, checkoutPaymentMethod, grandTotal, activeBusiness?.id, activeBusiness?.name, activeBusiness?.logoUrl, activeBusiness?.receiptSettings?.logoUrl, customerName]);

  // Real-time polling for direct POS checkout QRIS payment detection
  React.useEffect(() => {
    if (!showPaymentModal || checkoutPaymentMethod !== 'qris' || !checkoutMidtransOrderId || !activeBusiness?.id) {
      return;
    }

    let isMounted = true;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/payments/midtrans/status?businessId=${activeBusiness.id}&orderId=${encodeURIComponent(checkoutMidtransOrderId)}`);
        const data = await res.json();
        if (isMounted && data.success && data.isPaid) {
          clearInterval(interval);
          // Payment received into QR! Automatically finish checkout and print receipt!
          handleCheckoutQris();
        }
      } catch (e) {
        // silent polling catch
      }
    }, 3000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [showPaymentModal, checkoutPaymentMethod, checkoutMidtransOrderId, activeBusiness?.id]);

  // Generate dynamic QRIS for table order payment via Midtrans Core API
  React.useEffect(() => {
    if (!isMidtransActive) {
      setIsGeneratingPayingOrderQris(false);
      return;
    }
    if (payingOrder && payingOrderPaymentMethod === 'qris' && payingOrder.grandTotal > 0 && activeBusiness?.id) {
      let isMounted = true;
      setIsGeneratingPayingOrderQris(true);
      setPayingOrderMidtransNotConfigured(false);
      setPayingOrderMidtransError('');
      setPayingOrderMidtransOrderId('');
      setPayingOrderQrisDataUrl('');

      const effectiveLogo = activeBusiness?.receiptSettings?.logoUrl || activeBusiness?.logoUrl;

      fetch('/api/payments/midtrans/charge-qris', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessId: activeBusiness.id,
          grossAmount: payingOrder.grandTotal,
          customOrderId: `${activeBusiness.id}__TABLE_${payingOrder.id}_${Date.now()}`,
          customerName: payingOrder.customerName || `Meja ${payingOrder.tableNumber || ''}`,
        }),
      })
        .then(res => res.json())
        .then(async data => {
          if (!isMounted) return;
          if (data.notConfigured) {
            setPayingOrderMidtransNotConfigured(true);
            setPayingOrderMidtransError(data.error);
            setIsGeneratingPayingOrderQris(false);
            return;
          }
          if (!data.success) {
            setPayingOrderMidtransError(data.error || 'Gagal menerbitkan QRIS di Midtrans.');
            setIsGeneratingPayingOrderQris(false);
            return;
          }

          setPayingOrderMidtransOrderId(data.orderId);
          if (data.qrString) {
            const { dataUrl } = await generateDynamicQrisWithLogo(
              payingOrder.grandTotal,
              activeBusiness?.name || 'Tokokoe Resto',
              effectiveLogo,
              {},
              data.qrString
            );
            if (isMounted) setPayingOrderQrisDataUrl(dataUrl);
          } else if (data.qrUrl) {
            if (isMounted) setPayingOrderQrisDataUrl(data.qrUrl);
          }
          if (isMounted) setIsGeneratingPayingOrderQris(false);
        })
        .catch(err => {
          if (!isMounted) return;
          console.error('Error generating payingOrder QRIS:', err);
          setPayingOrderMidtransError(err.message || 'Gagal menghubungi API Midtrans.');
          setIsGeneratingPayingOrderQris(false);
        });

      return () => { isMounted = false; };
    }
  }, [payingOrder?.id, payingOrder?.grandTotal, payingOrderPaymentMethod, activeBusiness?.id, activeBusiness?.name, activeBusiness?.logoUrl, activeBusiness?.receiptSettings?.logoUrl]);

  // Real-time polling for table order QRIS payment detection
  React.useEffect(() => {
    if (!payingOrder || payingOrderPaymentMethod !== 'qris' || !payingOrderMidtransOrderId || !activeBusiness?.id) {
      return;
    }

    let isMounted = true;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/payments/midtrans/status?businessId=${activeBusiness.id}&orderId=${encodeURIComponent(payingOrderMidtransOrderId)}`);
        const data = await res.json();
        if (isMounted && data.success && data.isPaid) {
          clearInterval(interval);
          // Payment received into QR! Automatically finish table payment and print receipt!
          handleExecuteQrisPaymentForOrder();
        }
      } catch (e) {
        // silent polling catch
      }
    }, 3000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [payingOrder?.id, payingOrderPaymentMethod, payingOrderMidtransOrderId, activeBusiness?.id]);


  const handleOpenShift = async (e: React.FormEvent) => {
    e.preventDefault();
    setShiftLoading(true);
    setShiftError('');
    try {
      await openShift(shiftOpeningCash, shiftNotes);
      setShowShiftModal(false);
      setShiftNotes('');
    } catch (err: any) {
      setShiftError(err.message || 'Gagal membuka shift kasir.');
    } finally {
      setShiftLoading(false);
    }
  };

  const handleCloseShift = async (e: React.FormEvent) => {
    e.preventDefault();
    setShiftLoading(true);
    setShiftError('');
    try {
      await closeShift(shiftActualClosingCash, shiftNotes);
      setShowShiftModal(false);
      setShiftNotes('');
      setShiftActualClosingCash(0);
    } catch (err: any) {
      setShiftError(err.message || 'Gagal menutup shift kasir.');
    } finally {
      setShiftLoading(false);
    }
  };

  const handleCashMovementSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!movementReason.trim()) {
      alert('Alasan mutasi kas kasir wajib diisi.');
      return;
    }
    setShiftLoading(true);
    try {
      const res = await recordCashMovement(movementType, movementAmount, movementReason);
      if (res.success) {
        setShowCashMovementModal(false);
        setMovementReason('');
        setMovementAmount(50000);
      } else {
        alert(res.error || 'Gagal mencatat mutasi kas kasir.');
      }
    } finally {
      setShiftLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-5 -m-2 sm:-m-4 md:-m-6">
      {/* 1. OPERATIONAL SUB-BAR (Stitch F&B Meta Bar) */}
      <section className="bg-white border border-slate-200/90 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-4 shadow-xs">
        <div className="flex flex-wrap items-center gap-5">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-teal-50 text-teal-700 flex items-center justify-center border border-teal-200/60 shrink-0">
              <Coffee className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-bold text-sm text-slate-900">{activeBusiness?.name || 'Terserah'}</h2>
                <span className="text-xs text-slate-400">• {activeBranch?.name || 'Cabang Utama'}</span>
              </div>
              <div className="flex items-center gap-2 text-[11px] text-slate-500 font-medium mt-0.5">
                <span>{activeShift ? `Kasir: ${activeShift.cashierName}` : 'Kasir: Belum Buka Shift'}</span>
                <span>•</span>
                <span className="font-mono bg-slate-100 px-1.5 py-0.5 rounded text-slate-700 font-bold">
                  {activeShift?.notes || '#SF-01'}
                </span>
                <span>•</span>
                <span className="text-emerald-700 font-semibold flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  WIB Online
                </span>
              </div>
            </div>
          </div>

          {/* Quick Metrics */}
          <div className="hidden xl:flex items-center gap-4 bg-slate-50/90 px-4 py-2 rounded-xl border border-slate-200/80 text-xs text-slate-600">
            <div className="flex items-center gap-1.5">
              <span>Meja Terisi</span>
              <strong suppressHydrationWarning className="text-slate-900">{tables.filter(t => t.status === 'occupied').length} / {tables.length}</strong>
              <span className="text-slate-400 text-xs ml-0.5">&gt;</span>
            </div>
            <div className="w-px h-3.5 bg-slate-300" />
            <div className="flex items-center gap-1.5 text-emerald-700 font-bold">
              <span>Dapur KDS</span>
              <span className="text-emerald-600 font-semibold">Terhubung</span>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2.5">
          {incomingSelfOrders.length > 0 && (
            <button
              type="button"
              onClick={() => setShowIncomingOrdersModal(true)}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold shadow-md animate-pulse transition-all active:scale-95"
            >
              <BellRing className="w-3.5 h-3.5 animate-bounce" />
              <span>{incomingSelfOrders.length} Pesanan Meja Masuk!</span>
            </button>
          )}

          {/* Order Type Toggle */}
          <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200/80 text-xs font-semibold">
            <button
              onClick={() => setOrderType('dine_in')}
              className={`px-3.5 py-1.5 rounded-lg transition-all ${
                orderType === 'dine_in' ? 'bg-[#00897b] text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Dine-in
            </button>
            <button
              onClick={() => setOrderType('takeaway')}
              className={`px-3.5 py-1.5 rounded-lg transition-all ${
                orderType === 'takeaway' ? 'bg-[#00897b] text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Takeaway
            </button>
          </div>

          <Link
            href={`/app/${activeBusiness?.id}/fnb/kitchen`}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-semibold transition-colors border border-slate-200/70"
          >
            <ChefHat className="w-3.5 h-3.5 text-teal-600" />
            <span>KDS Dapur</span>
          </Link>

          <button
            onClick={() => setShowShiftModal(true)}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-white hover:bg-emerald-50 text-emerald-700 text-xs font-semibold border border-emerald-300/80 transition-colors shadow-2xs"
          >
            <Clock className="w-3.5 h-3.5 text-emerald-600" />
            <span>{activeShift ? 'Tutup Shift' : 'Buka Shift'}</span>
          </button>

          {activeShift && (
            <button
              onClick={() => setShowCashMovementModal(true)}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition-colors"
            >
              <ArrowDownLeft className="w-3.5 h-3.5 text-teal-600" />
              <span>Mutasi Kas</span>
            </button>
          )}
        </div>
      </section>

      {/* Incoming QR Table Orders Alert Banner */}
      {incomingSelfOrders.length > 0 && (
        <div className="bg-gradient-to-r from-amber-500/15 via-amber-500/10 to-orange-500/15 border-2 border-amber-400 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3 shadow-xs animate-in slide-in-from-top-2">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center shadow-xs shrink-0 animate-bounce">
              <BellRing className="w-5 h-5" />
            </div>
            <div>
              <h4 className="font-extrabold text-sm text-slate-900 flex items-center gap-2">
                <span>Ada {incomingSelfOrders.length} Pesanan Baru dari Meja QR!</span>
                <span className="text-[10px] bg-amber-600 text-white px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider">
                  Menunggu Konfirmasi Kasir
                </span>
              </h4>
              <p className="text-xs text-slate-600 mt-0.5">
                Pelanggan telah scan QR meja &amp; checkout. Periksa metode pembayaran (Bayar di Kasir / QRIS) sebelum diteruskan ke dapur.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowIncomingOrdersModal(true)}
            className="py-2.5 px-4 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-extrabold text-xs shadow-md transition-all flex items-center gap-1.5 active:scale-95"
          >
            <span>Lihat &amp; Teruskan ke Dapur 👨‍🍳</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* 2. POS MAIN STAGE: Split Layout */}
      <div className="grid grid-cols-12 gap-5 items-start">
        {/* LEFT 7-8 COLS: Catalog, Filters, Search & Grid */}
        <div className="col-span-12 lg:col-span-7 xl:col-span-8 flex flex-col gap-4">
          {/* Search & Active Table Bar */}
          <div className="bg-white p-3.5 rounded-2xl border border-slate-200/90 shadow-xs flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 flex-1 min-w-[200px] bg-slate-100/80 px-3.5 py-2 rounded-xl text-slate-700">
              <Search className="w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari menu kopi, pastry, minuman..."
                className="w-full bg-transparent border-0 outline-none text-xs text-slate-900 placeholder:text-slate-400 font-medium"
              />
            </div>

            {orderType === 'dine_in' && (
              <button
                onClick={() => setShowTableModal(true)}
                className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-teal-50/80 text-teal-800 border border-teal-200 hover:bg-teal-100 transition-colors text-xs font-semibold"
              >
                <UtensilsCrossed className="w-3.5 h-3.5 text-teal-600" />
                <span>Pilih Meja: <strong>{selectedTable}</strong></span>
              </button>
            )}
          </div>

          {/* Category Filter Chips */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-4 py-2 rounded-full text-xs font-semibold whitespace-nowrap transition-all shadow-xs ${
                  selectedCategory === cat
                    ? 'bg-[#00897b] text-white shadow-sm'
                    : 'bg-white text-slate-600 hover:bg-slate-50 border border-slate-200/90'
                }`}
              >
                {cat}
              </button>
            ))}
            <button
              title="Kategori Lainnya"
              className="p-2 rounded-full bg-white border border-slate-200/90 text-slate-400 hover:text-slate-700 hover:bg-slate-50 transition-colors shrink-0 shadow-xs"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
            <button
              title="Filter Menu"
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-white border border-slate-200/90 text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition-colors text-xs font-semibold shrink-0 shadow-xs ml-auto"
            >
              <SlidersHorizontal className="w-3.5 h-3.5 text-slate-500" />
              <span>Filter</span>
            </button>
          </div>

          {/* Menu Grid - 5 Columns on Desktop */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3.5">
            {filteredProducts.map((prod, idx) => {
              const isBestSeller = prod.tag === 'best_seller' || idx === 0;
              const isNew = prod.tag === 'new' || idx === 3;

              return (
                <div
                  key={prod.id}
                  onClick={() => handleProductClick(prod)}
                  className="bg-white rounded-2xl border border-slate-200/90 shadow-xs hover:shadow-md transition-all cursor-pointer flex flex-col overflow-hidden group active:scale-[0.98]"
                >
                  <div className="relative aspect-[4/3] w-full bg-slate-100 overflow-hidden">
                    {prod.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={prod.imageUrl}
                        alt={prod.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-slate-400">
                        <Coffee className="w-8 h-8" />
                      </div>
                    )}

                    {/* Promotional Badges matching reference screenshot */}
                    {isBestSeller && (
                      <span className="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-amber-500 text-white font-bold text-[9px] uppercase tracking-wider shadow-xs">
                        Best Seller
                      </span>
                    )}
                    {isNew && !isBestSeller && (
                      <span className="absolute top-2 right-2 px-2 py-0.5 rounded-full bg-emerald-600 text-white font-bold text-[9px] uppercase tracking-wider shadow-xs">
                        Baru
                      </span>
                    )}

                    {((prod.options && prod.options.length > 0) || (prod.modifiers && prod.modifiers.length > 0)) && !isBestSeller && !isNew && (
                      <span className="absolute top-2 left-2 px-1.5 py-0.5 rounded bg-teal-800/90 text-white font-bold text-[9px] uppercase tracking-wider shadow-xs">
                        Custom
                      </span>
                    )}
                  </div>

                  <div className="p-3 flex flex-col flex-1 justify-between gap-1.5">
                    <div>
                      <h3 className="font-bold text-xs text-slate-900 group-hover:text-teal-700 transition-colors line-clamp-1">
                        {prod.name}
                      </h3>
                      <p className="text-[11px] font-semibold text-slate-500 mt-0.5 tabular-nums">
                        {formatRupiah(prod.sellingPrice)}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleProductClick(prod);
                      }}
                      className="w-full mt-1.5 py-1.5 px-3 rounded-xl border border-teal-500/80 text-teal-700 bg-teal-50/40 hover:bg-teal-600 hover:text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-all shadow-2xs"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Tambah</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* RIGHT 4-5 COLS: Active Cart / Order Slip Inspector */}
        <div className="col-span-12 lg:col-span-5 xl:col-span-4 bg-white rounded-2xl border border-slate-200/90 shadow-sm flex flex-col sticky top-20 overflow-hidden">
          {/* Cart Header */}
          <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-sm text-slate-900">Pesanan Aktif</h3>
              <span className="text-[11px] font-semibold text-teal-800 bg-teal-50 border border-teal-200 px-2 py-0.5 rounded-md capitalize">
                {orderType === 'dine_in' ? 'Dine In' : 'Takeaway'}
              </span>
              {orderType === 'dine_in' && (
                <span className="text-[11px] font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-md">
                  {selectedTable}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 text-[11px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded font-medium">
                <Users className="w-3 h-3 text-slate-400" />
                <span>1</span>
              </div>
              {cart.length > 0 && (
                <button
                  onClick={clearCart}
                  className="text-[11px] text-slate-500 hover:text-rose-600 flex items-center gap-1 font-medium px-1.5 py-0.5 rounded hover:bg-rose-50 transition-colors"
                  title="Hapus Pesanan"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>Hapus</span>
                </button>
              )}
              <button
                className="text-slate-400 hover:text-slate-700 p-1 rounded hover:bg-slate-100 transition-colors"
                title="Opsi Lainnya"
              >
                <MoreHorizontal className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Cart Items List with independent variant rows */}
          <div className="p-4 flex flex-col gap-3 min-h-[260px] max-h-[380px] overflow-y-auto divide-y divide-slate-100">
            {selectedTableUnpaidSale && cart.length === 0 ? (
              <div className="p-4 rounded-2xl bg-gradient-to-br from-amber-50 to-orange-50 border-2 border-amber-300 shadow-xs space-y-3 my-auto">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-1 rounded-lg bg-amber-500 text-white font-black text-xs">
                      {selectedTableUnpaidSale.tableNumber}
                    </span>
                    <span className="font-extrabold text-xs text-slate-800">
                      {selectedTableUnpaidSale.customerName || 'Tamu Restoran'}
                    </span>
                  </div>
                  <span className="text-[10px] bg-amber-100 text-amber-900 border border-amber-300 font-extrabold px-2 py-0.5 rounded-full">
                    Belum Lunas (Unpaid)
                  </span>
                </div>

                <div className="text-xs text-slate-600 space-y-1">
                  <div className="flex justify-between">
                    <span>No. Nota:</span>
                    <span className="font-mono font-bold text-slate-800">{selectedTableUnpaidSale.saleNumber}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Status Dapur:</span>
                    <span className="font-bold capitalize text-slate-800">
                      {selectedTableUnpaidSale.orderStatus === 'waiting_cashier' ? 'Menunggu Kasir' :
                       selectedTableUnpaidSale.orderStatus === 'new' ? 'Antrean Dapur' :
                       selectedTableUnpaidSale.orderStatus === 'preparing' ? 'Sedang Dimasak' :
                       selectedTableUnpaidSale.orderStatus === 'ready' ? 'Siap Saji' : selectedTableUnpaidSale.orderStatus}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-500 pt-1">
                    {selectedTableUnpaidSale.lineItems.length} menu: {selectedTableUnpaidSale.lineItems.map(i => `${i.quantity}x ${i.productName}`).join(', ')}
                  </div>
                </div>

                <div className="pt-2 border-t border-amber-200/80 flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700">Total Tagihan:</span>
                  <span className="text-lg font-black text-slate-900 tabular-nums">
                    {formatRupiah(selectedTableUnpaidSale.grandTotal)}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setPayingOrder(selectedTableUnpaidSale);
                    setOrderCashAmount(selectedTableUnpaidSale.grandTotal);
                    setOrderPaymentError('');
                  }}
                  className="w-full py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs shadow-md shadow-emerald-600/20 flex items-center justify-center gap-1.5 active:scale-95 transition-all"
                >
                  <Banknote className="w-4 h-4" />
                  <span>Bayar Kasir Tunai Meja Ini 💵</span>
                </button>
              </div>
            ) : cart.length === 0 ? (
              <div className="py-16 text-center text-slate-400 flex flex-col items-center justify-center gap-2 my-auto">
                <div className="w-16 h-16 rounded-full bg-teal-50/80 text-teal-600 flex items-center justify-center border border-teal-100 mb-1">
                  <Coffee className="w-8 h-8 stroke-1 text-teal-500" />
                </div>
                <h4 className="font-bold text-sm text-slate-800">Keranjang masih kosong</h4>
                <p className="text-xs text-slate-400 max-w-[210px] text-center leading-relaxed">
                  Pilih menu dari sebelah kiri untuk mulai menambahkan pesanan.
                </p>
              </div>
            ) : (
              cart.map((item, idx) => (
                <div key={`${item.productId}_${idx}`} className="pt-2.5 first:pt-0 flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-xs text-slate-900 truncate">
                      {item.productName}
                    </div>
                    {item.selectedOptions && Object.keys(item.selectedOptions).length > 0 && (
                      <div className="text-[10px] text-teal-700 font-medium">
                        {Object.entries(item.selectedOptions).map(([k, v]) => `${k}: ${v}`).join(' • ')}
                      </div>
                    )}
                    {item.selectedModifiers && item.selectedModifiers.length > 0 && (
                      <div className="text-[10px] text-purple-700 font-medium">
                        + {item.selectedModifiers.join(', ')}
                      </div>
                    )}
                    {item.notes && (
                      <div className="text-[10px] text-amber-700 italic">
                        Catatan: {item.notes}
                      </div>
                    )}
                    <div className="text-[11px] text-slate-500 tabular-nums mt-0.5">
                      {formatRupiah(item.unitPrice)}
                    </div>
                  </div>

                  {/* Quantity Stepper */}
                  <div className="flex items-center gap-1.5 bg-slate-100 rounded-lg p-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => updateQuantityByIndex(idx, -1)}
                      className="w-5 h-5 rounded bg-white text-slate-700 hover:bg-slate-200 flex items-center justify-center text-xs shadow-2xs"
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                    <span className="text-xs font-bold text-slate-900 w-4 text-center tabular-nums">
                      {item.quantity}
                    </span>
                    <button
                      type="button"
                      onClick={() => updateQuantityByIndex(idx, 1)}
                      className="w-5 h-5 rounded bg-white text-slate-700 hover:bg-slate-200 flex items-center justify-center text-xs shadow-2xs"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <div className="text-right font-bold text-xs text-slate-900 min-w-[65px] tabular-nums">
                      {formatRupiah(item.subtotal)}
                    </div>
                    <button
                      type="button"
                      onClick={() => removeFromCartByIndex(idx)}
                      className="text-slate-400 hover:text-rose-600 transition-colors p-0.5"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Price Breakdown & Action Buttons */}
          <div className="p-4 bg-slate-50/90 border-t border-slate-100 flex flex-col gap-2">
            {orderFeedbackMsg && (
              <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px] font-semibold flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{orderFeedbackMsg}</span>
              </div>
            )}

            <div className="flex items-center justify-between text-xs text-slate-600">
              <span>Subtotal</span>
              <span className="tabular-nums font-semibold">{formatRupiah(subtotal)}</span>
            </div>
            {taxRate > 0 && (
              <div className="flex items-center justify-between text-xs text-slate-600">
                <span>Pajak Resto (PB1 {taxRate}%)</span>
                <span className="tabular-nums font-semibold">{formatRupiah(tax)}</span>
              </div>
            )}
            {serviceChargeRate > 0 && (
              <div className="flex items-center justify-between text-xs text-slate-600">
                <span>Service Charge ({serviceChargeRate}%)</span>
                <span className="tabular-nums font-semibold">{formatRupiah(serviceCharge)}</span>
              </div>
            )}
            <div className="flex items-center justify-between text-base font-bold text-slate-900 pt-2 border-t border-slate-200">
              <span className="text-sm font-bold text-slate-900">Total Tagihan</span>
              <span className="text-[#00c49f] font-black text-xl tabular-nums">{formatRupiah(grandTotal)}</span>
            </div>

            <div className="flex flex-col gap-2 mt-2">
              <button
                type="button"
                onClick={() => {
                  setPaidAmount(grandTotal);
                  setShowPaymentModal(true);
                }}
                disabled={cart.length === 0}
                className="w-full py-3.5 px-4 rounded-xl bg-[#00c49f] hover:bg-[#00b290] text-slate-950 font-black text-sm flex items-center justify-center gap-2 shadow-md shadow-teal-500/20 active:scale-[0.98] transition-all disabled:opacity-40"
              >
                <CreditCard className="w-4 h-4 text-slate-950" />
                <span>Bayar Sekarang ({formatRupiah(grandTotal)})</span>
                <ChevronRight className="w-4 h-4 ml-1" />
              </button>

              {orderType === 'dine_in' && (
                <button
                  type="button"
                  onClick={handleOpenOrder}
                  disabled={cart.length === 0 || isOpenOrderProcessing}
                  className="py-2.5 px-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs shadow-xs transition-all flex items-center justify-center gap-1.5 disabled:opacity-40"
                >
                  <ChefHat className="w-3.5 h-3.5 text-teal-400" />
                  <span>{isOpenOrderProcessing ? 'Mengirim...' : 'Kirim Pesanan ke KDS Dapur'}</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 3. TABLE SELECTION MODAL */}
      {showTableModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
              <div>
                <h3 className="font-bold text-base text-slate-900">Pilih Meja Dine-in</h3>
                <p className="text-xs text-slate-500">Pilih meja untuk mencatat pesanan, pindah meja, atau gabung meja</p>
              </div>
              <button onClick={() => setShowTableModal(false)} className="text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-3 sm:grid-cols-4 gap-3 mb-6 max-h-80 overflow-y-auto p-1">
              {tables.map((t) => (
                <div
                  key={t.id}
                  onClick={() => {
                    setSelectedTableId(t.id);
                    setSelectedTable(t.tableNumber);
                    setShowTableModal(false);
                  }}
                  className={`p-3 rounded-xl border text-center transition-all flex flex-col items-center gap-1 cursor-pointer hover:shadow-xs ${
                    selectedTableId === t.id
                      ? 'border-teal-600 bg-teal-50 text-teal-800 font-bold ring-2 ring-teal-500/20'
                      : t.status === 'occupied'
                      ? 'border-rose-200 bg-rose-50/70 text-rose-800'
                      : 'border-slate-200 bg-white hover:border-slate-300 text-slate-800'
                  }`}
                >
                  <span className="text-xs font-semibold">{t.tableNumber}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                    t.status === 'occupied' ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'
                  }`}>
                    {t.status === 'occupied' ? 'Terisi (Ada Bill)' : 'Kosong'}
                  </span>
                  {t.customerName && (
                    <span className="text-[10px] text-slate-500 truncate max-w-full">
                      {t.customerName}
                    </span>
                  )}
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-slate-100">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowTableModal(false);
                    setShowMoveModal(true);
                  }}
                  className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs transition-colors"
                >
                  Pindah Meja
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowTableModal(false);
                    setShowMergeModal(true);
                  }}
                  className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs transition-colors"
                >
                  Gabung Meja
                </button>
              </div>
              <button
                onClick={() => setShowTableModal(false)}
                className="px-4 py-2 rounded-lg bg-slate-100 text-slate-700 font-semibold text-xs"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3.1 PRODUCT CUSTOMIZATION MODAL (OPTIONS & MODIFIERS) */}
      {showCustomizeModal && customizingProduct && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <div>
                <h3 className="font-bold text-base text-slate-900">{customizingProduct.name}</h3>
                <p className="text-xs text-slate-500">Pilih varian, topping, dan catatan pesanan</p>
              </div>
              <button onClick={() => setShowCustomizeModal(false)} className="text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 max-h-96 overflow-y-auto pr-1">
              {/* Product Options */}
              {customizingProduct.options?.map((opt) => (
                <div key={opt.name} className="space-y-2">
                  <label className="text-xs font-bold text-slate-800 uppercase tracking-wider block">
                    {opt.name}
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {opt.choices.map((choice) => (
                      <button
                        type="button"
                        key={choice.label}
                        onClick={() => setSelectedOptions(prev => ({ ...prev, [opt.name]: choice.label }))}
                        className={`p-2.5 rounded-xl border text-xs font-semibold text-left flex justify-between items-center transition-all ${
                          selectedOptions[opt.name] === choice.label
                            ? 'border-teal-600 bg-teal-50 text-teal-800 shadow-2xs'
                            : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        <span>{choice.label}</span>
                        {choice.extraPrice > 0 && (
                          <span className="text-[10px] text-teal-700 font-bold">
                            +{formatRupiah(choice.extraPrice)}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              ))}

              {/* Product Modifiers */}
              {customizingProduct.modifiers && customizingProduct.modifiers.length > 0 && (
                <div className="space-y-2 pt-2 border-t border-slate-100">
                  <label className="text-xs font-bold text-slate-800 uppercase tracking-wider block">
                    Topping / Add-on Tambahan
                  </label>
                  <div className="space-y-1.5">
                    {customizingProduct.modifiers.map((mod) => {
                      const isChecked = selectedModifiers.includes(mod.name);
                      return (
                        <label
                          key={mod.name}
                          className={`flex items-center justify-between p-2.5 rounded-xl border cursor-pointer text-xs transition-all ${
                            isChecked ? 'border-purple-600 bg-purple-50 text-purple-900' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          <div className="flex items-center gap-2.5">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedModifiers(prev => [...prev, mod.name]);
                                } else {
                                  setSelectedModifiers(prev => prev.filter(m => m !== mod.name));
                                }
                              }}
                              className="rounded text-teal-600 focus:ring-teal-500"
                            />
                            <span className="font-semibold">{mod.name}</span>
                          </div>
                          {mod.price > 0 && (
                            <span className="text-[11px] font-bold text-purple-700">
                              +{formatRupiah(mod.price)}
                            </span>
                          )}
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Line Notes */}
              <div className="space-y-1.5 pt-2 border-t border-slate-100">
                <label className="text-xs font-semibold text-slate-700 block">
                  Catatan Tambahan untuk Dapur (Notes)
                </label>
                <input
                  type="text"
                  value={lineItemNotes}
                  onChange={(e) => setLineItemNotes(e.target.value)}
                  placeholder="Contoh: Less sugar / Pisahkan sedotan / Sangat panas"
                  className="w-full bg-slate-50 text-xs p-2.5 rounded-xl border border-slate-200 focus:bg-white focus:border-teal-500 outline-none"
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-4 mt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowCustomizeModal(false)}
                className="px-4 py-2 rounded-xl text-slate-600 font-semibold text-xs hover:bg-slate-100"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => {
                  addToCartWithCustomization(
                    customizingProduct,
                    selectedOptions,
                    selectedModifiers,
                    lineItemNotes
                  );
                  setShowCustomizeModal(false);
                }}
                className="px-5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs shadow-sm flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Tambahkan ke Pesanan</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3.2 MOVE TABLE MODAL */}
      {showMoveModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <h3 className="font-bold text-base text-slate-900">Pindah Meja Tamu</h3>
              <button onClick={() => setShowMoveModal(false)} className="text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-600 block mb-1">Meja Asal</label>
                <div className="p-2.5 rounded-xl bg-slate-100 text-slate-800 text-xs font-bold">
                  {selectedTable} ({tables.find(t => t.id === selectedTableId || t.tableNumber === selectedTable)?.status === 'occupied' ? 'Terisi' : 'Kosong'})
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Pilih Meja Tujuan (Harus Kosong)</label>
                <select
                  value={targetTableId}
                  onChange={(e) => setTargetTableId(e.target.value)}
                  className="w-full text-xs p-2.5 rounded-xl border border-slate-300 outline-none"
                >
                  <option value="">-- Pilih Meja Tujuan --</option>
                  {tables
                    .filter(t => t.status === 'available' && t.id !== selectedTableId && t.tableNumber !== selectedTable)
                    .map(t => (
                      <option key={t.id} value={t.id}>
                        {t.tableNumber} (Kapasitas {t.capacity})
                      </option>
                    ))}
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowMoveModal(false)}
                  className="px-3 py-2 rounded-xl text-slate-600 font-semibold text-xs"
                >
                  Batal
                </button>
                <button
                  type="button"
                  disabled={!targetTableId || tableActionLoading}
                  onClick={async () => {
                    const fromTbl = tables.find(t => t.id === selectedTableId || t.tableNumber === selectedTable);
                    if (!fromTbl) return;
                    setTableActionLoading(true);
                    try {
                      const res = await moveTable(fromTbl.id, targetTableId);
                      if (res.success) {
                        const targetTbl = tables.find(t => t.id === targetTableId);
                        if (targetTbl) {
                          setSelectedTableId(targetTbl.id);
                          setSelectedTable(targetTbl.tableNumber);
                        }
                        setShowMoveModal(false);
                        alert(`Meja ${selectedTable} berhasil dipindahkan!`);
                      } else {
                        alert(res.error || 'Gagal memindahkan meja.');
                      }
                    } finally {
                      setTableActionLoading(false);
                    }
                  }}
                  className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs disabled:opacity-50"
                >
                  {tableActionLoading ? 'Memindahkan...' : 'Konfirmasi Pindah'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 3.3 MERGE TABLE MODAL */}
      {showMergeModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <h3 className="font-bold text-base text-slate-900">Gabung Meja (Merge)</h3>
              <button onClick={() => setShowMergeModal(false)} className="text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-600 block mb-1">Meja Asal</label>
                <div className="p-2.5 rounded-xl bg-slate-100 text-slate-800 text-xs font-bold">
                  {selectedTable}
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Pilih Meja Target Gabungan</label>
                <select
                  value={targetTableId}
                  onChange={(e) => setTargetTableId(e.target.value)}
                  className="w-full text-xs p-2.5 rounded-xl border border-slate-300 outline-none"
                >
                  <option value="">-- Pilih Meja Target --</option>
                  {tables
                    .filter(t => t.id !== selectedTableId && t.tableNumber !== selectedTable)
                    .map(t => (
                      <option key={t.id} value={t.id}>
                        {t.tableNumber} ({t.status === 'occupied' ? 'Terisi' : 'Kosong'})
                      </option>
                    ))}
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowMergeModal(false)}
                  className="px-3 py-2 rounded-xl text-slate-600 font-semibold text-xs"
                >
                  Batal
                </button>
                <button
                  type="button"
                  disabled={!targetTableId || tableActionLoading}
                  onClick={async () => {
                    const fromTbl = tables.find(t => t.id === selectedTableId || t.tableNumber === selectedTable);
                    if (!fromTbl) return;
                    setTableActionLoading(true);
                    try {
                      const res = await mergeTables(fromTbl.id, targetTableId);
                      if (res.success) {
                        const targetTbl = tables.find(t => t.id === targetTableId);
                        if (targetTbl) {
                          setSelectedTableId(targetTbl.id);
                          setSelectedTable(targetTbl.tableNumber);
                        }
                        setShowMergeModal(false);
                        alert(`Meja ${selectedTable} berhasil digabungkan ke meja target!`);
                      } else {
                        alert(res.error || 'Gagal menggabungkan meja.');
                      }
                    } finally {
                      setTableActionLoading(false);
                    }
                  }}
                  className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs disabled:opacity-50"
                >
                  {tableActionLoading ? 'Menggabungkan...' : 'Konfirmasi Gabung'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 4. CASH & QRIS PAYMENT MODAL (GENERATE HARGA & CETAK NOTA) */}
      {showPaymentModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 animate-in zoom-in-95">
            <div className="flex items-center justify-between mb-3 pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                {checkoutPaymentMethod === 'cash' ? (
                  <Banknote className="w-5 h-5 text-emerald-600" />
                ) : (
                  <QrCodeIcon className="w-5 h-5 text-teal-600" />
                )}
                <h3 className="font-extrabold text-base text-slate-900">
                  Pembayaran Kasir {checkoutPaymentMethod === 'cash' ? 'Tunai' : 'QRIS Dinamis'}
                </h3>
              </div>
              <button 
                onClick={() => { setShowPaymentModal(false); setPaymentError(''); }} 
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Tab Selector: Tunai vs QRIS Generate Harga */}
            <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-2xl mb-4">
              <button
                type="button"
                onClick={() => {
                  setCheckoutPaymentMethod('cash');
                  setPaidAmount(grandTotal);
                  setPaymentError('');
                }}
                className={`py-2 px-3 rounded-xl text-xs font-extrabold flex items-center justify-center gap-1.5 transition-all ${
                  checkoutPaymentMethod === 'cash'
                    ? 'bg-white text-slate-900 shadow-xs scale-101'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Banknote className="w-4 h-4 text-emerald-600" />
                <span>💵 Tunai (Cash)</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setCheckoutPaymentMethod('qris');
                  setPaymentError('');
                }}
                className={`py-2 px-3 rounded-xl text-xs font-extrabold flex items-center justify-center gap-1.5 transition-all ${
                  checkoutPaymentMethod === 'qris'
                    ? 'bg-white text-slate-900 shadow-xs scale-101'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <QrCodeIcon className="w-4 h-4 text-teal-600" />
                <span>📱 QRIS (Generate Harga)</span>
              </button>
            </div>

            {paymentError && (
              <div className="mb-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{paymentError}</span>
              </div>
            )}

            {/* TAB 1: TUNAI (CASH) */}
            {checkoutPaymentMethod === 'cash' && (
              <div className="space-y-4">
                <div className="bg-slate-50 p-3.5 rounded-2xl text-center border border-slate-200">
                  <span className="text-[11px] text-slate-500 uppercase font-bold tracking-wider">Total Tagihan Kasir</span>
                  <div className="text-2xl font-black text-slate-900 mt-0.5 tabular-nums">
                    {formatRupiah(grandTotal)}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Uang Diterima dari Pelanggan (Rp) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="number"
                    value={paidAmount || ''}
                    onChange={(e) => setPaidAmount(Number(e.target.value))}
                    placeholder="0"
                    autoFocus
                    className="w-full bg-white text-xl font-black text-slate-900 px-4 py-3 rounded-2xl border-2 border-slate-300 focus:border-teal-500 outline-none tabular-nums"
                  />
                </div>

                {/* Quick Preset Buttons for Indonesian Rupiah Denominations */}
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setPaidAmount(grandTotal)}
                    className="py-2.5 rounded-xl bg-teal-50 hover:bg-teal-100 text-teal-900 text-xs font-extrabold border border-teal-200 transition-all active:scale-95"
                  >
                    Uang Pas
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaidAmount(Math.ceil(grandTotal / 50000) * 50000 || 50000)}
                    className="py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold transition-all active:scale-95"
                  >
                    {formatRupiah(Math.ceil(grandTotal / 50000) * 50000 || 50000)}
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaidAmount(Math.ceil(grandTotal / 100000) * 100000 || 100000)}
                    className="py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold transition-all active:scale-95"
                  >
                    {formatRupiah(Math.ceil(grandTotal / 100000) * 100000 || 100000)}
                  </button>
                </div>

                <div className={`p-3.5 rounded-2xl border flex items-center justify-between transition-all ${
                  paidAmount >= grandTotal
                    ? 'bg-emerald-500/10 border-emerald-300 text-emerald-900'
                    : 'bg-amber-50 border-amber-200 text-amber-900'
                }`}>
                  <div>
                    <span className="text-xs font-bold block">
                      {paidAmount >= grandTotal ? 'Kembalian:' : 'Kekurangan Uang:'}
                    </span>
                    <span className="text-[10px] text-slate-500">
                      {paidAmount >= grandTotal ? 'Diberikan ke pelanggan' : 'Uang belum mencukupi tagihan'}
                    </span>
                  </div>
                  <span className={`text-xl font-black tabular-nums ${
                    paidAmount >= grandTotal ? 'text-emerald-700' : 'text-amber-700'
                  }`}>
                    {paidAmount >= grandTotal
                      ? formatRupiah(changeAmount)
                      : formatRupiah(grandTotal - paidAmount)}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={handleCheckout}
                  disabled={isProcessing || paidAmount < grandTotal}
                  className="w-full py-3.5 rounded-2xl bg-teal-600 hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-black text-sm shadow-lg shadow-teal-600/20 transition-all flex items-center justify-center gap-2 active:scale-98"
                >
                  {isProcessing ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Memproses Transaksi...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Selesaikan & Cetak Struk 🖨️</span>
                    </>
                  )}
                </button>
              </div>
            )}

            {/* TAB 2: QRIS (MIDTRANS ATAU QRIS TOKO FISIK) */}
            {checkoutPaymentMethod === 'qris' && (
              <div className="space-y-3.5 text-center">
                {!isMidtransActive ? (
                  /* MODE 1: QRIS TOKO FISIK / MANUAL (MIDTRANS OFF) */
                  <div className="space-y-3.5">
                    <div className="p-4 rounded-2xl bg-slate-50 border-2 border-slate-900 mx-auto max-w-sm space-y-3">
                      <div className="w-12 h-12 rounded-2xl bg-teal-600 text-white flex items-center justify-center mx-auto shadow-md">
                        <QrCodeIcon className="w-6 h-6" />
                      </div>
                      <div>
                        <h4 className="font-extrabold text-sm text-slate-900">Pembayaran QRIS Toko (Statis / Fisik)</h4>
                        <p className="text-xs text-slate-500 mt-1">
                          Arahkan pelanggan men-scan stiker QRIS di meja kasir Anda (BCA, Mandiri, BRI, GoPay, OVO, DANA, ShopeePay, dll).
                        </p>
                      </div>

                      <div className="p-3 bg-white rounded-xl border border-slate-200">
                        <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">Total Tagihan</span>
                        <span className="text-2xl font-black text-slate-900 tabular-nums">{formatRupiah(grandTotal)}</span>
                      </div>

                      <div className="text-[11px] text-teal-900 bg-teal-50 p-2.5 rounded-xl border border-teal-200">
                        💡 Transaksi ini akan otomatis tercatat sebagai pembayaran <strong>QRIS</strong> dan struk dapat langsung dicetak.
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={handleCheckoutQris}
                      disabled={isProcessing}
                      className="w-full py-3.5 rounded-2xl bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white font-extrabold text-sm shadow-lg shadow-teal-600/20 transition-all flex items-center justify-center gap-2 active:scale-98"
                    >
                      {isProcessing ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          <span>Memproses Transaksi...</span>
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="w-4 h-4" />
                          <span>Konfirmasi Lunas QRIS &amp; Cetak Struk 🖨️</span>
                        </>
                      )}
                    </button>
                  </div>
                ) : checkoutMidtransError ? (
                  /* KENDALA MIDTRANS: TAMPILKAN ALERT & OPSI LANJUTKAN VIA QRIS TOKO FISIK */
                  <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-left space-y-3">
                    <div className="flex items-center gap-2 text-rose-800 font-bold text-xs">
                      <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                      <span>Kendala Penerbitan QRIS Midtrans</span>
                    </div>
                    <p className="text-xs text-rose-700 leading-relaxed">{checkoutMidtransError}</p>
                    <p className="text-[10px] text-slate-500">
                      Anda tetap dapat menyelesaikan transaksi ini menggunakan stiker QRIS fisik toko Anda tanpa harus beralih ke Tunai.
                    </p>

                    <div className="pt-2 border-t border-rose-200 flex flex-col sm:flex-row gap-2">
                      <button
                        type="button"
                        onClick={handleCheckoutQris}
                        disabled={isProcessing}
                        className="flex-1 py-2.5 px-3 rounded-xl bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white font-bold text-xs shadow-sm flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        {isProcessing ? (
                          <>
                            <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            <span>Menyimpan Transaksi...</span>
                          </>
                        ) : (
                          <>
                            <CheckCircle2 className="w-4 h-4" />
                            <span>Gunakan QRIS Fisik Toko &amp; Cetak Struk 🖨️</span>
                          </>
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => setCheckoutPaymentMethod('cash')}
                        className="py-2.5 px-3 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold text-xs"
                      >
                        Beralih ke Tunai
                      </button>
                    </div>
                  </div>
                ) : isGeneratingCheckoutQris ? (
                  <div className="py-12 flex flex-col items-center justify-center text-xs text-slate-500 gap-3">
                    <div className="w-8 h-8 border-3 border-teal-600 border-t-transparent rounded-full animate-spin" />
                    <span className="font-semibold text-slate-700">Menerbitkan QRIS Resmi Midtrans...</span>
                    <span className="text-[10px] text-slate-400">Menghubungkan ke Bank Indonesia &amp; Midtrans Core API</span>
                  </div>
                ) : (
                  <>
                    {/* Dynamic QRIS Container */}
                    <div className="bg-slate-50 p-3.5 rounded-2xl border-2 border-slate-900 mx-auto max-w-[260px] space-y-2">
                      <div className="text-[9.5px] font-black tracking-widest text-slate-900 bg-white py-0.5 px-2 rounded border border-slate-200 uppercase flex items-center justify-center gap-1.5">
                        <QrCodeIcon className="w-3.5 h-3.5 text-teal-700" />
                        <span>MIDTRANS QRIS RESMI</span>
                      </div>

                      <div className="p-2 bg-white rounded-xl shadow-xs">
                        {checkoutQrisDataUrl ? (
                          <img
                            src={checkoutQrisDataUrl}
                            alt="QRIS Dinamis Tokokoe"
                            className="w-48 h-48 mx-auto object-contain"
                          />
                        ) : (
                          <div className="w-48 h-48 flex flex-col items-center justify-center text-xs text-slate-400 gap-2">
                            <div className="w-6 h-6 border-2 border-teal-600 border-t-transparent rounded-full animate-spin" />
                            <span>Membuat QRIS Dinamis...</span>
                          </div>
                        )}
                      </div>

                      <div className="text-[10px] text-slate-500 font-semibold truncate px-1">
                        Order ID: {checkoutMidtransOrderId || 'MIDTRANS-QRIS'}
                      </div>
                    </div>

                    {/* Auto Generated Price Box */}
                    <div className="bg-teal-50 p-3 rounded-2xl border border-teal-200 text-center">
                      <div className="flex items-center justify-center gap-1.5 text-[11px] font-bold text-teal-800">
                        <Sparkles className="w-3.5 h-3.5 text-teal-600" />
                        <span>Nominal Terisi Otomatis di QR:</span>
                      </div>
                      <div className="text-2xl font-black text-teal-950 mt-0.5 tabular-nums">
                        {formatRupiah(grandTotal)}
                      </div>
                      <p className="text-[10px] text-teal-700 mt-0.5">
                        Pelanggan tinggal scan dari aplikasi m-Banking atau e-wallet tanpa ketik nominal
                      </p>
                    </div>

                    {/* Real-time Status Indicator */}
                    <div className="flex items-center justify-center gap-2 py-1 px-3 bg-emerald-50 rounded-full border border-emerald-200 text-emerald-800 text-[11px] font-bold">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                      <span>Menunggu Pembayaran (Uang Masuk Terdeteksi Otomatis)</span>
                    </div>

                    {/* Confirm QRIS Received & Auto Print Button */}
                    <button
                      type="button"
                      onClick={handleCheckoutQris}
                      disabled={isProcessing}
                      className="w-full py-3.5 rounded-2xl bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white font-extrabold text-sm shadow-lg shadow-teal-600/20 transition-all flex items-center justify-center gap-2 active:scale-98"
                    >
                      {isProcessing ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          <span>Memverifikasi Transaksi...</span>
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="w-4 h-4" />
                          <span>Konfirmasi Lunas QRIS &amp; Cetak Struk 🖨️</span>
                        </>
                      )}
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 5. THERMAL RECEIPT MODAL */}
      <ReceiptModal
        isOpen={showReceiptModal && !!lastSale}
        onClose={() => setShowReceiptModal(false)}
        sale={lastSale}
        businessName={activeBusiness?.name}
        branchName={activeBranch?.name}
      />

      {/* 6. SHIFT OPEN / CLOSE MODAL */}
      {showShiftModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-teal-600" />
                <h3 className="font-bold text-base text-slate-900">
                  {activeShift ? 'Tutup Sesi Shift Kasir' : 'Buka Sesi Shift Kasir'}
                </h3>
              </div>
              <button 
                onClick={() => { setShowShiftModal(false); setShiftError(''); }} 
                className="text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {shiftError && (
              <div className="mb-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">
                {shiftError}
              </div>
            )}

            {activeShift ? (
              <form onSubmit={handleCloseShift} className="space-y-4">
                <div className="p-3 bg-slate-50 rounded-xl space-y-1.5 text-xs text-slate-700">
                  <div className="flex justify-between">
                    <span>Kasir Bertugas:</span>
                    <strong className="text-slate-900">{activeShift.cashierName}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>Modal Kas Awal:</span>
                    <strong className="tabular-nums">{formatRupiah(activeShift.openingCash)}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>Total Penjualan Tunai:</span>
                    <strong className="tabular-nums text-teal-700">+{formatRupiah(activeShift.cashSalesTotal)}</strong>
                  </div>
                  {activeShift.cashInTotal > 0 && (
                    <div className="flex justify-between">
                      <span>Mutasi Kas Masuk:</span>
                      <strong className="tabular-nums text-emerald-700">+{formatRupiah(activeShift.cashInTotal)}</strong>
                    </div>
                  )}
                  {activeShift.cashOutTotal > 0 && (
                    <div className="flex justify-between">
                      <span>Mutasi Kas Keluar:</span>
                      <strong className="tabular-nums text-rose-700">-{formatRupiah(activeShift.cashOutTotal)}</strong>
                    </div>
                  )}
                  <div className="flex justify-between border-t border-slate-200 pt-1 font-bold text-slate-900">
                    <span>Kas Diharapkan di Laci:</span>
                    <strong className="tabular-nums">{formatRupiah(activeShift.expectedClosingCash)}</strong>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Hitungan Fisik Uang di Laci Kasir (Rp) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="number"
                    required
                    value={shiftActualClosingCash || ''}
                    onChange={(e) => setShiftActualClosingCash(Number(e.target.value))}
                    placeholder="Contoh: 380000"
                    className="w-full bg-white text-sm font-bold text-slate-900 px-3.5 py-2.5 rounded-xl border border-slate-300 focus:border-teal-500 outline-none tabular-nums"
                  />
                  {shiftActualClosingCash > 0 && (
                    <div className="text-xs mt-1">
                      Selisih Kas: {' '}
                      <span className={`font-bold ${shiftActualClosingCash - activeShift.expectedClosingCash === 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {formatRupiah(shiftActualClosingCash - activeShift.expectedClosingCash)}
                      </span>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Catatan Shift
                  </label>
                  <textarea
                    rows={2}
                    value={shiftNotes}
                    onChange={(e) => setShiftNotes(e.target.value)}
                    placeholder="Catatan kendala atau serah terima..."
                    className="w-full text-xs p-2.5 rounded-xl border border-slate-300 focus:border-teal-500 outline-none"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => { setShowShiftModal(false); setShiftError(''); }}
                    className="px-4 py-2 rounded-xl text-slate-600 text-xs font-semibold"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={shiftLoading}
                    className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs disabled:opacity-50"
                  >
                    {shiftLoading ? 'Menutup Shift...' : 'Tutup Shift Kasir'}
                  </button>
                </div>
              </form>
            ) : (
              <form onSubmit={handleOpenShift} className="space-y-4">
                <p className="text-xs text-slate-500">
                  Buka sesi kasir baru untuk mulai mencatat transaksi tunai dan mutasi kas di cabang ini.
                </p>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Modal Kas Awal di Laci (Rp) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="number"
                    required
                    value={shiftOpeningCash || ''}
                    onChange={(e) => setShiftOpeningCash(Number(e.target.value))}
                    placeholder="200000"
                    className="w-full bg-white text-sm font-bold text-slate-900 px-3.5 py-2.5 rounded-xl border border-slate-300 focus:border-teal-500 outline-none tabular-nums"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Keterangan Sesi
                  </label>
                  <input
                    type="text"
                    value={shiftNotes}
                    onChange={(e) => setShiftNotes(e.target.value)}
                    placeholder="Shift Pagi / Shift Sore"
                    className="w-full text-xs p-2.5 rounded-xl border border-slate-300 focus:border-teal-500 outline-none"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => { setShowShiftModal(false); setShiftError(''); }}
                    className="px-4 py-2 rounded-xl text-slate-600 text-xs font-semibold"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={shiftLoading}
                    className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs shadow-xs disabled:opacity-50"
                  >
                    {shiftLoading ? 'Membuka...' : 'Buka Shift Sekarang'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* 5. CASH MOVEMENT MODAL (KAS MASUK / KAS KELUAR) */}
      {showCashMovementModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
              <h3 className="font-bold text-base text-slate-900">Mutasi Kas Laci Kasir F&B</h3>
              <button onClick={() => setShowCashMovementModal(false)} className="text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCashMovementSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-2 bg-slate-100 p-1 rounded-xl">
                <button
                  type="button"
                  onClick={() => setMovementType('cash_in')}
                  className={`py-2 text-xs font-bold rounded-lg transition-all ${
                    movementType === 'cash_in' 
                      ? 'bg-emerald-600 text-white shadow-xs' 
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  + Kas Masuk (In)
                </button>
                <button
                  type="button"
                  onClick={() => setMovementType('cash_out')}
                  className={`py-2 text-xs font-bold rounded-lg transition-all ${
                    movementType === 'cash_out' 
                      ? 'bg-rose-600 text-white shadow-xs' 
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  - Kas Keluar (Out)
                </button>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Nominal Uang (Rp) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="number"
                  required
                  min={1}
                  value={movementAmount || ''}
                  onChange={(e) => setMovementAmount(Number(e.target.value))}
                  placeholder="50000"
                  className="w-full bg-white text-sm font-bold text-slate-900 px-3.5 py-2.5 rounded-xl border border-slate-300 focus:border-teal-500 outline-none tabular-nums"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Alasan / Keperluan Mutasi <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={movementReason}
                  onChange={(e) => setMovementReason(e.target.value)}
                  placeholder="Contoh: Beli es batu darurat / Uang kembalian koin"
                  className="w-full bg-white text-xs text-slate-900 px-3.5 py-2.5 rounded-xl border border-slate-300 focus:border-teal-500 outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowCashMovementModal(false)}
                  className="px-4 py-2 rounded-xl text-slate-600 text-xs font-semibold"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={shiftLoading}
                  className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs shadow-xs disabled:opacity-50"
                >
                  {shiftLoading ? 'Menyimpan...' : 'Catat Mutasi Kas'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 6. INCOMING QR TABLE SELF-ORDERS MODAL */}
      {showIncomingOrdersModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl max-w-2xl w-full max-h-[90vh] flex flex-col p-6 shadow-2xl border border-slate-200 overflow-hidden animate-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="font-extrabold text-base text-slate-900 flex items-center gap-2">
                  <BellRing className="w-5 h-5 text-amber-500 animate-bounce" />
                  <span>Pesanan Meja Masuk ({incomingSelfOrders.length})</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Pesanan mandiri pelanggan via scan QR meja. Pilih tindakan untuk meneruskan ke dapur.
                </p>
              </div>
              <button
                onClick={() => setShowIncomingOrdersModal(false)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="overflow-y-auto space-y-3.5 py-4 flex-1">
              {incomingSelfOrders.length === 0 ? (
                <div className="text-center py-12 text-slate-400">
                  <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-2" />
                  <p className="text-sm font-bold text-slate-700">Semua pesanan meja telah diteruskan ke dapur!</p>
                  <p className="text-xs text-slate-400 mt-0.5">Tidak ada antrean pesanan baru yang menunggu kasir.</p>
                </div>
              ) : (
                incomingSelfOrders.map((order) => {
                  const isQris = order.paymentMethod === 'qris';
                  const isProcessingThis = forwardingSaleId === order.id;

                  return (
                    <div
                      key={order.id}
                      className="p-4 rounded-2xl border-2 border-slate-200 bg-slate-50/70 space-y-3 hover:border-amber-400 transition-all"
                    >
                      {/* Header Order Card */}
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/80 pb-2.5">
                        <div className="flex items-center gap-2">
                          <span className="px-2.5 py-1 rounded-xl bg-slate-900 text-white font-extrabold text-xs tracking-wider">
                            {order.tableNumber || 'Meja'}
                          </span>
                          <div>
                            <span className="font-extrabold text-xs text-slate-900">
                              {order.customerName || 'Tamu Restoran'}
                            </span>
                            <span className="text-[10px] text-slate-400 font-mono ml-2">
                              {order.saleNumber}
                            </span>
                          </div>
                        </div>

                        {/* Payment Status Tag */}
                        <div>
                          {isQris ? (
                            <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1.5 shadow-2xs">
                              <QrCodeIcon className="w-3.5 h-3.5 text-emerald-600" />
                              <span>Lunas via QRIS</span>
                            </span>
                          ) : (
                            <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-900 border border-amber-300 flex items-center gap-1.5 shadow-2xs">
                              <Banknote className="w-3.5 h-3.5 text-amber-700" />
                              <span>Bayar di Kasir (Unpaid)</span>
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Items List */}
                      <div className="space-y-1.5">
                        {order.lineItems.map((item, idx) => (
                          <div key={idx} className="flex justify-between items-start text-xs text-slate-800">
                            <div>
                              <span className="font-bold">{item.quantity}x</span> {item.productName}
                              {item.selectedOptions && Object.keys(item.selectedOptions).length > 0 && (
                                <span className="text-[11px] text-teal-700 ml-1.5">
                                  ({Object.values(item.selectedOptions).join(', ')})
                                </span>
                              )}
                              {item.notes && (
                                <div className="text-[10px] text-amber-800 italic pl-4">
                                  Catatan: {item.notes}
                                </div>
                              )}
                            </div>
                            <span className="font-bold text-slate-700 shrink-0">
                              Rp {item.subtotal.toLocaleString('id-ID')}
                            </span>
                          </div>
                        ))}
                      </div>

                      {/* Total & Action Buttons */}
                      <div className="pt-2 border-t border-slate-200/80 flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <div className="text-[10px] text-slate-500 font-medium">Total Pesanan:</div>
                          <div className="text-sm font-extrabold text-slate-900">
                            Rp {order.grandTotal.toLocaleString('id-ID')}
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          {/* Dedicated Cetak Struk button for instant receipt printing */}
                          <button
                            type="button"
                            onClick={() => {
                              setLastSale(order);
                              setShowReceiptModal(true);
                            }}
                            className="py-2 px-3 rounded-xl bg-teal-50 hover:bg-teal-100 text-teal-800 font-extrabold text-xs border border-teal-300 transition-all flex items-center gap-1.5 active:scale-95 shadow-2xs"
                            title="Cetak struk nota pesanan ini"
                          >
                            <Printer className="w-3.5 h-3.5 text-teal-600" />
                            <span>Cetak Nota 🖨️</span>
                          </button>

                          {!isQris && (
                            <button
                              type="button"
                              disabled={isProcessingThis}
                              onClick={() => {
                                setPayingOrder(order);
                                setOrderCashAmount(order.grandTotal);
                                setPayingOrderPaymentMethod('cash');
                                setOrderPaymentError('');
                              }}
                              className="py-2 px-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs shadow-md shadow-emerald-600/20 transition-all flex items-center gap-1.5 active:scale-95 disabled:opacity-50"
                              title="Terima pembayaran kasir (Tunai atau QRIS)"
                            >
                              <Banknote className="w-4 h-4" />
                              <span>Bayar di Kasir (Tunai / QRIS) 💳</span>
                            </button>
                          )}

                          <button
                            type="button"
                            disabled={isProcessingThis}
                            onClick={() => handleForwardToKitchen(order, false)}
                            className="py-2 px-3.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs shadow-md transition-all flex items-center gap-1.5 active:scale-95 disabled:opacity-50"
                          >
                            <ChefHat className="w-3.5 h-3.5 text-teal-400" />
                            <span>{isProcessingThis ? 'Meneruskan...' : isQris ? 'Teruskan ke Dapur 👨‍🍳' : 'Kirim Dapur Dulu (Bayar Nanti) 👨‍🍳'}</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
              <span>💡 KDS Dapur baru akan menampilkan pesanan setelah kasir mengklik tombol Teruskan ke Dapur.</span>
              <button
                onClick={() => setShowIncomingOrdersModal(false)}
                className="py-1.5 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 7. DEDICATED CASH & QRIS PAYMENT MODAL FOR TABLE ORDERS (GENERATE HARGA & CETAK NOTA) */}
      {payingOrder && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 animate-in zoom-in-95">
            <div className="flex items-center justify-between mb-3 pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center shadow-xs">
                  {payingOrderPaymentMethod === 'cash' ? (
                    <Banknote className="w-5 h-5" />
                  ) : (
                    <QrCodeIcon className="w-5 h-5 text-teal-600" />
                  )}
                </div>
                <div>
                  <h3 className="font-extrabold text-base text-slate-900">
                    Pembayaran {payingOrderPaymentMethod === 'cash' ? 'Kasir Tunai' : 'QRIS Dinamis'}
                  </h3>
                  <p className="text-xs text-slate-500 font-medium">
                    {payingOrder.tableNumber || 'Meja'} • {payingOrder.customerName || 'Tamu'}
                  </p>
                </div>
              </div>
              <button 
                onClick={() => { setPayingOrder(null); setOrderPaymentError(''); }} 
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Tab Selector: Tunai vs QRIS Generate Harga */}
            <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-2xl mb-4">
              <button
                type="button"
                onClick={() => {
                  setPayingOrderPaymentMethod('cash');
                  setOrderCashAmount(payingOrder.grandTotal);
                  setOrderPaymentError('');
                }}
                className={`py-2 px-3 rounded-xl text-xs font-extrabold flex items-center justify-center gap-1.5 transition-all ${
                  payingOrderPaymentMethod === 'cash'
                    ? 'bg-white text-slate-900 shadow-xs scale-101'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Banknote className="w-4 h-4 text-emerald-600" />
                <span>💵 Tunai (Cash)</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setPayingOrderPaymentMethod('qris');
                  setOrderPaymentError('');
                }}
                className={`py-2 px-3 rounded-xl text-xs font-extrabold flex items-center justify-center gap-1.5 transition-all ${
                  payingOrderPaymentMethod === 'qris'
                    ? 'bg-white text-slate-900 shadow-xs scale-101'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <QrCodeIcon className="w-4 h-4 text-teal-600" />
                <span>📱 QRIS (Generate Harga)</span>
              </button>
            </div>

            {orderPaymentError && (
              <div className="mb-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{orderPaymentError}</span>
              </div>
            )}

            {/* Ringkasan Item Pesanan */}
            <div className="bg-slate-50/80 p-3 rounded-2xl border border-slate-200/80 mb-3.5 max-h-32 overflow-y-auto space-y-1.5">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                Rincian Pesanan ({payingOrder.lineItems.length} menu)
              </div>
              {payingOrder.lineItems.map((item, idx) => (
                <div key={idx} className="flex justify-between items-center text-xs text-slate-700">
                  <span className="truncate pr-2">
                    <span className="font-bold text-slate-900">{item.quantity}x</span> {item.productName}
                    {item.selectedOptions && Object.keys(item.selectedOptions).length > 0 && (
                      <span className="text-[10px] text-teal-600 ml-1">
                        ({Object.values(item.selectedOptions).join(', ')})
                      </span>
                    )}
                  </span>
                  <span className="font-semibold tabular-nums shrink-0 text-slate-900">
                    {formatRupiah(item.subtotal)}
                  </span>
                </div>
              ))}
            </div>

            {/* TAB 1: TUNAI (CASH) */}
            {payingOrderPaymentMethod === 'cash' && (
              <div className="space-y-4">
                {/* Total Tagihan */}
                <div className="bg-emerald-500/10 p-3.5 rounded-2xl text-center border border-emerald-200">
                  <span className="text-[11px] text-emerald-800 uppercase font-black tracking-wider">Total Tagihan</span>
                  <div className="text-2xl font-black text-slate-900 mt-0.5 tabular-nums">
                    {formatRupiah(payingOrder.grandTotal)}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Uang Diterima dari Pelanggan (Rp) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={orderCashAmount || ''}
                    onChange={(e) => {
                      setOrderCashAmount(Number(e.target.value));
                      setOrderPaymentError('');
                    }}
                    placeholder="0"
                    autoFocus
                    className="w-full bg-white text-xl font-black text-slate-900 px-4 py-3 rounded-2xl border-2 border-slate-300 focus:border-emerald-500 outline-none tabular-nums"
                  />
                </div>

                {/* Preset Denominations Rupiah */}
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setOrderCashAmount(payingOrder.grandTotal);
                      setOrderPaymentError('');
                    }}
                    className="py-2.5 rounded-xl bg-emerald-100 hover:bg-emerald-200 text-emerald-900 text-xs font-extrabold border border-emerald-300 transition-all active:scale-95"
                  >
                    Uang Pas
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const val = Math.ceil(payingOrder.grandTotal / 50000) * 50000 || 50000;
                      setOrderCashAmount(val);
                      setOrderPaymentError('');
                    }}
                    className="py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold transition-all active:scale-95"
                  >
                    {formatRupiah(Math.ceil(payingOrder.grandTotal / 50000) * 50000 || 50000)}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const val = Math.ceil(payingOrder.grandTotal / 100000) * 100000 || 100000;
                      setOrderCashAmount(val);
                      setOrderPaymentError('');
                    }}
                    className="py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold transition-all active:scale-95"
                  >
                    {formatRupiah(Math.ceil(payingOrder.grandTotal / 100000) * 100000 || 100000)}
                  </button>
                </div>

                {/* Kembalian Box */}
                <div className={`p-3.5 rounded-2xl border flex items-center justify-between transition-all ${
                  orderCashAmount >= payingOrder.grandTotal
                    ? 'bg-emerald-500/10 border-emerald-300 text-emerald-900'
                    : 'bg-amber-50 border-amber-200 text-amber-900'
                }`}>
                  <div>
                    <span className="text-xs font-bold block">
                      {orderCashAmount >= payingOrder.grandTotal ? 'Kembalian:' : 'Kekurangan Uang:'}
                    </span>
                    <span className="text-[10px] text-slate-500">
                      {orderCashAmount >= payingOrder.grandTotal ? 'Diberikan ke pelanggan' : 'Uang tunai belum cukup'}
                    </span>
                  </div>
                  <span className={`text-xl font-black tabular-nums ${
                    orderCashAmount >= payingOrder.grandTotal ? 'text-emerald-700' : 'text-amber-700'
                  }`}>
                    {orderCashAmount >= payingOrder.grandTotal
                      ? formatRupiah(orderCashAmount - payingOrder.grandTotal)
                      : formatRupiah(payingOrder.grandTotal - orderCashAmount)}
                  </span>
                </div>

                {/* Submit Button */}
                <button
                  type="button"
                  onClick={handleExecuteCashPaymentForOrder}
                  disabled={Boolean(forwardingSaleId) || orderCashAmount < payingOrder.grandTotal}
                  className="w-full py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-extrabold text-sm shadow-lg shadow-emerald-600/20 transition-all flex items-center justify-center gap-2 active:scale-98"
                >
                  {forwardingSaleId ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Memproses Pembayaran...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Selesaikan &amp; Cetak Struk 🖨️</span>
                    </>
                  )}
                </button>
              </div>
            )}

            {/* TAB 2: QRIS (MIDTRANS ATAU QRIS TOKO FISIK) */}
            {payingOrderPaymentMethod === 'qris' && (
              <div className="space-y-3.5 text-center">
                {!isMidtransActive ? (
                  /* MODE 1: QRIS TOKO FISIK / MANUAL (MIDTRANS OFF) */
                  <div className="space-y-3.5">
                    <div className="p-4 rounded-2xl bg-slate-50 border-2 border-slate-900 mx-auto max-w-sm space-y-3">
                      <div className="w-12 h-12 rounded-2xl bg-teal-600 text-white flex items-center justify-center mx-auto shadow-md">
                        <QrCodeIcon className="w-6 h-6" />
                      </div>
                      <div>
                        <h4 className="font-extrabold text-sm text-slate-900">Pembayaran QRIS Toko (Statis / Fisik)</h4>
                        <p className="text-xs text-slate-500 mt-1">
                          Arahkan pelanggan meja men-scan stiker QRIS di meja kasir Anda (BCA, Mandiri, BRI, GoPay, OVO, DANA, ShopeePay, dll).
                        </p>
                      </div>

                      <div className="p-3 bg-white rounded-xl border border-slate-200">
                        <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">Total Tagihan Meja</span>
                        <span className="text-2xl font-black text-slate-900 tabular-nums">{formatRupiah(payingOrder.grandTotal)}</span>
                      </div>

                      <div className="text-[11px] text-teal-900 bg-teal-50 p-2.5 rounded-xl border border-teal-200">
                        💡 Pesanan meja ini akan otomatis tercatat lunas dengan metode <strong>QRIS</strong> dan struk nota langsung dicetak.
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={handleExecuteQrisPaymentForOrder}
                      disabled={Boolean(forwardingSaleId)}
                      className="w-full py-3.5 rounded-2xl bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white font-extrabold text-sm shadow-lg shadow-teal-600/20 transition-all flex items-center justify-center gap-2 active:scale-98"
                    >
                      {forwardingSaleId ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          <span>Memproses Transaksi...</span>
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="w-4 h-4" />
                          <span>Konfirmasi Lunas QRIS &amp; Cetak Struk 🖨️</span>
                        </>
                      )}
                    </button>
                  </div>
                ) : payingOrderMidtransError ? (
                  /* KENDALA MIDTRANS: TAMPILKAN ALERT & OPSI LANJUTKAN VIA QRIS TOKO FISIK */
                  <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-left space-y-3">
                    <div className="flex items-center gap-2 text-rose-800 font-bold text-xs">
                      <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                      <span>Kendala Penerbitan QRIS Midtrans</span>
                    </div>
                    <p className="text-xs text-rose-700 leading-relaxed">{payingOrderMidtransError}</p>
                    <p className="text-[10px] text-slate-500">
                      Anda tetap dapat menyelesaikan pesanan meja ini menggunakan stiker QRIS fisik toko Anda tanpa harus beralih ke Tunai.
                    </p>

                    <div className="pt-2 border-t border-rose-200 flex flex-col sm:flex-row gap-2">
                      <button
                        type="button"
                        onClick={handleExecuteQrisPaymentForOrder}
                        disabled={Boolean(forwardingSaleId)}
                        className="flex-1 py-2.5 px-3 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs shadow-sm flex items-center justify-center gap-1.5"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        <span>Gunakan QRIS Fisik Toko &amp; Cetak Struk 🖨️</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setPayingOrderPaymentMethod('cash')}
                        className="py-2.5 px-3 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold text-xs"
                      >
                        Beralih ke Tunai
                      </button>
                    </div>
                  </div>
                ) : isGeneratingPayingOrderQris ? (
                  <div className="py-12 flex flex-col items-center justify-center text-xs text-slate-500 gap-3">
                    <div className="w-8 h-8 border-3 border-teal-600 border-t-transparent rounded-full animate-spin" />
                    <span className="font-semibold text-slate-700">Menerbitkan QRIS Resmi Midtrans...</span>
                    <span className="text-[10px] text-slate-400">Menghubungkan ke Bank Indonesia &amp; Midtrans Core API</span>
                  </div>
                ) : (
                  <>
                    {/* Dynamic QRIS Container */}
                    <div className="bg-slate-50 p-3.5 rounded-2xl border-2 border-slate-900 mx-auto max-w-[260px] space-y-2">
                      <div className="text-[9.5px] font-black tracking-widest text-slate-900 bg-white py-0.5 px-2 rounded border border-slate-200 uppercase flex items-center justify-center gap-1.5">
                        <QrCodeIcon className="w-3.5 h-3.5 text-teal-700" />
                        <span>MIDTRANS QRIS RESMI</span>
                      </div>

                      <div className="p-2 bg-white rounded-xl shadow-xs">
                        {payingOrderQrisDataUrl ? (
                          <img
                            src={payingOrderQrisDataUrl}
                            alt="QRIS Dinamis Tokokoe"
                            className="w-48 h-48 mx-auto object-contain"
                          />
                        ) : (
                          <div className="w-48 h-48 flex flex-col items-center justify-center text-xs text-slate-400 gap-2">
                            <div className="w-6 h-6 border-2 border-teal-600 border-t-transparent rounded-full animate-spin" />
                            <span>Membuat QRIS Dinamis...</span>
                          </div>
                        )}
                      </div>

                      <div className="text-[10px] text-slate-500 font-semibold truncate px-1">
                        Order ID: {payingOrderMidtransOrderId || 'MIDTRANS-QRIS'}
                      </div>
                    </div>

                    {/* Auto Generated Price Box */}
                    <div className="bg-teal-50 p-3 rounded-2xl border border-teal-200 text-center">
                      <div className="flex items-center justify-center gap-1.5 text-[11px] font-bold text-teal-800">
                        <Sparkles className="w-3.5 h-3.5 text-teal-600" />
                        <span>Nominal Terisi Otomatis di QR:</span>
                      </div>
                      <div className="text-2xl font-black text-teal-950 mt-0.5 tabular-nums">
                        {formatRupiah(payingOrder.grandTotal)}
                      </div>
                      <p className="text-[10px] text-teal-700 mt-0.5">
                        Pelanggan tinggal scan dari aplikasi m-Banking atau e-wallet tanpa ketik nominal
                      </p>
                    </div>

                    {/* Real-time Status Indicator */}
                    <div className="flex items-center justify-center gap-2 py-1 px-3 bg-emerald-50 rounded-full border border-emerald-200 text-emerald-800 text-[11px] font-bold">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                      <span>Menunggu Pembayaran (Uang Masuk Terdeteksi Otomatis)</span>
                    </div>

                    {/* Confirm QRIS Received & Auto Print Button */}
                    <button
                      type="button"
                      onClick={handleExecuteQrisPaymentForOrder}
                      disabled={Boolean(forwardingSaleId)}
                      className="w-full py-3.5 rounded-2xl bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white font-extrabold text-sm shadow-lg shadow-teal-600/20 transition-all flex items-center justify-center gap-2 active:scale-98"
                    >
                      {forwardingSaleId ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          <span>Memverifikasi QRIS...</span>
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="w-4 h-4" />
                          <span>Konfirmasi Lunas QRIS &amp; Cetak Struk 🖨️</span>
                        </>
                      )}
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
