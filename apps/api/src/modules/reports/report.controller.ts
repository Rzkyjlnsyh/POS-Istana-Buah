import type { Request, Response } from 'express';
import type {
  ProductPerformanceQuery,
  SalesExportQuery,
  SalesSummaryQuery,
  StockCurrentReportQuery,
} from './report.dto';
import type { ReportService } from './report.service';

export class ReportController {
  constructor(private readonly reportService: ReportService) {}

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
}
