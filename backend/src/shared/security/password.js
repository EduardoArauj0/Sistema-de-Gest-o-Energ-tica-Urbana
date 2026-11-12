const crypto = require('node:crypto');

const SCRYPT_PREFIX = 'scrypt';
const KEY_LENGTH = 64;

/**
 * Gera um hash seguro de senha utilizando scrypt nativo do Node.js (RNF04).
 * Nunca armazena a senha em texto claro.
 *
 * @param {string} plainPassword Senha em texto claro
 * @param {string} [customSalt] Salt opcional (usado apenas para reprodutibilidade determinística da seed)
 * @returns {string} Hash no formato "scrypt$<salt>$<derivedKeyHex>"
 */
function hashPassword(plainPassword, customSalt = null) {
  if (typeof plainPassword !== 'string' || plainPassword.length === 0) {
    throw new Error('A senha para geração de hash não pode ser vazia.');
  }

  const salt = customSalt || crypto.randomBytes(16).toString('hex');
  const derivedKey = crypto.scryptSync(plainPassword, salt, KEY_LENGTH).toString('hex');
  return `${SCRYPT_PREFIX}$${salt}$${derivedKey}`;
}

/**
 * Verifica uma senha em texto claro contra um hash armazenado usando comparação em tempo constante.
 *
 * @param {string} plainPassword
 * @param {string} storedHash
 * @returns {boolean}
 */
function verifyPassword(plainPassword, storedHash) {
  if (typeof plainPassword !== 'string' || typeof storedHash !== 'string') {
    return false;
  }

  const parts = storedHash.split('$');
  if (parts.length !== 3 || parts[0] !== SCRYPT_PREFIX) {
    return false;
  }

  const [, salt, originalKeyHex] = parts;
  const derivedBuffer = crypto.scryptSync(plainPassword, salt, KEY_LENGTH);
  const originalBuffer = Buffer.from(originalKeyHex, 'hex');

  if (derivedBuffer.length !== originalBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(derivedBuffer, originalBuffer);
}

module.exports = {
  hashPassword,
  verifyPassword,
};
