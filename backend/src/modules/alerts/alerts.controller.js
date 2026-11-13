const { alertsService } = require('./alerts.service');

class AlertsController {
  list(req, res, next) {
    try {
      const items = alertsService.list(req.query || {});
      return res.status(200).json({
        status: 'ok',
        dataOrigin: 'SIMULADO',
        count: items.length,
        items,
        data: items,
      });
    } catch (error) {
      return next(error);
    }
  }

  getById(req, res, next) {
    try {
      const item = alertsService.getById(req.params.id);
      return res.status(200).json({
        status: 'ok',
        dataOrigin: 'SIMULADO',
        item,
        data: item,
      });
    } catch (error) {
      return next(error);
    }
  }
}

module.exports = {
  AlertsController,
  alertsController: new AlertsController(),
};
