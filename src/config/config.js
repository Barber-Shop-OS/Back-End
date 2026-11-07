// Configuração validada da aplicação (ver env.js). Lança erro no require se o ambiente for inválido.
const { loadEnv } = require('./env');

module.exports = loadEnv();
