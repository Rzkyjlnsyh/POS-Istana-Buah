import { encodeBarcodePattern } from '@istana-buah/shared';
import { useId, useMemo } from 'react';

export interface BarcodeSvgProps {
  value: string;
  width?: number | string;
  height?: number;
  showText?: boolean;
  className?: string;
}

/**
 * Komponen Barcode SVG presisi tinggi (M02-006).
 * Merender barcode EAN-13 (95 modul) atau Code 39 dalam format vektor tajam,
 * siap discan oleh scanner USB/kamera dan dicetak ke printer thermal 58mm/80mm.
 */
export function BarcodeSvg({
  value,
  width = '100%',
  height = 64,
  showText = true,
  className = '',
}: BarcodeSvgProps) {
  const titleId = useId();

  const pattern = useMemo(() => {
    try {
      return encodeBarcodePattern(value);
    } catch {
      return '';
    }
  }, [value]);

  if (!pattern) {
    return (
      <div
        className={`flex items-center justify-center rounded border border-dashed border-red-300 bg-red-50 p-2 text-xs text-red-700 ${className}`}
      >
        Barcode tidak valid ({value})
      </div>
    );
  }

  const moduleCount = pattern.length;
  // Quiet zone: 4 modul di kiri dan kanan
  const quietZone = 4;
  const totalModules = moduleCount + quietZone * 2;
  const barHeight = showText ? height - 16 : height;

  return (
    <div className={`flex flex-col items-center select-none ${className}`}>
      <svg
        viewBox={`0 0 ${totalModules} ${barHeight}`}
        className="w-full h-auto max-h-[80px]"
        style={{ width, height: barHeight }}
        role="img"
        aria-labelledby={titleId}
        preserveAspectRatio="none"
      >
        <title id={titleId}>Barcode {value}</title>
        <rect width={totalModules} height={barHeight} fill="#FFFFFF" />
        {pattern.split('').map((bit, idx) => {
          if (bit === '1') {
            return (
              <rect
                key={idx}
                x={quietZone + idx}
                y={0}
                width={1}
                height={barHeight}
                fill="#000000"
              />
            );
          }
          return null;
        })}
      </svg>

      {showText ? (
        <span className="mt-1 font-mono text-xs font-bold tracking-widest text-ink-primary tabular-nums">
          {value}
        </span>
      ) : null}
    </div>
  );
}
