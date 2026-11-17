import type { ReportGroupBy, SalesTimelinePointDto } from '@istana-buah/shared';
import { useEffect, useState } from 'react';
import { cn } from '../../../lib/cn';
import { formatRupiah } from '../../pos/utils/formatters';

interface SalesTrendChartProps {
  timeline: SalesTimelinePointDto[];
  groupBy: ReportGroupBy;
}

const CHART_HEIGHT = 216;
const CHART_WIDTH = 720;
const PAD_LEFT = 76;
const PAD_RIGHT = 20;
const PAD_TOP = 18;
const PAD_BOTTOM = 36;
const PLOT_WIDTH = CHART_WIDTH - PAD_LEFT - PAD_RIGHT;
const PLOT_HEIGHT = CHART_HEIGHT - PAD_TOP - PAD_BOTTOM;

function formatCompactAxisRupiah(value: number): string {
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, '')} jt`;
  }
  if (value >= 1_000) {
    return `${Math.round(value / 1_000)} rb`;
  }
  return String(Math.round(value));
}

function formatBucketLabel(dateKey: string, groupBy: ReportGroupBy): string {
  if (groupBy === 'month') {
    const [year, month] = dateKey.split('-');
    const monthNames = [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'Mei',
      'Jun',
      'Jul',
      'Agu',
      'Sep',
      'Okt',
      'Nov',
      'Des',
    ];
    const idx = Number(month) - 1;
    return `${monthNames[idx] ?? month} ${year}`;
  }
  const parts = dateKey.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}`;
  }
  return dateKey;
}

/**
 * Grafik batang interaktif omzet & laba kotor berbasis SVG murni tanpa dependensi eksternal.
 */
export function SalesTrendChart({ timeline, groupBy }: SalesTrendChartProps) {
  const [selectedIndex, setSelectedIndex] = useState<number>(Math.max(0, timeline.length - 1));

  useEffect(() => {
    setSelectedIndex(Math.max(0, timeline.length - 1));
  }, [timeline]);

  if (timeline.length === 0) {
    return (
      <div className="flex min-h-56 items-center justify-center rounded-xl border border-dashed border-border-subtle bg-surface-subtle p-6 text-center text-sm text-ink-muted">
        Belum ada transaksi selesai pada rentang tanggal yang dipilih.
      </div>
    );
  }

  const maxValue = Math.max(
    1,
    ...timeline.map((point) => Math.max(Number(point.revenue), Number(point.grossProfit), 0)),
  );
  const ticks = [0, 0.25, 0.5, 0.75, 1];
  const slotWidth = PLOT_WIDTH / timeline.length;
  const pairWidth = Math.min(44, slotWidth * 0.72);
  const barWidth = Math.max(6, pairWidth * 0.45);
  const barGap = Math.max(2, pairWidth * 0.1);

  const safeIndex = Math.min(selectedIndex, timeline.length - 1);
  const activePoint = timeline[safeIndex] ?? timeline[0]!;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-ink-secondary">
        <div className="flex items-center gap-4">
          <span className="inline-flex items-center gap-1.5 font-medium">
            <span className="h-2.5 w-2.5 rounded-sm bg-primary-600" aria-hidden="true" />
            Omzet Penjualan
          </span>
          <span className="inline-flex items-center gap-1.5 font-medium">
            <span className="h-2.5 w-2.5 rounded-sm bg-primary-900" aria-hidden="true" />
            Laba Kotor
          </span>
        </div>
        <p className="tabular-nums text-ink-primary">
          <span className="font-semibold">
            {groupBy === 'week' ? `Minggu ${activePoint.date}` : activePoint.date}:
          </span>{' '}
          Omzet {formatRupiah(Number(activePoint.revenue))} · Laba{' '}
          {formatRupiah(Number(activePoint.grossProfit))} ({activePoint.transactions} trx)
        </p>
      </div>

      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
          className="h-56 w-full min-w-[460px]"
          role="img"
          aria-label="Grafik perbandingan omzet penjualan dan laba kotor per periode"
        >
          {ticks.map((ratio) => {
            const val = maxValue * ratio;
            const y = PAD_TOP + PLOT_HEIGHT - PLOT_HEIGHT * ratio;
            return (
              <g key={ratio}>
                <line
                  x1={PAD_LEFT}
                  y1={y}
                  x2={CHART_WIDTH - PAD_RIGHT}
                  y2={y}
                  stroke="#d4e4d9"
                  strokeDasharray={ratio === 0 ? undefined : '3 3'}
                />
                <text x={PAD_LEFT - 8} y={y + 4} textAnchor="end" fontSize="11" fill="#4b6755">
                  {formatCompactAxisRupiah(val)}
                </text>
              </g>
            );
          })}

          {timeline.map((point, index) => {
            const revenue = Math.max(0, Number(point.revenue));
            const profit = Math.max(0, Number(point.grossProfit));
            const revHeight = (revenue / maxValue) * PLOT_HEIGHT;
            const profHeight = (profit / maxValue) * PLOT_HEIGHT;

            const centerX = PAD_LEFT + slotWidth * index + slotWidth / 2;
            const revX = centerX - barWidth - barGap / 2;
            const profX = centerX + barGap / 2;
            const revY = PAD_TOP + PLOT_HEIGHT - revHeight;
            const profY = PAD_TOP + PLOT_HEIGHT - profHeight;
            const isActive = index === safeIndex;

            return (
              <g key={point.date} onMouseEnter={() => setSelectedIndex(index)}>
                {isActive ? (
                  <rect
                    x={PAD_LEFT + slotWidth * index + 2}
                    y={PAD_TOP}
                    width={Math.max(8, slotWidth - 4)}
                    height={PLOT_HEIGHT}
                    rx="4"
                    fill="#f0fdf4"
                  />
                ) : null}
                <rect
                  x={revX}
                  y={revY}
                  width={barWidth}
                  height={Math.max(2, revHeight)}
                  rx="3"
                  fill="#16a34a"
                >
                  <title>{`${point.date} — Omzet: ${formatRupiah(revenue)}`}</title>
                </rect>
                <rect
                  x={profX}
                  y={profY}
                  width={barWidth}
                  height={Math.max(2, profHeight)}
                  rx="3"
                  fill="#14532d"
                >
                  <title>{`${point.date} — Laba Kotor: ${formatRupiah(profit)}`}</title>
                </rect>
                {timeline.length <= 16 || index % Math.ceil(timeline.length / 12) === 0 ? (
                  <text
                    x={centerX}
                    y={CHART_HEIGHT - 12}
                    textAnchor="middle"
                    fontSize="11"
                    fontWeight={isActive ? '700' : '500'}
                    fill={isActive ? '#102418' : '#4b6755'}
                  >
                    {formatBucketLabel(point.date, groupBy)}
                  </text>
                ) : null}
              </g>
            );
          })}
        </svg>
      </div>

      <div
        className="flex flex-wrap gap-1.5"
        role="group"
        aria-label="Pilih periode grafik untuk melihat detail angka"
      >
        {timeline.map((point, index) => {
          const isSelected = index === safeIndex;
          return (
            <button
              key={point.date}
              type="button"
              onClick={() => setSelectedIndex(index)}
              onFocus={() => setSelectedIndex(index)}
              aria-pressed={isSelected}
              className={cn(
                'min-h-8 rounded-lg border px-2.5 py-1 text-xs font-medium tabular-nums transition-colors',
                isSelected
                  ? 'border-primary-700 bg-primary-700 text-white'
                  : 'border-border-subtle bg-surface-subtle text-ink-secondary hover:bg-primary-50 hover:text-ink-primary',
              )}
            >
              {formatBucketLabel(point.date, groupBy)}
            </button>
          );
        })}
      </div>
    </div>
  );
}
