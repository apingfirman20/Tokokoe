/**
 * Reusable IMEI (International Mobile Equipment Identity) Validation Utility
 * Compliant with 3GPP TS 23.003 & Luhn Checksum Algorithm (Modulus 10).
 */

/**
 * Normalizes an IMEI input string by trimming and removing spaces, hyphens, and slashes.
 */
export function normalizeImei(input: string): string {
  if (!input) return '';
  return input.trim().replace(/[\s\-\/\.]/g, '');
}

/**
 * Verifies whether a 15-digit string satisfies the Luhn algorithm checksum.
 * 
 * Standard IMEI Luhn formula (3GPP TS 23.003):
 * - Exactly 15 digits.
 * - Digits at odd positions from right (indices 13, 11, 9, 7, 5, 3, 1 from left, 0-indexed) are doubled.
 * - If doubled value > 9, sum the digits (or subtract 9).
 * - Total sum including even positions must be divisible by 10 (sum % 10 === 0).
 */
export function validateLuhnChecksum(digits: string): boolean {
  if (!/^\d{15}$/.test(digits)) {
    return false;
  }

  let sum = 0;
  for (let i = 0; i < 15; i++) {
    let digit = parseInt(digits.charAt(i), 10);
    // Double every 2nd digit (indices 1, 3, 5, 7, 9, 11, 13)
    if (i % 2 === 1) {
      digit *= 2;
      if (digit > 9) {
        digit -= 9;
      }
    }
    sum += digit;
  }

  return sum % 10 === 0;
}

/**
 * Calculates the 15th Luhn check digit for a 14-digit IMEI payload.
 */
export function calculateLuhnCheckDigit(fourteenDigits: string): string {
  const normalized = normalizeImei(fourteenDigits);
  if (!/^\d{14}$/.test(normalized)) {
    throw new Error('Payload IMEI harus berupa tepat 14 digit angka sebelum check digit.');
  }

  let sum = 0;
  for (let i = 0; i < 14; i++) {
    let digit = parseInt(normalized.charAt(i), 10);
    if (i % 2 === 1) {
      digit *= 2;
      if (digit > 9) {
        digit -= 9;
      }
    }
    sum += digit;
  }

  const remainder = sum % 10;
  const checkDigit = remainder === 0 ? 0 : 10 - remainder;
  return checkDigit.toString();
}

/**
 * Generates a valid 15-digit Luhn IMEI from a 14-digit prefix (for testing fixtures).
 */
export function createValidTestImei(fourteenDigits: string): string {
  return `${fourteenDigits}${calculateLuhnCheckDigit(fourteenDigits)}`;
}

export interface ImeiValidationResult {
  valid: boolean;
  normalized: string;
  error?: string;
  checkDigit?: string;
  expectedCheckDigit?: string;
}

/**
 * Validates an IMEI identifier with clear Indonesian error messages.
 */
export function validateImei(
  input: string, 
  options: { fieldLabel?: string; allowEmpty?: boolean } = {}
): ImeiValidationResult {
  const label = options.fieldLabel || 'Nomor IMEI';
  const normalized = normalizeImei(input);

  if (!normalized) {
    if (options.allowEmpty) {
      return { valid: true, normalized: '' };
    }
    return {
      valid: false,
      normalized: '',
      error: `${label} wajib diisi dan tidak boleh kosong.`,
    };
  }

  if (!/^\d+$/.test(normalized)) {
    return {
      valid: false,
      normalized,
      error: `${label} harus hanya berupa angka numerik (karakter non-angka tidak diizinkan).`,
    };
  }

  if (normalized.length !== 15) {
    return {
      valid: false,
      normalized,
      error: `${label} harus memiliki panjang tepat 15 digit angka (terdeteksi: ${normalized.length} digit).`,
    };
  }

  const expectedCheckDigit = calculateLuhnCheckDigit(normalized.substring(0, 14));
  const actualCheckDigit = normalized.charAt(14);

  if (actualCheckDigit !== expectedCheckDigit) {
    return {
      valid: false,
      normalized,
      checkDigit: actualCheckDigit,
      expectedCheckDigit,
      error: `${label} "${normalized}" tidak valid (gagal verifikasi Luhn checksum: digit ke-15 tertera "${actualCheckDigit}", seharusnya "${expectedCheckDigit}"). Periksa kembali label fisik perangkat.`,
    };
  }

  return {
    valid: true,
    normalized,
    checkDigit: actualCheckDigit,
  };
}

export interface DualSimValidationResult {
  valid: boolean;
  imei1: string;
  imei2?: string;
  serialNumber?: string;
  error?: string;
}

/**
 * Validates Dual-SIM device identifiers (IMEI 1 + optional IMEI 2) and optional Serial Number.
 */
export function validateDualSimDevice(data: {
  imei1: string;
  imei2?: string;
  serialNumber?: string;
}): DualSimValidationResult {
  const res1 = validateImei(data.imei1, { fieldLabel: 'IMEI 1' });
  if (!res1.valid) {
    return {
      valid: false,
      imei1: res1.normalized,
      error: res1.error,
    };
  }

  let cleanImei2: string | undefined = undefined;
  if (data.imei2 && data.imei2.trim()) {
    const res2 = validateImei(data.imei2, { fieldLabel: 'IMEI 2' });
    if (!res2.valid) {
      return {
        valid: false,
        imei1: res1.normalized,
        imei2: res2.normalized,
        error: res2.error,
      };
    }
    if (res1.normalized === res2.normalized) {
      return {
        valid: false,
        imei1: res1.normalized,
        imei2: res2.normalized,
        error: 'IMEI 1 dan IMEI 2 tidak boleh identik pada perangkat dual-SIM.',
      };
    }
    cleanImei2 = res2.normalized;
  }

  const cleanSn = data.serialNumber ? data.serialNumber.trim() : undefined;

  return {
    valid: true,
    imei1: res1.normalized,
    imei2: cleanImei2,
    serialNumber: cleanSn,
  };
}

/**
 * Evaluates legacy records without silently corrupting or deleting them.
 */
export function getImeiRecordStatus(imei: string): {
  normalized: string;
  is15Digits: boolean;
  isValidLuhn: boolean;
  classification: 'valid' | 'invalid_format' | 'invalid_luhn' | 'legacy_unverified';
} {
  const normalized = normalizeImei(imei);
  if (!/^\d{15}$/.test(normalized)) {
    return {
      normalized,
      is15Digits: false,
      isValidLuhn: false,
      classification: 'invalid_format',
    };
  }

  const isValidLuhn = validateLuhnChecksum(normalized);
  return {
    normalized,
    is15Digits: true,
    isValidLuhn,
    classification: isValidLuhn ? 'valid' : 'invalid_luhn',
  };
}
