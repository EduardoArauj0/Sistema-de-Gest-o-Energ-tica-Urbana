/**
 * Classe padronizada para erros de domínio, validação e autorização do SGE-Urbano.
 * Atende ao RNF09 (indicação explícita de campo e motivo em validações)
 * e evita exposição de detalhes internos sensíveis do servidor.
 */
class AppError extends Error {
  /**
   * @param {string} message Mensagem descritiva em português do Brasil (RNF10)
   * @param {object} [options]
   * @param {number} [options.statusCode=400] Código HTTP
   * @param {string} [options.code='APP_ERROR'] Código semântico interno
   * @param {string|null} [options.field=null] Campo relacionado ao erro de validação (RNF09)
   * @param {string|null} [options.reason=null] Motivo específico da recusa (RNF09)
   */
  constructor(
    message,
    { statusCode = 400, code = 'APP_ERROR', field = null, reason = null } = {}
  ) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.field = field;
    this.reason = reason || message;
  }
}

module.exports = {
  AppError,
};
