import type { ShiftStatus } from '../constants/enums';

export interface ShiftPaymentSummaryDto {
  cashSales: string;
  qrisSales: string;
  bankTransferSales: string;
  mixedSales: string;
  completedTransactions: number;
  voidedTransactions: number;
}

export interface ShiftDto {
  id: string;
  userId: string;
  cashierName: string;
  shiftNo: string;
  status: ShiftStatus;
  openedAt: string;
  closedAt: string | null;
  openingCash: string;
  closingCash: string | null;
  expectedCash: string | null;
  cashDifference: string | null;
  totalSales: string;
  totalTransactions: number;
  notes: string | null;
  summary: ShiftPaymentSummaryDto;
  createdAt: string;
  updatedAt: string;
}
