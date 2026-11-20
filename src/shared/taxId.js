// BE-32: validação de CPF/CNPJ (dígitos verificadores). Retorna só os dígitos ou null se inválido.
const allSame = (digits) => /^(\d)\1+$/.test(digits);

const cpfValid = (cpf) => {
  if (cpf.length !== 11 || allSame(cpf)) return false;
  const check = (len) => {
    let sum = 0;
    for (let i = 0; i < len; i += 1) sum += Number(cpf[i]) * (len + 1 - i);
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };
  return check(9) === Number(cpf[9]) && check(10) === Number(cpf[10]);
};

const cnpjValid = (cnpj) => {
  if (cnpj.length !== 14 || allSame(cnpj)) return false;
  const check = (len) => {
    const weights = len === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const sum = weights.reduce((acc, weight, i) => acc + Number(cnpj[i]) * weight, 0);
    const rest = sum % 11;
    return rest < 2 ? 0 : 11 - rest;
  };
  return check(12) === Number(cnpj[12]) && check(13) === Number(cnpj[13]);
};

const normalizeTaxId = (value) => {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length === 11) return cpfValid(digits) ? digits : null;
  if (digits.length === 14) return cnpjValid(digits) ? digits : null;
  return null;
};

module.exports = { normalizeTaxId, cpfValid, cnpjValid };
