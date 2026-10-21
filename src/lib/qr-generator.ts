import QRCode from 'qrcode';

export interface QrOptions {
  width?: number;
  margin?: number;
  badgeRatio?: number;
}

/**
 * Generates a high-resolution QR code with the store/restaurant logo embedded in the center.
 * Uses ErrorCorrectionLevel 'H' (30% error correction margin) so it scans reliably with any smartphone camera.
 */
export async function generateQrWithLogo(
  text: string,
  logoUrl?: string | null,
  options: QrOptions = {}
): Promise<string> {
  const width = options.width || 360;
  const margin = options.margin !== undefined ? options.margin : 2;
  const badgeRatio = options.badgeRatio || 0.25;

  if (typeof window === 'undefined') {
    // Fallback for SSR
    return QRCode.toDataURL(text, { width, margin, errorCorrectionLevel: 'H' });
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = width;

  await QRCode.toCanvas(canvas, text, {
    width,
    margin,
    color: { dark: '#0f172a', light: '#ffffff' },
    errorCorrectionLevel: 'H',
  });

  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas.toDataURL('image/png');

  // Badge calculations
  const badgeSize = Math.round(width * badgeRatio);
  const badgeX = (width - badgeSize) / 2;
  const badgeY = (width - badgeSize) / 2;
  const radius = Math.round(badgeSize * 0.22);

  // Draw clean rounded white badge background with crisp border
  ctx.save();
  ctx.beginPath();
  if (ctx.roundRect) {
    ctx.roundRect(badgeX, badgeY, badgeSize, badgeSize, radius);
  } else {
    ctx.rect(badgeX, badgeY, badgeSize, badgeSize);
  }
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.18)';
  ctx.shadowBlur = 8;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 2;
  ctx.fill();

  ctx.shadowColor = 'transparent';
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 2.5;
  ctx.stroke();
  ctx.restore();

  // Draw the restaurant logo image inside the center badge
  if (logoUrl) {
    try {
      await new Promise<void>((resolve) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          ctx.save();
          // Clip inside badge with subtle inner padding
          ctx.beginPath();
          const padding = 5;
          const innerSize = badgeSize - padding * 2;
          const innerX = badgeX + padding;
          const innerY = badgeY + padding;
          if (ctx.roundRect) {
            ctx.roundRect(innerX, innerY, innerSize, innerSize, radius * 0.7);
          } else {
            ctx.rect(innerX, innerY, innerSize, innerSize);
          }
          ctx.clip();
          ctx.drawImage(img, innerX, innerY, innerSize, innerSize);
          ctx.restore();
          resolve();
        };
        img.onerror = () => {
          drawDefaultEmblem(ctx, badgeX, badgeY, badgeSize);
          resolve();
        };
        img.src = logoUrl;
      });
    } catch {
      drawDefaultEmblem(ctx, badgeX, badgeY, badgeSize);
    }
  } else {
    drawDefaultEmblem(ctx, badgeX, badgeY, badgeSize);
  }

  return canvas.toDataURL('image/png');
}

function drawDefaultEmblem(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
  ctx.save();
  ctx.fillStyle = '#0f766e';
  ctx.font = `bold ${Math.round(size * 0.45)}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('🍽️', x + size / 2, y + size / 2 + 1);
  ctx.restore();
}

/**
 * Computes standard 16-bit CCITT CRC checksum (polynomial 0x1021, seed 0xFFFF)
 * as specified by the National QRIS (EMVCo) standard.
 */
export function computeCrc16(str: string): string {
  let crc = 0xffff;
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      if ((crc & 0x8000) !== 0) {
        crc = ((crc << 1) ^ 0x1021) & 0xffff;
      } else {
        crc = (crc << 1) & 0xffff;
      }
    }
  }
  const hex = (crc & 0xffff).toString(16).toUpperCase();
  return hex.padStart(4, '0');
}

/**
 * Builds standard EMVCo Dynamic QRIS payload containing the exact transaction amount tag (Tag 54).
 * Point of Initiation is set to 12 (Dynamic QR with generated price).
 */
export function buildDynamicQrisPayload(
  amount: number,
  merchantName: string,
  city: string = 'JAKARTA'
): string {
  const cleanName = merchantName.replace(/[^a-zA-Z0-9 ]/g, '').trim().slice(0, 25) || 'TOKOKOE RESTO';
  const nameLen = String(cleanName.length).padStart(2, '0');
  const cleanCity = city.replace(/[^a-zA-Z0-9 ]/g, '').trim().slice(0, 15) || 'JAKARTA';
  const cityLen = String(cleanCity.length).padStart(2, '0');
  const amountStr = Math.max(1, Math.round(amount)).toString();
  const amountLen = String(amountStr.length).padStart(2, '0');

  const base =
    `000201` +
    `010212` +
    `26680016ID.CO.TOKOKOE.WWW0118936009980000000000` +
    `51450014ID.LINKAJA.WWW02150000000000000000303UME` +
    `52045812` +
    `5303360` +
    `54${amountLen}${amountStr}` +
    `5802ID` +
    `59${nameLen}${cleanName}` +
    `60${cityLen}${cleanCity}` +
    `62070703A01` +
    `6304`;

  const crc = computeCrc16(base);
  return `${base}${crc}`;
}

/**
 * Generates dynamic QRIS with the exact amount embedded and the store/restaurant logo centered.
 */
export async function generateDynamicQrisWithLogo(
  amount: number,
  merchantName: string,
  logoUrl?: string | null,
  options: QrOptions = {},
  rawPayload?: string
): Promise<{ payload: string; dataUrl: string }> {
  const payload = rawPayload || buildDynamicQrisPayload(amount, merchantName);
  const dataUrl = await generateQrWithLogo(payload, logoUrl, options);
  return { payload, dataUrl };
}

