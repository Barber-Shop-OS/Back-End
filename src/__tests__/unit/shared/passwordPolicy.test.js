// SEC-10: política de senha.
const { passwordProblem, assertStrongPassword, COMMON_PASSWORDS } = require('../../../shared/passwordPolicy');

describe('passwordPolicy (SEC-10)', () => {
  it('carrega a lista de senhas comuns (SecLists + pt-BR)', () => {
    expect(COMMON_PASSWORDS.size).toBeGreaterThan(2000);
    expect(COMMON_PASSWORDS.has('password')).toBe(true);
    expect(COMMON_PASSWORDS.has('senha123')).toBe(true);
  });

  it.each([
    'password',
    'Password', // comparação sem diferenciar maiúsculas
    '12345678',
    'qwertyuiop',
    'senha123',
    'Flamengo123',
    'barbearia123',
    'iloveyou',
    'Senha@123', // palavra comum + símbolos/números no fim
    'password123',
    'Flamengo2026!',
  ])('recusa senha comum: %s', (password) => {
    expect(passwordProblem(password)).toMatch(/comum|previsível/);
  });

  it.each(['aaaaaaaa', '99999999', 'abcdefghij', '98765432', 'zyxwvuts'])('recusa senha previsível: %s', (password) => {
    expect(passwordProblem(password)).toMatch(/previsível|comum/);
  });

  it('recusa senha igual ao e-mail, à parte local do e-mail ou ao nome', () => {
    expect(passwordProblem('carla@exemplo.com', { email: 'Carla@Exemplo.com' })).toMatch(/e-mail/);
    expect(passwordProblem('carlasouza', { email: 'carlasouza@x.com' })).toMatch(/e-mail/);
    expect(passwordProblem('carlasouza', { name: 'Carla Souza' })).toMatch(/nome/);
  });

  it.each([['curta', '1a2b3c4'], ['longa', 'x'.repeat(73)], ['vazia', ''], ['não-texto', 12345678]])(
    'recusa senha %s',
    (_label, password) => {
      expect(passwordProblem(password)).not.toBeNull();
    }
  );

  it.each(['corte-na-régua-2026', 'Tesoura#Navalha9', 'correct horse battery staple'])(
    'aceita senha razoável: %s',
    (password) => {
      expect(passwordProblem(password, { email: 'joao@x.com', name: 'João' })).toBeNull();
    }
  );

  it('assertStrongPassword lança 400 com code WEAK_PASSWORD e detalhe do campo', () => {
    try {
      assertStrongPassword('password');
      throw new Error('deveria falhar');
    } catch (error) {
      expect(error.statusCode).toBe(400);
      expect(error.code).toBe('WEAK_PASSWORD');
      expect(error.details).toEqual([{ field: 'password', message: expect.any(String) }]);
    }
  });
});
