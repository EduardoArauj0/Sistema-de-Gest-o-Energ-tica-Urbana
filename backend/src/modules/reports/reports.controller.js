const { reportsService } = require('./reports.service');

class ReportsController {
  getConsumption(req, res, next) {
    try {
      const query = req.query || {};
      if (String(query.format || '').toLowerCase() === 'csv') {
        return this.exportConsumptionCsv(req, res, next);
      }

      const report = reportsService.generateConsumptionReport(query);
      return res.status(200).json({
        status: 'ok',
        dataOrigin: 'SIMULADO',
        ...report,
        data: report,
      });
    } catch (error) {
      return next(error);
    }
  }

  exportConsumptionCsv(req, res, next) {
    try {
      const { filename, csvContent } = reportsService.exportConsumptionCsv(req.query || {});
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      return res.status(200).send(csvContent);
    } catch (error) {
      return next(error);
    }
  }
}

module.exports = {
  ReportsController,
  reportsController: new ReportsController(),
};
