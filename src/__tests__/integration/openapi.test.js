// BE-43: o contrato OpenAPI cobre 100% das rotas e o docs/openapi.json commitado está atualizado.
const fs = require('fs');
const path = require('path');
const { listRoutes } = require('../../routes/indexRoutes');
const { buildSpec, toSpecKey } = require('../../config/openapi');

describe('BE-43 — contrato OpenAPI', () => {
  const spec = buildSpec();

  it('toda rota registrada está documentada', () => {
    const missing = listRoutes().filter((route) => {
      const [key, method] = toSpecKey(route);
      return !(spec.paths[key] && spec.paths[key][method]);
    });
    expect(missing).toEqual([]);
  });

  it('nenhuma rota documentada deixou de existir', () => {
    const registered = new Set(listRoutes().map((route) => toSpecKey(route).join(' ')));
    const ghosts = [];
    for (const [key, methods] of Object.entries(spec.paths)) {
      for (const method of Object.keys(methods)) {
        if (['get', 'post', 'put', 'patch', 'delete'].includes(method) && !registered.has(`${key} ${method}`)) ghosts.push(`${method.toUpperCase()} ${key}`);
      }
    }
    expect(ghosts).toEqual([]);
  });

  it('docs/openapi.json está atualizado (rode npm run openapi:export)', () => {
    const file = path.resolve(__dirname, '../../../docs/openapi.json');
    const committed = JSON.parse(fs.readFileSync(file, 'utf8'));
    expect(committed).toEqual(JSON.parse(JSON.stringify(spec)));
  });
});
