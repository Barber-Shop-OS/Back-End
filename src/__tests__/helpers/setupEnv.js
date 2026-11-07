// Variáveis de ambiente usadas por toda a suíte (carregado via jest.setupFiles).
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-with-at-least-32-characters!!';
