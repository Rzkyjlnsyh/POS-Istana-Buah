import type {
  CashierPerformanceReportDto,
  CurrentStockReportDto,
  GrossProfitReportDto,
  SupplierPurchaseReportDto,
  WasteSummaryReportDto,
} from '@istana-buah/shared';
import { formatRupiahPdf, type StructuredPdfReportInput } from './pdf-report-builder';
import type { StructuredSpreadsheetInput } from './report-export-formatter';

export interface ExportDocumentPair {
  baseFileSlug: string;
  pdf: StructuredPdfReportInput;
  spreadsheet: StructuredSpreadsheetInput;
}

export interface ExportContextMeta {
  storeName: string;
  periodLabel: string;
  printedAtLabel: string;
}

export function buildGrossProfitExportModels(
  report: GrossProfitReportDto,
  meta: ExportContextMeta,
): ExportDocumentPair {
  const title = 'Laporan Keuntungan Kotor & Komparasi Periode';
  return {
    baseFileSlug: 'laporan-keuntungan-kotor',
    pdf: {
      storeName: meta.storeName,
      reportTitle: title,
      periodLabel: meta.periodLabel,
      printedAtLabel: meta.printedAtLabel,
      kpis: [
        {
          label: 'Total Penjualan',
          value: formatRupiahPdf(report.totalRevenue),
          note: `Pertumbuhan ${report.comparison.revenueGrowthPercent}%`,
        },
        {
          label: 'Total HPP (Modal)',
          value: formatRupiahPdf(report.totalCostOfGoodsSold),
          note: `Laba sebelum susut ${report.grossMarginBeforeWaste}%`,
        },
        {
          label: 'Kerugian Penyusutan',
          value: formatRupiahPdf(report.totalWasteLoss),
          note: `${report.wasteRecordsCount} catatan susut`,
        },
        {
          label: 'Laba Kotor Bersih',
          value: formatRupiahPdf(report.netGrossProfit),
          note: `Margin ${report.netProfitMargin}% (${report.comparison.netProfitGrowthPercent}%)`,
        },
      ],
      sections: [
        {
          title: 'Tren Keuntungan & Penyusutan per Periode',
          columns: [
            { header: 'Periode', weight: 14, align: 'left' },
            { header: 'Penjualan', weight: 16, align: 'right' },
            { header: 'HPP', weight: 15, align: 'right' },
            { header: 'Laba Kotor', weight: 15, align: 'right' },
            { header: 'Susut', weight: 14, align: 'right' },
            { header: 'Laba Bersih', weight: 16, align: 'right' },
            { header: 'Margin', weight: 10, align: 'right' },
          ],
          rows: report.timeline.map((pt) => [
            pt.date,
            formatRupiahPdf(pt.revenue),
            formatRupiahPdf(pt.costOfGoodsSold),
            formatRupiahPdf(pt.grossProfitBeforeWaste),
            formatRupiahPdf(pt.wasteLoss),
            formatRupiahPdf(pt.netGrossProfit),
            `${pt.netMarginPercent}%`,
          ]),
          emptyMessage: 'Tidak ada data penjualan atau penyusutan pada periode ini.',
        },
      ],
    },
    spreadsheet: {
      storeName: meta.storeName,
      reportTitle: title,
      periodLabel: meta.periodLabel,
      printedAtLabel: meta.printedAtLabel,
      summaryRows: [
        { label: 'Total Penjualan (Rp)', value: report.totalRevenue, type: 'currency' },
        { label: 'Total HPP (Rp)', value: report.totalCostOfGoodsSold, type: 'currency' },
        {
          label: 'Laba Kotor Sebelum Susut (Rp)',
          value: report.grossProfitBeforeWaste,
          type: 'currency',
        },
        { label: 'Kerugian Penyusutan (Rp)', value: report.totalWasteLoss, type: 'currency' },
        { label: 'Laba Kotor Bersih (Rp)', value: report.netGrossProfit, type: 'currency' },
        { label: 'Margin Laba Bersih (%)', value: report.netProfitMargin, type: 'percent' },
        {
          label: 'Penjualan Periode Sebelumnya (Rp)',
          value: report.comparison.previousRevenue,
          type: 'currency',
        },
        {
          label: 'Laba Bersih Periode Sebelumnya (Rp)',
          value: report.comparison.previousNetGrossProfit,
          type: 'currency',
        },
        {
          label: 'Pertumbuhan Omzet (%)',
          value: report.comparison.revenueGrowthPercent,
          type: 'percent',
        },
        {
          label: 'Pertumbuhan Laba Bersih (%)',
          value: report.comparison.netProfitGrowthPercent,
          type: 'percent',
        },
      ],
      sheets: [
        {
          sheetName: 'Tren Keuntungan',
          columns: [
            { header: 'Periode', key: 'date', width: 16, type: 'string' },
            { header: 'Transaksi', key: 'transactions', width: 13, type: 'number' },
            { header: 'Penjualan (Rp)', key: 'revenue', width: 18, type: 'currency' },
            { header: 'HPP (Rp)', key: 'costOfGoodsSold', width: 18, type: 'currency' },
            {
              header: 'Laba Sebelum Susut (Rp)',
              key: 'grossProfitBeforeWaste',
              width: 22,
              type: 'currency',
            },
            { header: 'Penyusutan (Rp)', key: 'wasteLoss', width: 18, type: 'currency' },
            { header: 'Laba Bersih (Rp)', key: 'netGrossProfit', width: 18, type: 'currency' },
            { header: 'Margin Bersih (%)', key: 'netMarginPercent', width: 16, type: 'percent' },
          ],
          rows: report.timeline.map((pt) => ({
            date: pt.date,
            transactions: pt.transactions,
            revenue: pt.revenue,
            costOfGoodsSold: pt.costOfGoodsSold,
            grossProfitBeforeWaste: pt.grossProfitBeforeWaste,
            wasteLoss: pt.wasteLoss,
            netGrossProfit: pt.netGrossProfit,
            netMarginPercent: pt.netMarginPercent,
          })),
        },
      ],
    },
  };
}

export function buildCashierPerformanceExportModels(
  report: CashierPerformanceReportDto,
  meta: ExportContextMeta,
): ExportDocumentPair {
  const title = 'Laporan Performa Kasir & Shift';
  return {
    baseFileSlug: 'laporan-performa-kasir',
    pdf: {
      storeName: meta.storeName,
      reportTitle: title,
      periodLabel: meta.periodLabel,
      printedAtLabel: meta.printedAtLabel,
      kpis: [
        {
          label: 'Total Omzet',
          value: formatRupiahPdf(report.totalRevenue),
          note: `${report.totalTransactions} transaksi selesai`,
        },
        {
          label: 'Total Void',
          value: `${report.totalVoidedTransactions} trx`,
          note: 'Transaksi dibatalkan',
        },
        {
          label: 'Total Shift',
          value: `${report.totalShifts} shift`,
          note: `${report.cashiers.length} kasir aktif`,
        },
        {
          label: 'Akumulasi Selisih Kas',
          value: formatRupiahPdf(report.totalCashDifference),
          note: 'Selisih kas akhir shift',
        },
      ],
      sections: [
        {
          title: 'Ringkasan Performa Per Kasir',
          columns: [
            { header: 'Kasir', weight: 20, align: 'left' },
            { header: 'Trx', weight: 8, align: 'right' },
            { header: 'Void', weight: 8, align: 'right' },
            { header: 'Total Omzet', weight: 18, align: 'right' },
            { header: 'Tunai', weight: 15, align: 'right' },
            { header: 'QRIS/TF', weight: 16, align: 'right' },
            { header: 'Selisih Kas', weight: 15, align: 'right' },
          ],
          rows: report.cashiers.map((c) => [
            `${c.cashierName} (${c.username})`,
            String(c.completedTransactions),
            String(c.voidedTransactions),
            formatRupiahPdf(c.totalRevenue),
            formatRupiahPdf(c.cashRevenue),
            formatRupiahPdf(Number(c.qrisRevenue) + Number(c.bankTransferRevenue)),
            formatRupiahPdf(c.totalCashDifference),
          ]),
          emptyMessage: 'Belum ada aktivitas kasir pada periode ini.',
        },
        {
          title: 'Riwayat Shift Periode Terpilih',
          columns: [
            { header: 'No. Shift', weight: 18, align: 'left' },
            { header: 'Kasir', weight: 18, align: 'left' },
            { header: 'Status', weight: 10, align: 'left' },
            { header: 'Trx', weight: 8, align: 'right' },
            { header: 'Penjualan', weight: 16, align: 'right' },
            { header: 'Kas Awal', weight: 15, align: 'right' },
            { header: 'Selisih Kas', weight: 15, align: 'right' },
          ],
          rows: report.shifts.map((s) => [
            s.shiftNo,
            s.cashierName,
            s.status,
            String(s.totalTransactions),
            formatRupiahPdf(s.totalSales),
            formatRupiahPdf(s.openingCash),
            s.cashDifference !== null ? formatRupiahPdf(s.cashDifference) : '-',
          ]),
          emptyMessage: 'Belum ada shift tercatat pada periode ini.',
        },
      ],
    },
    spreadsheet: {
      storeName: meta.storeName,
      reportTitle: title,
      periodLabel: meta.periodLabel,
      printedAtLabel: meta.printedAtLabel,
      summaryRows: [
        { label: 'Total Omzet (Rp)', value: report.totalRevenue, type: 'currency' },
        { label: 'Total Transaksi Selesai', value: report.totalTransactions, type: 'number' },
        { label: 'Total Transaksi Void', value: report.totalVoidedTransactions, type: 'number' },
        { label: 'Total Shift', value: report.totalShifts, type: 'number' },
        {
          label: 'Akumulasi Selisih Kas (Rp)',
          value: report.totalCashDifference,
          type: 'currency',
        },
      ],
      sheets: [
        {
          sheetName: 'Performa Kasir',
          columns: [
            { header: 'Nama Kasir', key: 'cashierName', width: 22, type: 'string' },
            { header: 'Username', key: 'username', width: 16, type: 'string' },
            {
              header: 'Transaksi Selesai',
              key: 'completedTransactions',
              width: 16,
              type: 'number',
            },
            { header: 'Transaksi Void', key: 'voidedTransactions', width: 14, type: 'number' },
            { header: 'Total Omzet (Rp)', key: 'totalRevenue', width: 18, type: 'currency' },
            {
              header: 'Rata-rata Struk (Rp)',
              key: 'avgTransactionValue',
              width: 18,
              type: 'currency',
            },
            { header: 'Tunai (Rp)', key: 'cashRevenue', width: 16, type: 'currency' },
            { header: 'QRIS (Rp)', key: 'qrisRevenue', width: 16, type: 'currency' },
            { header: 'Transfer (Rp)', key: 'bankTransferRevenue', width: 16, type: 'currency' },
            { header: 'Jumlah Shift', key: 'shiftsCount', width: 13, type: 'number' },
            { header: 'Selisih Kas (Rp)', key: 'totalCashDifference', width: 16, type: 'currency' },
          ],
          rows: report.cashiers.map((c) => ({
            cashierName: c.cashierName,
            username: c.username,
            completedTransactions: c.completedTransactions,
            voidedTransactions: c.voidedTransactions,
            totalRevenue: c.totalRevenue,
            avgTransactionValue: c.avgTransactionValue,
            cashRevenue: c.cashRevenue,
            qrisRevenue: c.qrisRevenue,
            bankTransferRevenue: c.bankTransferRevenue,
            shiftsCount: c.shiftsCount,
            totalCashDifference: c.totalCashDifference,
          })),
        },
        {
          sheetName: 'Riwayat Shift',
          columns: [
            { header: 'No. Shift', key: 'shiftNo', width: 20, type: 'string' },
            { header: 'Kasir', key: 'cashierName', width: 20, type: 'string' },
            { header: 'Status', key: 'status', width: 12, type: 'string' },
            { header: 'Dibuka', key: 'openedAt', width: 22, type: 'string' },
            { header: 'Ditutup', key: 'closedAt', width: 22, type: 'string' },
            { header: 'Transaksi', key: 'totalTransactions', width: 12, type: 'number' },
            { header: 'Penjualan (Rp)', key: 'totalSales', width: 18, type: 'currency' },
            { header: 'Kas Awal (Rp)', key: 'openingCash', width: 16, type: 'currency' },
            { header: 'Kas Akhir (Rp)', key: 'closingCash', width: 16, type: 'currency' },
            { header: 'Selisih Kas (Rp)', key: 'cashDifference', width: 16, type: 'currency' },
          ],
          rows: report.shifts.map((s) => ({
            shiftNo: s.shiftNo,
            cashierName: s.cashierName,
            status: s.status,
            openedAt: s.openedAt,
            closedAt: s.closedAt ?? '-',
            totalTransactions: s.totalTransactions,
            totalSales: s.totalSales,
            openingCash: s.openingCash,
            closingCash: s.closingCash ?? '0',
            cashDifference: s.cashDifference ?? '0',
          })),
        },
      ],
    },
  };
}

export function buildSupplierPurchasesExportModels(
  report: SupplierPurchaseReportDto,
  meta: ExportContextMeta,
): ExportDocumentPair {
  const title = 'Laporan Pembelian & Hutang Supplier';
  return {
    baseFileSlug: 'laporan-pembelian-supplier',
    pdf: {
      storeName: meta.storeName,
      reportTitle: title,
      periodLabel: meta.periodLabel,
      printedAtLabel: meta.printedAtLabel,
      kpis: [
        {
          label: 'Total Purchase Order',
          value: `${report.totalOrders} PO`,
          note: `${report.receivedOrders} diterima`,
        },
        {
          label: 'Total Pembelian',
          value: formatRupiahPdf(report.totalPurchaseAmount),
          note: `${report.suppliers.length} supplier`,
        },
        {
          label: 'Total Terbayar',
          value: formatRupiahPdf(report.totalPaidAmount),
          note: 'Pembayaran terealisasi',
        },
        {
          label: 'Sisa Hutang PO',
          value: formatRupiahPdf(report.totalOutstandingDebt),
          note: 'Tagihan belum lunas',
        },
      ],
      sections: [
        {
          title: 'Rincian Pembelian per Supplier',
          columns: [
            { header: 'Supplier', weight: 22, align: 'left' },
            { header: 'Kontak', weight: 15, align: 'left' },
            { header: 'PO', weight: 8, align: 'right' },
            { header: 'Diterima', weight: 10, align: 'right' },
            { header: 'Total Belanja', weight: 15, align: 'right' },
            { header: 'Terbayar', weight: 15, align: 'right' },
            { header: 'Sisa Hutang', weight: 15, align: 'right' },
          ],
          rows: report.suppliers.map((s) => [
            s.supplierName,
            s.contactPerson ?? s.phone ?? '-',
            String(s.orderCount),
            String(s.receivedOrderCount),
            formatRupiahPdf(s.totalPurchaseAmount),
            formatRupiahPdf(s.totalPaidAmount),
            formatRupiahPdf(s.outstandingDebt),
          ]),
          emptyMessage: 'Belum ada transaksi pembelian supplier pada periode ini.',
        },
      ],
    },
    spreadsheet: {
      storeName: meta.storeName,
      reportTitle: title,
      periodLabel: meta.periodLabel,
      printedAtLabel: meta.printedAtLabel,
      summaryRows: [
        { label: 'Total PO', value: report.totalOrders, type: 'number' },
        { label: 'PO Diterima', value: report.receivedOrders, type: 'number' },
        { label: 'Total Pembelian (Rp)', value: report.totalPurchaseAmount, type: 'currency' },
        { label: 'Total Terbayar (Rp)', value: report.totalPaidAmount, type: 'currency' },
        { label: 'Total Sisa Hutang (Rp)', value: report.totalOutstandingDebt, type: 'currency' },
      ],
      sheets: [
        {
          sheetName: 'Pembelian Supplier',
          columns: [
            { header: 'Nama Supplier', key: 'supplierName', width: 24, type: 'string' },
            { header: 'PIC', key: 'contactPerson', width: 18, type: 'string' },
            { header: 'Telepon', key: 'phone', width: 16, type: 'string' },
            { header: 'Total PO', key: 'orderCount', width: 11, type: 'number' },
            { header: 'PO Diterima', key: 'receivedOrderCount', width: 13, type: 'number' },
            { header: 'Total Qty Item', key: 'totalItemsPurchased', width: 15, type: 'number' },
            {
              header: 'Total Pembelian (Rp)',
              key: 'totalPurchaseAmount',
              width: 20,
              type: 'currency',
            },
            { header: 'Terbayar (Rp)', key: 'totalPaidAmount', width: 18, type: 'currency' },
            { header: 'Sisa Hutang (Rp)', key: 'outstandingDebt', width: 18, type: 'currency' },
          ],
          rows: report.suppliers.map((s) => ({
            supplierName: s.supplierName,
            contactPerson: s.contactPerson ?? '-',
            phone: s.phone ?? '-',
            orderCount: s.orderCount,
            receivedOrderCount: s.receivedOrderCount,
            totalItemsPurchased: s.totalItemsPurchased,
            totalPurchaseAmount: s.totalPurchaseAmount,
            totalPaidAmount: s.totalPaidAmount,
            outstandingDebt: s.outstandingDebt,
          })),
        },
      ],
    },
  };
}

export function buildCurrentStockExportModels(
  report: CurrentStockReportDto,
  meta: ExportContextMeta,
): ExportDocumentPair {
  const title = 'Laporan Posisi & Valuasi Stok Inventori';
  return {
    baseFileSlug: 'laporan-valuasi-stok',
    pdf: {
      storeName: meta.storeName,
      reportTitle: title,
      periodLabel: meta.periodLabel,
      printedAtLabel: meta.printedAtLabel,
      kpis: [
        {
          label: 'Total SKU',
          value: `${report.totalProducts} SKU`,
          note: `${report.lowStockCount} menipis · ${report.outOfStockCount} habis`,
        },
        {
          label: 'Nilai Modal (HPP)',
          value: formatRupiahPdf(report.totalStockCostValue),
          note: 'Estimasi modal tertanam',
        },
        {
          label: 'Potensi Nilai Ritel',
          value: formatRupiahPdf(report.totalStockRetailValue),
          note: 'Valuasi harga jual',
        },
      ],
      sections: [
        {
          title: 'Daftar Posisi & Valuasi Stok Produk',
          columns: [
            { header: 'Produk', weight: 23, align: 'left' },
            { header: 'Kategori', weight: 15, align: 'left' },
            { header: 'Stok', weight: 11, align: 'right' },
            { header: 'HPP', weight: 13, align: 'right' },
            { header: 'Nilai Modal', weight: 14, align: 'right' },
            { header: 'Nilai Ritel', weight: 14, align: 'right' },
            { header: 'Status', weight: 10, align: 'center' },
          ],
          rows: report.items.map((item) => [
            item.name,
            item.categoryName,
            `${item.stockQty} ${item.productType === 'WEIGHT' ? 'kg' : 'pcs'}`,
            formatRupiahPdf(item.unitCost),
            formatRupiahPdf(item.stockCostValue),
            formatRupiahPdf(item.stockRetailValue),
            item.isOutOfStock ? 'HABIS' : item.isLowStock ? 'MENIPIS' : 'AMAN',
          ]),
          emptyMessage: 'Tidak ada data stok produk yang sesuai filter.',
        },
      ],
    },
    spreadsheet: {
      storeName: meta.storeName,
      reportTitle: title,
      periodLabel: meta.periodLabel,
      printedAtLabel: meta.printedAtLabel,
      summaryRows: [
        { label: 'Total SKU', value: report.totalProducts, type: 'number' },
        { label: 'Stok Menipis', value: report.lowStockCount, type: 'number' },
        { label: 'Stok Habis', value: report.outOfStockCount, type: 'number' },
        {
          label: 'Total Nilai Modal HPP (Rp)',
          value: report.totalStockCostValue,
          type: 'currency',
        },
        {
          label: 'Total Potensi Nilai Ritel (Rp)',
          value: report.totalStockRetailValue,
          type: 'currency',
        },
      ],
      sheets: [
        {
          sheetName: 'Valuasi Stok',
          columns: [
            { header: 'Produk', key: 'name', width: 26, type: 'string' },
            { header: 'Kategori', key: 'categoryName', width: 18, type: 'string' },
            { header: 'Tipe', key: 'productType', width: 10, type: 'string' },
            { header: 'Stok Saat Ini', key: 'stockQty', width: 14, type: 'number' },
            { header: 'Batas Minimum', key: 'minStockAlert', width: 14, type: 'number' },
            { header: 'HPP Satuan (Rp)', key: 'unitCost', width: 16, type: 'currency' },
            { header: 'Harga Jual (Rp)', key: 'unitPrice', width: 16, type: 'currency' },
            { header: 'Nilai Modal (Rp)', key: 'stockCostValue', width: 18, type: 'currency' },
            { header: 'Nilai Ritel (Rp)', key: 'stockRetailValue', width: 18, type: 'currency' },
            { header: 'Status', key: 'statusLabel', width: 12, type: 'string' },
          ],
          rows: report.items.map((item) => ({
            name: item.name,
            categoryName: item.categoryName,
            productType: item.productType,
            stockQty: item.stockQty,
            minStockAlert: item.minStockAlert ?? '0',
            unitCost: item.unitCost,
            unitPrice: item.unitPrice,
            stockCostValue: item.stockCostValue,
            stockRetailValue: item.stockRetailValue,
            statusLabel: item.isOutOfStock ? 'HABIS' : item.isLowStock ? 'MENIPIS' : 'AMAN',
          })),
        },
      ],
    },
  };
}

export function buildWasteSummaryExportModels(
  report: WasteSummaryReportDto,
  meta: ExportContextMeta,
): ExportDocumentPair {
  const title = 'Laporan Penyusutan & Kerugian Buah (Waste)';
  return {
    baseFileSlug: 'laporan-penyusutan-buah',
    pdf: {
      storeName: meta.storeName,
      reportTitle: title,
      periodLabel: meta.periodLabel,
      printedAtLabel: meta.printedAtLabel,
      kpis: [
        {
          label: 'Total Catatan',
          value: `${report.totalRecords} catatan`,
          note: 'Insiden penyusutan tercatat',
        },
        {
          label: 'Total Kuantitas Susut',
          value: report.totalQuantity,
          note: 'Akumulasi kg / unit',
        },
        {
          label: 'Total Estimasi Rugi HPP',
          value: formatRupiahPdf(report.totalEstimatedCost),
          note: 'Berdasarkan HPP saat catat',
        },
      ],
      sections: [
        {
          title: 'Ringkasan Berdasarkan Jenis Penyusutan',
          columns: [
            { header: 'Jenis Penyusutan', weight: 32, align: 'left' },
            { header: 'Jumlah Catatan', weight: 20, align: 'right' },
            { header: 'Total Qty', weight: 22, align: 'right' },
            { header: 'Estimasi Kerugian', weight: 26, align: 'right' },
          ],
          rows: report.byType.map((entry) => [
            entry.wasteType,
            String(entry.count),
            entry.totalQuantity,
            formatRupiahPdf(entry.totalEstimatedCost),
          ]),
          emptyMessage: 'Tidak ada catatan penyusutan pada periode ini.',
        },
        {
          title: 'Produk Dengan Kerugian Tertinggi',
          columns: [
            { header: 'Produk', weight: 30, align: 'left' },
            { header: 'Kategori', weight: 20, align: 'left' },
            { header: 'Insiden', weight: 12, align: 'right' },
            { header: 'Total Qty', weight: 16, align: 'right' },
            { header: 'Estimasi Rugi', weight: 22, align: 'right' },
          ],
          rows: report.topProducts.map((p) => [
            p.productName,
            p.categoryName,
            String(p.count),
            `${p.totalQuantity} ${p.productType === 'WEIGHT' ? 'kg' : 'pcs'}`,
            formatRupiahPdf(p.totalEstimatedCost),
          ]),
          emptyMessage: 'Belum ada produk penyusutan pada periode ini.',
        },
      ],
    },
    spreadsheet: {
      storeName: meta.storeName,
      reportTitle: title,
      periodLabel: meta.periodLabel,
      printedAtLabel: meta.printedAtLabel,
      summaryRows: [
        { label: 'Total Catatan Penyusutan', value: report.totalRecords, type: 'number' },
        { label: 'Total Kuantitas Susut', value: report.totalQuantity, type: 'number' },
        {
          label: 'Total Estimasi Kerugian (Rp)',
          value: report.totalEstimatedCost,
          type: 'currency',
        },
      ],
      sheets: [
        {
          sheetName: 'Per Jenis Susut',
          columns: [
            { header: 'Jenis Penyusutan', key: 'wasteType', width: 20, type: 'string' },
            { header: 'Jumlah Catatan', key: 'count', width: 16, type: 'number' },
            { header: 'Total Kuantitas', key: 'totalQuantity', width: 16, type: 'number' },
            {
              header: 'Estimasi Kerugian (Rp)',
              key: 'totalEstimatedCost',
              width: 22,
              type: 'currency',
            },
          ],
          rows: report.byType.map((entry) => ({
            wasteType: entry.wasteType,
            count: entry.count,
            totalQuantity: entry.totalQuantity,
            totalEstimatedCost: entry.totalEstimatedCost,
          })),
        },
        {
          sheetName: 'Produk Rugi Tertinggi',
          columns: [
            { header: 'Produk', key: 'productName', width: 26, type: 'string' },
            { header: 'Kategori', key: 'categoryName', width: 18, type: 'string' },
            { header: 'Tipe', key: 'productType', width: 10, type: 'string' },
            { header: 'Jumlah Insiden', key: 'count', width: 15, type: 'number' },
            { header: 'Total Kuantitas', key: 'totalQuantity', width: 15, type: 'number' },
            {
              header: 'Estimasi Kerugian (Rp)',
              key: 'totalEstimatedCost',
              width: 22,
              type: 'currency',
            },
          ],
          rows: report.topProducts.map((p) => ({
            productName: p.productName,
            categoryName: p.categoryName,
            productType: p.productType,
            count: p.count,
            totalQuantity: p.totalQuantity,
            totalEstimatedCost: p.totalEstimatedCost,
          })),
        },
      ],
    },
  };
}
