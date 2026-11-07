// Normaliza telefones para E.164 (+5511999999999). Números com 10/11 dígitos assumem Brasil (+55).
const { ValidationError } = require('../utils/errorHandler');

const E164 = /^\+[1-9]\d{10,14}$/;

const normalizePhone = (value) => {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const raw = String(value).trim();
  const digits = raw.replace(/\D/g, '');
  let candidate;
  if (raw.startsWith('+')) {
    candidate = `+${digits}`;
  } else if (digits.length === 10 || digits.length === 11) {
    candidate = `+55${digits}`;
  } else {
    candidate = `+${digits}`;
  }
  if (!E164.test(candidate)) {
    throw new ValidationError('Telefone inválido. Use DDD + número, ex.: (11) 99999-9999');
  }
  return candidate;
};

module.exports = { normalizePhone };
