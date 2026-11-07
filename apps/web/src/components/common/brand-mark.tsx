import type { SVGProps } from 'react';
import { cn } from '../../lib/cn';

export interface OrchardBrandMarkProps extends SVGProps<SVGSVGElement> {
  size?: number;
}

/**
 * Marka identitas vektor Istana Buah Semarang (buah apel segar & pucuk daun).
 * Menggantikan emoji dengan ikon SVG garis seragam berbasis token warna desain.
 */
export function OrchardBrandMark({ size = 44, className, ...props }: OrchardBrandMarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className={cn('shrink-0', className)}
      {...props}
    >
      <rect
        x="2"
        y="2"
        width="44"
        height="44"
        rx="12"
        fill="var(--color-primary-100)"
        stroke="var(--color-primary-500)"
        strokeWidth="1.5"
      />
      <path
        d="M24 14.5C24 11.5 26.2 9 29.5 8.5C29.8 11.7 27.6 14.3 24 14.5Z"
        fill="var(--color-primary-700)"
        stroke="var(--color-primary-900)"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M24 15C22.4 13 21.1 11.4 19.5 10.6"
        stroke="var(--color-primary-900)"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M24 16.5C20.8 14.6 14.5 15.8 13.4 22.4C12.2 29.2 16.7 37.5 21.1 37.5C22.6 37.5 23.3 36.7 24 36.7C24.7 36.7 25.4 37.5 26.9 37.5C31.3 37.5 35.8 29.2 34.6 22.4C33.5 15.8 27.2 14.6 24 16.5Z"
        fill="var(--color-primary-600)"
        stroke="var(--color-primary-900)"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M18 21.5C17.1 23.8 17.3 27.2 18.8 30.2"
        stroke="var(--color-primary-100)"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}
