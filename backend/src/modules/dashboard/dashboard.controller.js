const { dashboardService } = require('./dashboard.service');

class DashboardController {
  getDashboard(req, res, next) {
    try {
      const data = dashboardService.getDashboardData(req.query || {});
      return res.status(200).json({
        status: 'ok',
        dataOrigin: 'SIMULADO',
        ...data,
        data,
      });
    } catch (error) {
      return next(error);
    }
  }

  getMapOverview(req, res, next) {
    try {
      const data = dashboardService.getMapOverview(req.query || {});
      return res.status(200).json({
        status: 'ok',
        dataOrigin: 'SIMULADO',
        ...data,
        data,
      });
    } catch (error) {
      return next(error);
    }
  }
}

module.exports = {
  DashboardController,
  dashboardController: new DashboardController(),
};
