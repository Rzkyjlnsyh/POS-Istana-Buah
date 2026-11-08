import { BrowserMultiFormatReader } from '@zxing/library';
import { Camera, Check, Flashlight, XCircle } from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import { Button } from '../../../components/ui/button';
import { Modal } from '../../../components/ui/modal';
import { scannerSound } from '../utils/scanner-sound';

export interface PosCameraScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScan: (barcode: string) => void;
}

export function PosCameraScannerModal({ isOpen, onClose, onScan }: PosCameraScannerModalProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const lastScannedBarcodeRef = useRef<string>('');
  const lastScanTimeRef = useRef<number>(0);

  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [torchSupported, setTorchSupported] = useState(false);
  const [isTorchOn, setIsTorchOn] = useState(false);
  const [isContinuous, setIsContinuous] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [manualCode, setManualCode] = useState('');
  const [lastScannedResult, setLastScannedResult] = useState<string | null>(null);

  // Inisialisasi perangkat kamera saat modal dibuka
  useEffect(() => {
    if (!isOpen) {
      if (readerRef.current) {
        readerRef.current.reset();
        readerRef.current = null;
      }
      setIsTorchOn(false);
      setErrorMessage(null);
      setLastScannedResult(null);
      return;
    }

    const reader = new BrowserMultiFormatReader();
    readerRef.current = reader;

    let isMounted = true;

    async function initCamera() {
      try {
        setErrorMessage(null);
        const videoInputDevices = await reader.listVideoInputDevices();
        if (!isMounted) return;

        setDevices(videoInputDevices);

        if (videoInputDevices.length === 0) {
          setErrorMessage('Tidak ada perangkat kamera yang terdeteksi di perangkat ini.');
          return;
        }

        // Cari kamera belakang (environment) jika ada, atau gunakan default pertama
        const backCamera = videoInputDevices.find(
          (d) =>
            d.label.toLowerCase().includes('back') ||
            d.label.toLowerCase().includes('rear') ||
            d.label.toLowerCase().includes('environment'),
        );

        const initialDeviceId = backCamera
          ? backCamera.deviceId
          : (videoInputDevices[0]?.deviceId ?? '');
        setSelectedDeviceId(initialDeviceId);
      } catch (err) {
        if (!isMounted) return;
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('Permission') || msg.includes('NotAllowedError')) {
          setErrorMessage('Izin kamera ditolak. Silakan izinkan akses kamera di browser Anda.');
        } else {
          setErrorMessage('Gagal mengakses kamera: ' + msg);
        }
      }
    }

    void initCamera();

    return () => {
      isMounted = false;
      if (readerRef.current) {
        readerRef.current.reset();
        readerRef.current = null;
      }
    };
  }, [isOpen]);

  // Memulai streaming kamera & pemindaian barcode
  useEffect(() => {
    if (!isOpen || !selectedDeviceId || !videoRef.current || !readerRef.current) {
      return;
    }

    let isSubscribed = true;

    async function startScanning() {
      try {
        const reader = readerRef.current;
        if (!reader || !videoRef.current) return;

        // Gunakan decodeFromVideoDevice dengan null jika tidak ada deviceId spesifik
        reader.decodeFromVideoDevice(
          selectedDeviceId || null,
          videoRef.current,
          (result, error) => {
            if (!isSubscribed) return;

            if (result) {
              const text = result.getText().trim();
              const now = Date.now();

              // Throttle: cegah pemindaian berulang kode yang sama dalam 1,5 detik
              if (text === lastScannedBarcodeRef.current && now - lastScanTimeRef.current < 1500) {
                return;
              }

              lastScannedBarcodeRef.current = text;
              lastScanTimeRef.current = now;

              scannerSound.playSuccessBeep();
              setLastScannedResult(text);
              onScan(text);

              if (!isContinuous) {
                onClose();
              }
            } else if (error && error.name !== 'NotFoundException') {
              // NotFoundException terjadi di setiap frame saat tidak ada barcode di kamera (normal)
            }
          },
        );

        // Periksa dukungan Flashlight/Torch pada track kamera
        const stream = videoRef.current.srcObject as MediaStream | null;
        if (stream) {
          const track = stream.getVideoTracks()[0];
          if (track && typeof track.getCapabilities === 'function') {
            const capabilities = track.getCapabilities() as { torch?: boolean };
            setTorchSupported(Boolean(capabilities?.torch));
          }
        }
      } catch (err) {
        if (!isSubscribed) return;
        const msg = err instanceof Error ? err.message : String(err);
        setErrorMessage('Gagal memulai stream kamera: ' + msg);
      }
    }

    void startScanning();

    return () => {
      isSubscribed = false;
      if (readerRef.current) {
        readerRef.current.reset();
      }
    };
  }, [isOpen, isContinuous, onClose, onScan, selectedDeviceId]);

  // Toggle Torch/Senter
  const toggleTorch = async () => {
    if (!videoRef.current) return;
    const stream = videoRef.current.srcObject as MediaStream | null;
    if (!stream) return;

    const track = stream.getVideoTracks()[0];
    if (!track) return;

    const nextState = !isTorchOn;
    try {
      await track.applyConstraints({
        advanced: [{ torch: nextState } as MediaTrackConstraintSet],
      });
      setIsTorchOn(nextState);
    } catch {
      // Perangkat mungkin menolak torch
    }
  };

  // Submit Barcode Manual
  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanCode = manualCode.trim();
    if (cleanCode.length >= 3) {
      scannerSound.playSuccessBeep();
      onScan(cleanCode);
      setManualCode('');
      if (!isContinuous) {
        onClose();
      }
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Pindai Barcode Produk"
      description="Arahkan kamera ke barcode produk (EAN-13, GS1, Code-39) atau ketik manual."
      size="default"
    >
      <div className="flex flex-col gap-4">
        {/* Error Alert */}
        {errorMessage ? (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800"
          >
            <XCircle className="h-4 w-4 shrink-0 text-rose-600" aria-hidden="true" />
            <div className="flex-1">
              <p className="font-semibold">Kamera Tidak Tersedia</p>
              <p className="mt-0.5">{errorMessage}</p>
            </div>
          </div>
        ) : null}

        {/* Video Scanner Viewport */}
        <div className="relative mx-auto aspect-video w-full max-w-sm overflow-hidden rounded-2xl border-2 border-border-strong bg-slate-950 shadow-inner">
          <video
            ref={videoRef}
            className="h-full w-full object-cover"
            playsInline
            muted
            aria-label="Tampilan pemindai kamera barcode"
          />

          {/* Overlay Target Reticle */}
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6">
            <div className="relative h-40 w-48 rounded-xl border-2 border-dashed border-primary-400/80 bg-primary-500/5 shadow-[0_0_0_9999px_rgba(0,0,0,0.5)]">
              {/* Corner Accents */}
              <div className="absolute -left-1 -top-1 h-4 w-4 border-l-4 border-t-4 border-primary-400" />
              <div className="absolute -right-1 -top-1 h-4 w-4 border-r-4 border-t-4 border-primary-400" />
              <div className="absolute -bottom-1 -left-1 h-4 w-4 border-b-4 border-l-4 border-primary-400" />
              <div className="absolute -bottom-1 -right-1 h-4 w-4 border-b-4 border-r-4 border-primary-400" />

              {/* Animated Laser Scan Line */}
              <div className="absolute inset-x-2 top-1/2 h-0.5 animate-pulse bg-emerald-400 shadow-[0_0_8px_#34d399]" />
            </div>
          </div>

          {/* Indikator Hasil Terakhir */}
          {lastScannedResult ? (
            <div className="absolute bottom-2 inset-x-2 flex items-center justify-center gap-1.5 rounded-lg bg-emerald-950/90 py-1 px-2 text-center text-xs font-semibold text-emerald-200 backdrop-blur">
              <Check className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
              <span>Terdeteksi: {lastScannedResult}</span>
            </div>
          ) : null}
        </div>

        {/* Kontrol Kamera: Pilihan Kamera & Tombol Senter */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-y border-border-subtle py-2">
          {devices.length > 1 ? (
            <div className="flex items-center gap-1.5 text-xs text-ink-secondary">
              <Camera className="h-3.5 w-3.5" aria-hidden="true" />
              <select
                aria-label="Pilih kamera"
                value={selectedDeviceId}
                onChange={(e) => setSelectedDeviceId(e.target.value)}
                className="rounded-lg border border-border-strong bg-surface-panel px-2 py-1 text-xs font-medium text-ink-primary"
              >
                {devices.map((device, idx) => (
                  <option key={device.deviceId || idx} value={device.deviceId}>
                    {device.label || `Kamera ${idx + 1}`}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="text-xs text-ink-muted">Pemindai Barcode Otomatis Aktif</div>
          )}

          <div className="flex items-center gap-2">
            {torchSupported ? (
              <Button
                type="button"
                variant="secondary"
                onClick={toggleTorch}
                aria-label={isTorchOn ? 'Matikan senter' : 'Nyalakan senter'}
                className="gap-1 text-xs py-1 px-2"
              >
                <Flashlight className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{isTorchOn ? 'Senter Aktif' : 'Senter'}</span>
              </Button>
            ) : null}

            <label className="flex cursor-pointer items-center gap-1.5 text-xs font-medium text-ink-secondary">
              <input
                type="checkbox"
                checked={isContinuous}
                onChange={(e) => setIsContinuous(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-border-strong text-primary-600 focus:ring-primary-500"
              />
              <span>Pindai Beruntun</span>
            </label>
          </div>
        </div>

        {/* Fallback Input Manual Barcode */}
        <form onSubmit={handleManualSubmit} className="flex gap-2">
          <input
            type="text"
            value={manualCode}
            onChange={(e) => setManualCode(e.target.value)}
            placeholder="Ketik angka barcode..."
            aria-label="Input nomor barcode manual"
            className="flex-1 rounded-xl border border-border-strong bg-surface-panel px-3 py-2 text-xs font-medium text-ink-primary placeholder:text-ink-muted focus:border-primary-600 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
          />
          <Button
            type="submit"
            variant="primary"
            disabled={manualCode.trim().length < 3}
            className="text-xs py-1 px-3"
          >
            <span>Input</span>
          </Button>
        </form>

        {/* Footer Tombol Tutup */}
        <div className="flex justify-end gap-2 pt-2 border-t border-border-subtle">
          <Button type="button" variant="secondary" onClick={onClose} className="text-xs py-1 px-3">
            Tutup
          </Button>
        </div>
      </div>
    </Modal>
  );
}
