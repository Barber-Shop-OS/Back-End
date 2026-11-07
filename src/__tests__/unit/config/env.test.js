const { loadEnv } = require('../../../config/env');

const STRONG = 'a'.repeat(48);
const base = {
  NODE_ENV: 'production',
  JWT_SECRET: STRONG,
  DB_HOST: 'db',
  DB_USER: 'app',
  DB_NAME: 'barberos',
  CORS_ORIGINS: 'https://app.barberos.com.br, https://www.barberos.com.br',
};

describe('loadEnv (BE-02)', () => {
  it('aceita configuração de produção completa', () => {
    const config = loadEnv(base);
    expect(config.isProduction).toBe(true);
    expect(config.jwt.secret).toBe(STRONG);
    expect(config.corsOrigins).toEqual(['https://app.barberos.com.br', 'https://www.barberos.com.br']);
  });

  it('falha sem JWT_SECRET', () => {
    const { JWT_SECRET, ...env } = base;
    expect(() => loadEnv(env)).toThrow('JWT_SECRET é obrigatório');
  });

  it('falha com JWT_SECRET curto', () => {
    expect(() => loadEnv({ ...base, JWT_SECRET: 'curto' })).toThrow('pelo menos 32 caracteres');
  });

  it('falha com segredo de exemplo mesmo se tiver tamanho suficiente', () => {
    expect(() => loadEnv({ ...base, JWT_SECRET: '********' })).toThrow();
  });

  it('falha em produção sem CORS_ORIGINS', () => {
    const { CORS_ORIGINS, ...env } = base;
    expect(() => loadEnv(env)).toThrow('CORS_ORIGINS');
  });

  it('falha fora de teste sem dados do banco', () => {
    const { DB_HOST, ...env } = base;
    expect(() => loadEnv(env)).toThrow('DB_HOST');
  });

  it('em desenvolvimento usa as origens locais por padrão', () => {
    const config = loadEnv({ ...base, NODE_ENV: 'development', CORS_ORIGINS: undefined });
    expect(config.corsOrigins).toContain('http://localhost:5173');
  });

  it('lista todos os erros de uma vez', () => {
    try {
      loadEnv({ NODE_ENV: 'production' });
      throw new Error('deveria falhar');
    } catch (error) {
      expect(error.message).toContain('JWT_SECRET');
      expect(error.message).toContain('DB_HOST');
      expect(error.message).toContain('CORS_ORIGINS');
    }
  });
});
