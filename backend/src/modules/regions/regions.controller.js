const { regionsService } = require('./regions.service');

class RegionsController {
  list(req, res, next) {
    try {
      const { status } = req.query;
      const items = regionsService.listRegions({ status });
      res.status(200).json({
        dataOrigin: 'SIMULADO',
        count: items.length,
        items,
      });
    } catch (err) {
      next(err);
    }
  }

  listPublicActive(_req, res, next) {
    try {
      const items = regionsService.listPublicActiveRegions();
      res.status(200).json({
        dataOrigin: 'SIMULADO',
        count: items.length,
        items,
      });
    } catch (err) {
      next(err);
    }
  }

  getById(req, res, next) {
    try {
      const region = regionsService.getById(req.params.id);
      res.status(200).json({
        dataOrigin: 'SIMULADO',
        item: region,
      });
    } catch (err) {
      next(err);
    }
  }

  create(req, res, next) {
    try {
      const created = regionsService.createRegion(req.body || {}, req.user);
      res.status(201).json({
        dataOrigin: 'SIMULADO',
        message: 'Região cadastrada com sucesso.',
        item: created,
      });
    } catch (err) {
      next(err);
    }
  }

  update(req, res, next) {
    try {
      const updated = regionsService.updateRegion(req.params.id, req.body || {}, req.user);
      res.status(200).json({
        dataOrigin: 'SIMULADO',
        message: 'Região atualizada com sucesso.',
        item: updated,
      });
    } catch (err) {
      next(err);
    }
  }

  inactivate(req, res, next) {
    try {
      const result = regionsService.inactivateRegion(req.params.id, req.user);
      res.status(200).json({
        dataOrigin: 'SIMULADO',
        message: `Região inativada com sucesso. ${result.cascadedEquipmentsCount} equipamento(s) vinculado(s) inativado(s) em cascata.`,
        item: result.region,
        cascadedEquipmentsCount: result.cascadedEquipmentsCount,
      });
    } catch (err) {
      next(err);
    }
  }

  block(req, res, next) {
    try {
      const result = regionsService.blockRegion(req.params.id, req.body || {}, req.user);
      res.status(200).json({
        dataOrigin: 'SIMULADO',
        toast: 'Região bloqueada com sucesso.',
        message: `Região bloqueada com sucesso. ${result.cascadedEquipmentsCount} equipamento(s) ativo(s) bloqueado(s) em cascata.`,
        item: result.region,
        cascadedEquipmentsCount: result.cascadedEquipmentsCount,
        suspendedAlertsCount: result.suspendedAlertsCount,
      });
    } catch (err) {
      next(err);
    }
  }

  unblock(req, res, next) {
    try {
      const result = regionsService.unblockRegion(req.params.id, req.body || {}, req.user);
      res.status(200).json({
        dataOrigin: 'SIMULADO',
        toast: 'Região desbloqueada com sucesso.',
        message: 'Região desbloqueada e estado operacional restaurado.',
        item: result.region,
        restoredEquipmentsCount: result.restoredEquipmentsCount,
        reactivatedAlertsCount: result.reactivatedAlertsCount,
      });
    } catch (err) {
      next(err);
    }
  }
}

module.exports = {
  RegionsController,
  regionsController: new RegionsController(),
};
