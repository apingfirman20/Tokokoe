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
