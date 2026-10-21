import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format integer IDR to Indonesian Rupiah standard (e.g. 18000 -> "Rp 18.000")
 */
export function formatRupiah(amount: number): string {
  if (typeof amount !== "number" || isNaN(amount)) {
    return "Rp 0";
  }
  const formatted = Math.round(amount).toLocaleString("id-ID");
  return `Rp ${formatted}`;
}

/**
 * Parse Rupiah string input back to integer
 */
export function parseRupiah(input: string): number {
  const clean = input.replace(/[^0-9]/g, "");
  return clean ? parseInt(clean, 10) : 0;
}

/**
 * Generate unique stable transaction reference (e.g. TRX-20261012-ABCD)
 */
export function generateSaleReference(): string {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const randomSuffix = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `TRX-${dateStr}-${randomSuffix}`;
}

/**
 * Strips all undefined fields recursively from an object so Firestore never throws
 * "Function setDoc() called with invalid data. Unsupported field value: undefined"
 */
export function cleanUndefined<T extends Record<string, any>>(obj: T): T {
  if (obj === null || typeof obj !== "object") {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(cleanUndefined) as unknown as T;
  }
  const cleaned: any = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      cleaned[key] = (value !== null && typeof value === "object" && !(value instanceof Date))
        ? cleanUndefined(value)
        : value;
    }
  }
  return cleaned as T;
}

/**
 * Resize and compress uploaded image for optimal thermal receipt printing and lightweight storage (< 40KB).
 * Resizes max width to 240px and max height to 120px, exporting as clean PNG data URL.
 */
export function processReceiptLogoFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('File yang dipilih bukan gambar valid.'));
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const MAX_WIDTH = 240;
        const MAX_HEIGHT = 120;
        let width = img.width;
        let height = img.height;

        if (width > MAX_WIDTH) {
          height = Math.round((height * MAX_WIDTH) / width);
          width = MAX_WIDTH;
        }
        if (height > MAX_HEIGHT) {
          width = Math.round((width * MAX_HEIGHT) / height);
          height = MAX_HEIGHT;
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(e.target?.result as string);
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);
        // Export as PNG (preserves transparency)
        const dataUrl = canvas.toDataURL('image/png', 0.9);
        resolve(dataUrl);
      };
      img.onerror = () => reject(new Error('Gagal memproses data gambar.'));
      img.src = e.target?.result as string;
    };
    reader.onerror = () => reject(new Error('Gagal membaca file gambar dari perangkat.'));
    reader.readAsDataURL(file);
  });
}

