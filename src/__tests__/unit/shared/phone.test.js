const { normalizePhone } = require('../../../shared/phone');

describe('normalizePhone', () => {
  it.each([
    ['(11) 98765-4321', '+5511987654321'],
    ['11987654321', '+5511987654321'],
    ['1133334444', '+551133334444'],
    ['+55 11 98765-4321', '+5511987654321'],
    ['+1 415 555 2671', '+14155552671'],
  ])('%s → %s', (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });

  it.each([null, undefined, '', '   '])('vazio (%p) vira null', (input) => {
    expect(normalizePhone(input)).toBeNull();
  });

  it.each(['123', 'abc', '+0 11 9999', '9999999'])('rejeita %s', (input) => {
    expect(() => normalizePhone(input)).toThrow('Telefone inválido');
  });
});
