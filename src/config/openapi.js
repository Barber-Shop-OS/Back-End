// BE-43: especificação OpenAPI estável para exportar/commitar (docs/openapi.json).
// Ordena caminhos e chaves para o diff do arquivo só mudar quando o contrato mudar.
const { specs } = require('./swagger');

const sortKeys = (value) => {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, sortKeys(value[key])])
  );
};

const buildSpec = () => {
  const spec = JSON.parse(JSON.stringify(specs));
  // Servidores reais variam por ambiente; o contrato usa o prefixo relativo.
  spec.servers = [{ url: '/api', description: 'Prefixo da API (mesmo host do ambiente)' }];
  return sortKeys(spec);
};

/** "GET /api/user/:id" → ["/user/{id}", "get"] (formato das chaves do OpenAPI). */
const toSpecKey = (route) => {
  const [method, routePath] = route.split(' ');
  return [routePath.replace(/^\/api/, '').replace(/:(\w+)/g, '{$1}') || '/', method.toLowerCase()];
};

module.exports = { buildSpec, toSpecKey, sortKeys };
