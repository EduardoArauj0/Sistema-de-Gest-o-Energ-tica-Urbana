const { workOrdersService } = require('./workOrders.service');

class WorkOrdersController {
  list(req, res, next) {
    try {
      const items = workOrdersService.list(req.query || {}, req.user);
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
      const item = workOrdersService.getById(req.params.id, req.user);
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

  create(req, res, next) {
    try {
      const item = workOrdersService.openWorkOrder(req.body || {}, req.user);
      return res.status(201).json({
        status: 'ok',
        dataOrigin: 'SIMULADO',
        message: `Ordem de Serviço ${item.code} aberta com sucesso.`,
        item,
        data: item,
      });
    } catch (error) {
      return next(error);
    }
  }

  assign(req, res, next) {
    try {
      const item = workOrdersService.assignTechnician(req.params.id, req.body || {}, req.user);
      return res.status(200).json({
        status: 'ok',
        dataOrigin: 'SIMULADO',
        message: `Ordem de Serviço ${item.code} atribuída ao técnico com sucesso.`,
        item,
        data: item,
      });
    } catch (error) {
      return next(error);
    }
  }

  progress(req, res, next) {
    try {
      const item = workOrdersService.updateProgress(req.params.id, req.body || {}, req.user);
      return res.status(200).json({
        status: 'ok',
        dataOrigin: 'SIMULADO',
        message: `Andamento da Ordem de Serviço ${item.code} atualizado para 'Em atendimento'.`,
        item,
        data: item,
      });
    } catch (error) {
      return next(error);
    }
  }

  close(req, res, next) {
    try {
      const item = workOrdersService.closeWorkOrder(req.params.id, req.body || {}, req.user);
      return res.status(200).json({
        status: 'ok',
        dataOrigin: 'SIMULADO',
        message: `Ordem de Serviço ${item.code} concluída com sucesso.`,
        item,
        data: item,
      });
    } catch (error) {
      return next(error);
    }
  }

  cancel(req, res, next) {
    try {
      const item = workOrdersService.cancelWorkOrder(req.params.id, req.body || {}, req.user);
      return res.status(200).json({
        status: 'ok',
        dataOrigin: 'SIMULADO',
        message: `Ordem de Serviço ${item.code} cancelada com sucesso.`,
        item,
        data: item,
      });
    } catch (error) {
      return next(error);
    }
  }
}

module.exports = {
  WorkOrdersController,
  workOrdersController: new WorkOrdersController(),
};
