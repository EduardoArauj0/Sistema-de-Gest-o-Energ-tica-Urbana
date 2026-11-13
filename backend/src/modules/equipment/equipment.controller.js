const { equipmentService } = require('./equipment.service');

class EquipmentController {
  list(req, res, next) {
    try {
      const { region_id, regionId, type, status } = req.query;
      const items = equipmentService.listEquipments({
        regionId: region_id ?? regionId,
        type,
        status,
      });

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
      const item = equipmentService.getById(req.params.id);
      res.status(200).json({
        dataOrigin: 'SIMULADO',
        item,
      });
    } catch (err) {
      next(err);
    }
  }

  create(req, res, next) {
    try {
      const created = equipmentService.createEquipment(req.body || {}, req.user);
      res.status(201).json({
        dataOrigin: 'SIMULADO',
        message: 'Equipamento cadastrado com sucesso.',
        item: created,
      });
    } catch (err) {
      next(err);
    }
  }

  update(req, res, next) {
    try {
      const updated = equipmentService.updateEquipment(req.params.id, req.body || {}, req.user);
      res.status(200).json({
        dataOrigin: 'SIMULADO',
        message: 'Equipamento atualizado com sucesso.',
        item: updated,
      });
    } catch (err) {
      next(err);
    }
  }

  inactivate(req, res, next) {
    try {
      const inactivated = equipmentService.inactivateEquipment(req.params.id, req.user);
      res.status(200).json({
        dataOrigin: 'SIMULADO',
        message: 'Equipamento inativado com sucesso.',
        item: inactivated,
      });
    } catch (err) {
      next(err);
    }
  }

  block(req, res, next) {
    try {
      const result = equipmentService.blockEquipment(req.params.id, req.body || {}, req.user);
      res.status(200).json({
        dataOrigin: 'SIMULADO',
        toast: 'Equipamento bloqueado com sucesso.',
        message: 'Equipamento bloqueado imediatamente.',
        item: result.equipment,
        suspendedAlertsCount: result.suspendedAlertsCount,
      });
    } catch (err) {
      next(err);
    }
  }

  unblock(req, res, next) {
    try {
      const result = equipmentService.unblockEquipment(req.params.id, req.body || {}, req.user);
      res.status(200).json({
        dataOrigin: 'SIMULADO',
        toast: 'Equipamento desbloqueado com sucesso.',
        message: 'Equipamento desbloqueado e estado operacional restaurado.',
        item: result.equipment,
        reactivatedAlertsCount: result.reactivatedAlertsCount,
      });
    } catch (err) {
      next(err);
    }
  }
}

module.exports = {
  EquipmentController,
  equipmentController: new EquipmentController(),
};
