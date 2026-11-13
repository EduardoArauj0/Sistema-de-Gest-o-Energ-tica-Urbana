const { occurrencesService } = require('./occurrences.service');

class OccurrencesController {
  listAllowedTypes(_req, res, next) {
    try {
      const types = occurrencesService.getAllowedTypes();
      return res.status(200).json({
        status: 'ok',
        dataOrigin: 'SIMULADO',
        count: types.length,
        items: types,
        data: types,
      });
    } catch (error) {
      return next(error);
    }
  }

  createPublic(req, res, next) {
    try {
      const item = occurrencesService.createPublicOccurrence(req.body || {});
      return res.status(201).json({
        status: 'ok',
        dataOrigin: 'SIMULADO',
        message: `Ocorrência registrada com sucesso sob o protocolo ${item.protocol}.`,
        protocol: item.protocol,
        item,
        data: item,
      });
    } catch (error) {
      return next(error);
    }
  }

  consultByProtocol(req, res, next) {
    try {
      const protocol = req.params.protocol ?? req.query.protocol;
      const item = occurrencesService.consultByProtocol(protocol);
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

  list(req, res, next) {
    try {
      const items = occurrencesService.list(req.query || {}, req.user);
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
      const item = occurrencesService.getById(req.params.id, req.user);
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
  OccurrencesController,
  occurrencesController: new OccurrencesController(),
};
