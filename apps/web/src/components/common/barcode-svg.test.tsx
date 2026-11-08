import { render, screen } from '@testing-library/react';
import axe from 'axe-core';
import { describe, expect, it } from 'vitest';
import { BarcodeSvg } from './barcode-svg';

describe('BarcodeSvg (M02-006)', () => {
  it('lulus pengujian aksesibilitas WCAG 2.1 AA (axe-core 0 pelanggaran)', async () => {
    const { container } = render(<BarcodeSvg value="2001000000018" />);
    const results = await axe.run(container);
    expect(results.violations).toEqual([]);
  });

  it('merender elemen SVG dan teks barcode EAN-13 standar secara presisi', () => {
    render(<BarcodeSvg value="2001000000018" showText={true} />);

    const svg = screen.getByRole('img', { name: /Barcode 2001000000018/i });
    expect(svg).toBeInTheDocument();
    expect(screen.getByText('2001000000018')).toBeInTheDocument();
  });

  it('menyembunyikan label teks jika showText=false', () => {
    render(<BarcodeSvg value="2001000000018" showText={false} />);

    const svg = screen.getByRole('img', { name: /Barcode 2001000000018/i });
    expect(svg).toBeInTheDocument();
    expect(screen.queryByText('2001000000018')).not.toBeInTheDocument();
  });

  it('merender barcode Code 39 untuk kode alfanumerik custom', () => {
    render(<BarcodeSvg value="APEL-FUJI" showText={true} />);

    const svg = screen.getByRole('img', { name: /Barcode APEL-FUJI/i });
    expect(svg).toBeInTheDocument();
    expect(screen.getByText('APEL-FUJI')).toBeInTheDocument();
  });
});
