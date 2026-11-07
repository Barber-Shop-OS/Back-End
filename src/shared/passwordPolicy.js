// SEC-10: política de senha. Usada no cadastro e, futuramente, em troca/reset de senha (BE-26, BE-29).
// Regras: 8..72 caracteres; não está entre as senhas mais comuns (SecLists 10k + lista pt-BR), nem é
// uma delas seguida só de números/símbolos ("password123");
// não é um caractere repetido nem uma sequência simples; não é igual ao e-mail, à parte local do
// e-mail nem ao nome.
const fs = require('fs');
const path = require('path');
const { ValidationError, CODES } = require('../utils/errorHandler');

const MIN_LENGTH = 8;
const MAX_LENGTH = 72; // limite do bcrypt

const COMMON_PASSWORDS = new Set(
  fs
    .readFileSync(path.join(__dirname, 'data', 'common-passwords.txt'), 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
);

const normalize = (value) => String(value || '').trim().toLowerCase();

const isRepeatedChar = (value) => /^(.)\1+$/.test(value);

/** "12345678", "87654321", "abcdefgh"... (passo +1 ou -1 em todo o texto). */
const isSimpleSequence = (value) => {
  if (value.length < 3) return false;
  const step = value.charCodeAt(1) - value.charCodeAt(0);
  if (Math.abs(step) !== 1) return false;
  for (let i = 2; i < value.length; i += 1) {
    if (value.charCodeAt(i) - value.charCodeAt(i - 1) !== step) return false;
  }
  return true;
};

/** Retorna o motivo da recusa, ou null se a senha é aceitável. */
const passwordProblem = (password, { email, name } = {}) => {
  if (typeof password !== 'string' || password.length < MIN_LENGTH) {
    return `Senha deve ter no mínimo ${MIN_LENGTH} caracteres`;
  }
  if (password.length > MAX_LENGTH) {
    return `Senha deve ter no máximo ${MAX_LENGTH} caracteres`;
  }

  const lower = normalize(password);
  // "password123", "Flamengo2026!", "senha@123": palavra comum + números/símbolos no fim.
  const base = lower.replace(/[\d\W_]+$/u, '');
  if (COMMON_PASSWORDS.has(lower) || (base.length >= 4 && COMMON_PASSWORDS.has(base))) {
    return 'Essa senha é muito comum e fácil de adivinhar. Escolha outra.';
  }
  if (isRepeatedChar(lower) || isSimpleSequence(lower)) {
    return 'Senha muito previsível (caracteres repetidos ou em sequência). Escolha outra.';
  }

  const normalizedEmail = normalize(email);
  const localPart = normalizedEmail.split('@')[0];
  const compactName = normalize(name).replace(/\s+/g, '');
  if (lower === normalizedEmail || (localPart && lower === localPart)) {
    return 'A senha não pode ser igual ao e-mail';
  }
  if (compactName && lower === compactName) {
    return 'A senha não pode ser igual ao seu nome';
  }
  return null;
};

const assertStrongPassword = (password, context) => {
  const problem = passwordProblem(password, context);
  if (problem) {
    throw new ValidationError(problem, [{ field: 'password', message: problem }], CODES.WEAK_PASSWORD);
  }
};

module.exports = { assertStrongPassword, passwordProblem, MIN_LENGTH, MAX_LENGTH, COMMON_PASSWORDS };
