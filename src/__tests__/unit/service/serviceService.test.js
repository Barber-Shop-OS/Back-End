// BE-06: regras puras de preço e duração.
const { toCents, assertDuration } = require('../../../modules/service/serviceService');

describe('BE-06 — toCents', () => {
  it.each([
    [29.9, 2990],
    ['29.90', 2990],
    [0, 0],
    [0.1, 10],
    [1234.56, 123456],
  ])('%p → %p centavos', (input, cents) => {
    expect(toCents(input)).toBe(cents);
  });

  it.each([[-1], [29.999], ['abc'], [null], ['']])('%p → erro de validação', (input) => {
    expect(() => toCents(input)).toThrow(expect.objectContaining({ statusCode: 400 }));
  });
});

describe('BE-06 — assertDuration', () => {
  it.each([[5], [30], [45], [480]])('%p é válido', (value) => {
    expect(assertDuration(value)).toBe(value);
  });

  it.each([[0], [4], [7], [485], [30.5]])('%p é inválido', (value) => {
    expect(() => assertDuration(value)).toThrow(expect.objectContaining({ statusCode: 400 }));
  });
});
