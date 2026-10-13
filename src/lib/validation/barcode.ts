/**
 * Reusable Barcode Validation Utility
 * Supports EAN-13, EAN-8, UPC-A, and custom internal alphanumeric barcodes.
 */

import { Product } from '@/types';

export type BarcodeType = 'EAN13' | 'EAN8' | 'UPC_A' | 'CODE128' | 'INTERNAL';

/**
 * Normalizes barcode input (trims whitespace, preserves case-sensitive or uppercase standard).
 */
export function normalizeBarcode(input: string): string {
  if (!input) return '';
  return input.trim();
}

/**
 * Validates check digit of a 13-digit EAN-13 barcode.
 * Formula:
 * - Digits at odd index (0, 2, 4, 6, 8, 10) multiplied by 1.
 * - Digits at even index (1, 3, 5, 7, 9, 11) multiplied by 3.
 * - Check digit = (10 - (total % 10)) % 10.
 */
export function validateEan13Checksum(digits: string): boolean {
  if (!/^\d{13}$/.test(digits)) return false;

  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const digit = parseInt(digits.charAt(i), 10);
    sum += i % 2 === 0 ? digit * 1 : digit * 3;
  }

  const expectedCheckDigit = (10 - (sum % 10)) % 10;
  return parseInt(digits.charAt(12), 10) === expectedCheckDigit;
}

/**
 * Calculates check digit for a 12-digit EAN payload.
 */
export function calculateEan13CheckDigit(twelveDigits: string): string {
  if (!/^\d{12}$/.test(twelveDigits)) {
    throw new Error('Payload EAN-13 harus berupa 12 digit angka sebelum check digit.');
  }

  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const digit = parseInt(twelveDigits.charAt(i), 10);
    sum += i % 2 === 0 ? digit * 1 : digit * 3;
  }

  const expectedCheckDigit = (10 - (sum % 10)) % 10;
  return expectedCheckDigit.toString();
}

/**
 * Validates check digit of an 8-digit EAN-8 barcode.
 * Formula:
 * - Digits at odd index (0, 2, 4, 6) multiplied by 3.
 * - Digits at even index (1, 3, 5) multiplied by 1.
 */
export function validateEan8Checksum(digits: string): boolean {
  if (!/^\d{8}$/.test(digits)) return false;

  let sum = 0;
  for (let i = 0; i < 7; i++) {
    const digit = parseInt(digits.charAt(i), 10);
    sum += i % 2 === 0 ? digit * 3 : digit * 1;
  }

  const expectedCheckDigit = (10 - (sum % 10)) % 10;
  return parseInt(digits.charAt(7), 10) === expectedCheckDigit;
}

/**
 * Automatically detects the format/type of a given barcode.
 */
export function detectBarcodeType(input: string): BarcodeType {
  const normalized = normalizeBarcode(input);
  if (!normalized) return 'INTERNAL';

  if (/^\d{13}$/.test(normalized) && validateEan13Checksum(normalized)) {
    return 'EAN13';
  }

  if (/^\d{8}$/.test(normalized) && validateEan8Checksum(normalized)) {
    return 'EAN8';
  }

  if (/^\d{12}$/.test(normalized)) {
    return 'UPC_A';
  }

  if (/^[A-Za-z0-9\-_.]+$/.test(normalized)) {
    return 'INTERNAL';
  }

  return 'CODE128';
}

export interface BarcodeValidationResult {
  valid: boolean;
  normalized: string;
  barcodeType: BarcodeType;
  error?: string;
}

/**
 * Validates product barcode with tolerance for internal codes and rigorous check for standard GTIN/EAN.
 */
export function validateProductBarcode(
  barcode: string, 
  intendedType?: BarcodeType
): BarcodeValidationResult {
  const normalized = normalizeBarcode(barcode);

  if (!normalized) {
    return {
      valid: true,
      normalized: '',
      barcodeType: 'INTERNAL',
    };
  }

  // If user explicitly intended EAN-13, validate strict EAN-13
  if (intendedType === 'EAN13') {
    if (!/^\d{13}$/.test(normalized)) {
      return {
        valid: false,
        normalized,
        barcodeType: 'EAN13',
        error: `Barcode EAN-13 harus berupa tepat 13 digit angka (terdeteksi: ${normalized.length} karakter).`,
      };
    }

    if (!validateEan13Checksum(normalized)) {
      const expected = calculateEan13CheckDigit(normalized.substring(0, 12));
      return {
        valid: false,
        normalized,
        barcodeType: 'EAN13',
        error: `Barcode EAN-13 "${normalized}" tidak valid (check digit ke-13 tertera "${normalized.charAt(12)}", seharusnya "${expected}").`,
      };
    }

    return {
      valid: true,
      normalized,
      barcodeType: 'EAN13',
    };
  }

  // Automatic classification mode
  if (/^\d{13}$/.test(normalized)) {
    if (validateEan13Checksum(normalized)) {
      return {
        valid: true,
        normalized,
        barcodeType: 'EAN13',
      };
    }
    // 13 digits but failed EAN checksum: accept as INTERNAL code to avoid rejecting custom internal barcodes
    return {
      valid: true,
      normalized,
      barcodeType: 'INTERNAL',
    };
  }

  // Validate internal alphanumeric barcode safety (prevent dangerous control characters or line breaks)
  if (/[\r\n\t]/.test(normalized)) {
    return {
      valid: false,
      normalized,
      barcodeType: 'INTERNAL',
      error: 'Barcode tidak boleh mengandung karakter baris baru atau kontrol.',
    };
  }

  if (normalized.length > 64) {
    return {
      valid: false,
      normalized,
      barcodeType: 'INTERNAL',
      error: 'Panjang barcode tidak boleh melebihi 64 karakter.',
    };
  }

  const detected = detectBarcodeType(normalized);
  return {
    valid: true,
    normalized,
    barcodeType: detected,
  };
}

/**
 * Checks whether a barcode conflicts with an existing product in the same business.
 */
export function checkDuplicateBarcode(
  products: Product[],
  barcode: string,
  currentProductId?: string
): { isDuplicate: boolean; conflictingProduct?: Product } {
  const cleanBarcode = normalizeBarcode(barcode);
  if (!cleanBarcode) {
    return { isDuplicate: false };
  }

  const found = products.find(p => 
    p.id !== currentProductId && 
    p.barcode && 
    normalizeBarcode(p.barcode) === cleanBarcode
  );

  if (found) {
    return {
      isDuplicate: true,
      conflictingProduct: found,
    };
  }

  return { isDuplicate: false };
}
