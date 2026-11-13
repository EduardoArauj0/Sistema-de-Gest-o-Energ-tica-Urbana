const readingsService = require('./readings.service');

class ReadingsController {
  generateBatch(req, res, next) {
    try {
      const result = readingsService.generateBatch(req.body || {}, req.user);
      return res.status(201).json({
        status: 'ok',
        message: `Lote de ${result.generated_count} leitura(s) simulada(s) gerado com sucesso no cenário '${result.scenario}'.`,
        data: result,
      });
    } catch (err) {
      return next(err);
    }
  }

  list(req, res, next) {
    try {
      const readings = readingsService.listReadings(req.query || {});
      return res.status(200).json({
        status: 'ok',
        count: readings.length,
        data: readings,
      });
    } catch (err) {
      return next(err);
    }
  }

  getAnomalyParams(req, res, next) {
    try {
      const params = readingsService.getAnomalyParams();
      return res.status(200).json({
        status: 'ok',
        data: params,
      });
    } catch (err) {
      return next(err);
    }
  }

  updateAnomalyParams(req, res, next) {
    try {
      const params = readingsService.updateAnomalyParams(req.body || {}, req.user);
      return res.status(200).json({
        status: 'ok',
        message: 'Parâmetros de detecção de anomalias atualizados com sucesso.',
        data: params,
      });
    } catch (err) {
      return next(err);
    }
  }
}

module.exports = new ReadingsController();
