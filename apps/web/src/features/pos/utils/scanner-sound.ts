/**
 * Audio feedback untuk pemindai barcode POS (M03-004).
 * Menggunakan Web Audio API sintetis (tanpa aset file eksternal) untuk responsivitas instan (<5ms).
 */
class ScannerAudioFeedback {
  private ctx: AudioContext | null = null;

  private getAudioContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;

    try {
      if (!this.ctx) {
        const AudioCtx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (AudioCtx) {
          this.ctx = new AudioCtx();
        }
      }

      if (this.ctx && this.ctx.state === 'suspended') {
        void this.ctx.resume();
      }

      return this.ctx;
    } catch {
      return null;
    }
  }

  /**
   * Beep sukses nada tinggi (1800Hz, 80ms) ala scanner kasir komersial Honeywell/Zebra.
   */
  playSuccessBeep(): void {
    const ctx = this.getAudioContext();
    if (!ctx) return;

    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(1800, ctx.currentTime);

      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.08);
    } catch {
      // Abaikan jika audio konteks terblokir oleh kebijakan browser autoplay
    }
  }

  /**
   * Beep peringatan nada rendah ganda (350Hz, 2x 90ms) saat barcode tidak terdaftar atau error.
   */
  playErrorBeep(): void {
    const ctx = this.getAudioContext();
    if (!ctx) return;

    try {
      const playTone = (startDelay: number) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(350, ctx.currentTime + startDelay);

        gain.gain.setValueAtTime(0.2, ctx.currentTime + startDelay);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + startDelay + 0.09);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(ctx.currentTime + startDelay);
        osc.stop(ctx.currentTime + startDelay + 0.09);
      };

      playTone(0);
      playTone(0.12);
    } catch {
      // Abaikan jika audio terblokir
    }
  }
}

export const scannerSound = new ScannerAudioFeedback();
