/* eslint-disable no-console -- script de linha de comando */
// BE-43: npm run openapi:export — gera docs/openapi.json (contrato versionado, consumido pelo
// openapi-typescript do front e do mobile). O teste src/__tests__/integration/openapi.test.js falha
// se o arquivo commitado estiver desatualizado ou se alguma rota não tiver documentação.
process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'openapi-export-secret-with-32-characters!!';
const fs = require('fs');
const path = require('path');
const { buildSpec } = require('../src/config/openapi');

const target = path.resolve(__dirname, '../docs/openapi.json');
fs.writeFileSync(target, `${JSON.stringify(buildSpec(), null, 2)}\n`);
console.log(`OpenAPI exportado em ${path.relative(process.cwd(), target)}`);
