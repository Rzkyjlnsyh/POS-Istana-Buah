import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PosCameraScannerModal } from './pos-camera-scanner-modal';

const mockListVideoInputDevices = vi.fn();
const mockDecodeFromVideoDevice = vi.fn();
const mockReset = vi.fn();

vi.mock('@zxing/library', () => {
  return {
    BrowserMultiFormatReader: vi.fn().mockImplementation(() => ({
      listVideoInputDevices: mockListVideoInputDevices,
      decodeFromVideoDevice: mockDecodeFromVideoDevice,
      reset: mockReset,
    })),
  };
});

describe('PosCameraScannerModal (M03-004)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDecodeFromVideoDevice.mockReset();
    mockListVideoInputDevices.mockResolvedValue([
      { deviceId: 'cam-rear', label: 'Kamera Belakang (Rear)' },
      { deviceId: 'cam-front', label: 'Kamera Depan (Front)' },
    ]);
  });

  it('memenuhi standar aksesibilitas WCAG 2.1 AA (0 pelanggaran axe-core)', async () => {
    const { container } = render(
      <PosCameraScannerModal isOpen={true} onClose={vi.fn()} onScan={vi.fn()} />,
    );

    const results = await axe.run(container);
    expect(results.violations).toEqual([]);
  });

  it('merender modal pemindai dengan video viewport, overlay reticle, dan dropdown kamera', async () => {
    render(<PosCameraScannerModal isOpen={true} onClose={vi.fn()} onScan={vi.fn()} />);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /pindai barcode produk/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/tampilan pemindai kamera barcode/i)).toBeInTheDocument();

    // Dropdown kamera muncul setelah listVideoInputDevices selesai
    const cameraSelect = await screen.findByLabelText(/pilih kamera/i);
    expect(cameraSelect).toBeInTheDocument();
  });

  it('mengizinkan input barcode manual di dalam modal pemindai', async () => {
    const user = userEvent.setup();
    const handleScan = vi.fn();
    const handleClose = vi.fn();

    render(<PosCameraScannerModal isOpen={true} onClose={handleClose} onScan={handleScan} />);

    const manualInput = screen.getByLabelText(/input nomor barcode manual/i);
    const submitBtn = screen.getByRole('button', { name: /input/i });

    expect(submitBtn).toBeDisabled();

    await user.type(manualInput, '8991234567890');
    expect(submitBtn).not.toBeDisabled();

    await user.click(submitBtn);

    expect(handleScan).toHaveBeenCalledTimes(1);
    expect(handleScan).toHaveBeenCalledWith('8991234567890');
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it('menangani callback pemindaian barcode dari reader zxing', async () => {
    const handleScan = vi.fn();
    const handleClose = vi.fn();

    mockDecodeFromVideoDevice.mockImplementation((_devId, _videoEl, callback) => {
      // Simulasikan hasil scan berhasil langsung
      callback({ getText: () => '89999912345' }, undefined);
    });

    render(<PosCameraScannerModal isOpen={true} onClose={handleClose} onScan={handleScan} />);

    // Tunggu zxing callback dipanggil
    await vi.waitFor(() => {
      expect(handleScan).toHaveBeenCalledWith('89999912345');
    });

    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it('menutup modal saat tombol Tutup diklik', async () => {
    const user = userEvent.setup();
    const handleClose = vi.fn();

    render(<PosCameraScannerModal isOpen={true} onClose={handleClose} onScan={vi.fn()} />);

    const closeBtn = screen.getByRole('button', { name: /^tutup$/i });
    await user.click(closeBtn);

    expect(handleClose).toHaveBeenCalledTimes(1);
  });
});
