import type { Request, Response } from 'express';
import type { DashboardChartsQuery, DashboardSummaryQuery } from './dashboard.dto';
import type { DashboardService } from './dashboard.service';

export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  summary = async (req: Request, res: Response): Promise<void> => {
    const data = await this.dashboardService.getSummary(
      req.validatedQuery as DashboardSummaryQuery,
    );
    res.status(200).json({
      success: true,
      data,
    });
  };

  charts = async (req: Request, res: Response): Promise<void> => {
    const data = await this.dashboardService.getCharts(req.validatedQuery as DashboardChartsQuery);
    res.status(200).json({
      success: true,
      data,
    });
  };
}
