const { AppError } = require('../shared/errors/AppError');
const { logger } = require('../shared/logger/logger');

/**
 * Middleware para rotas de API não encontradas (404).
 */
function notFoundHandler(req, res, _next) {
  res.status(404).json({
    error: true,
    code: 'NOT_FOUND',
    message: `Recurso não encontrado: ${req.method} ${req.originalUrl}`,
    field: null,
    reason: 'A rota solicitada não existe na API do SGE-Urbano.',
  });
}

/**
 * Middleware centralizado de tratamento de erros.
 * Garante mensagens em português do Brasil (RNF10), indicação de campo/motivo (RNF09),
 * registro de falhas inesperadas em log (RNF03) e ocultação de detalhes internos sensíveis.
 */
function errorHandler(err, req, res, _next) {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      error: true,
      code: err.code,
      message: err.message,
      field: err.field,
      reason: err.reason,
    });
  }

  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({
      error: true,
      code: 'INVALID_JSON',
      message: 'O corpo da requisição contém um formato JSON inválido.',
      field: 'body',
      reason: 'Formato JSON malformado.',
    });
  }

  const logEntry = logger.error('Erro interno não tratado na requisição.', {
    operation: `${req.method} ${req.originalUrl}`,
    userId: req.user?.id || null,
    details: {
      errorName: err?.name || 'Error',
      errorMessage: err?.message || 'Erro desconhecido',
    },
  });

  return res.status(500).json({
    error: true,
    code: 'INTERNAL_SERVER_ERROR',
    message: 'Ocorreu um erro interno ao processar a solicitação.',
    field: null,
    reason: 'Falha inesperada no servidor. Consulte o log técnico.',
    correlationId: logEntry.correlation_id,
  });
}

module.exports = {
  notFoundHandler,
  errorHandler,
};
