import type { ProductType, WasteType } from '../constants/enums';

export type WasteSummaryGroupBy = 'day' | 'month';

export interface WasteRecordDto {
  id: string;
  productId: string;
  productName: string;
  productType: ProductType;
  categoryName: string;
  wasteType: WasteType;
  quantity: string;
  unitCost: string;
  estimatedCost: string;
  reason: string | null;
  photoUrl: string | null;
  recordedBy: string;
  recorderName: string;
  recordedAt: string;
  createdAt: string;
}

export interface WasteTypeBreakdownDto {
  wasteType: WasteType;
  count: number;
  totalQuantity: string;
  totalEstimatedCost: string;
}

export interface WasteTopProductDto {
  productId: string;
  productName: string;
  productType: ProductType;
  categoryName: string;
  count: number;
  totalQuantity: string;
  totalEstimatedCost: string;
}

export interface WasteTimelinePointDto {
  date: string;
  count: number;
  totalQuantity: string;
  totalEstimatedCost: string;
}

export interface WasteSummaryReportDto {
  startDate: string;
  endDate: string;
  groupBy: WasteSummaryGroupBy;
  totalRecords: number;
  totalQuantity: string;
  totalEstimatedCost: string;
  byType: WasteTypeBreakdownDto[];
  topProducts: WasteTopProductDto[];
  timeline: WasteTimelinePointDto[];
}
