import type { Request, Response } from 'express';
import type { WasteSummaryQuery } from '../waste/waste.dto';
import type { WasteService } from '../waste/waste.service';
import type {
  ProductPerformanceQuery,
  SalesExportQuery,
  SalesSummaryQuery,
  StockCurrentReportQuery,
} from './report.dto';
import type { ReportService } from './report.service';

export class ReportController {
  constructor(
    private readonly reportService: ReportService,
    private readonly wasteService?: WasteService,
  ) {}

  salesSummary = async (req: Request, res: Response): Promise<void> => {
    const data = await this.reportService.getSalesSummary(req.validatedQuery as SalesSummaryQuery);
    res.status(200).json({
      success: true,
      data,
    });
  };

  productPerformance = async (req: Request, res: Response): Promise<void> => {
    const data = await this.reportService.getProductPerformance(
      req.validatedQuery as ProductPerformanceQuery,
    );
    res.status(200).json({
      success: true,
      data,
    });
  };

  stockCurrent = async (req: Request, res: Response): Promise<void> => {
    const data = await this.reportService.getCurrentStock(
      req.validatedQuery as StockCurrentReportQuery,
    );
    res.status(200).json({
      success: true,
      data,
    });
  };

  exportSales = async (req: Request, res: Response): Promise<void> => {
    const file = await this.reportService.exportSalesReport(req.validatedQuery as SalesExportQuery);
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.status(200).send(file.content);
  };

  wasteSummary = async (req: Request, res: Response): Promise<void> => {
    if (!this.wasteService) {
      res.status(501).json({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Layanan laporan penyusutan belum aktif' },
      });
      return;
    }
    const data = await this.wasteService.getSummary(req.validatedQuery as WasteSummaryQuery);
    res.status(200).json({
      success: true,
      data,
    });
  };
}
