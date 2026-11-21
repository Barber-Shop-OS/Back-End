/* eslint-disable no-console -- script de linha de comando */
// SEC-28: derruba sessões em massa. Ver docs/security/incident-response.md.
// Uso: npm run revoke-sessions -- --all --yes | --role=admin --yes | --user=12,34 --yes
require('dotenv').config();
const { sequelize } = require('../src/models');
const { revokeSessions, ROLES } = require('../src/shared/revokeSessions');

const args = process.argv.slice(2);
const value = (name) => args.find((arg) => arg.startsWith(`--${name}=`))?.split('=')[1];

(async () => {
  const role = value('role');
  const userIds = value('user')?.split(',').map(Number).filter(Number.isInteger);
  const all = args.includes('--all');
  if (!all && !role && !userIds?.length) {
    console.error(`Uso: npm run revoke-sessions -- (--all | --role=<${ROLES.join('|')}> | --user=<id,id>) --yes`);
    process.exit(1);
  }
  if (!args.includes('--yes')) {
    console.error('Confirme com --yes: todos os usuários do escopo precisarão entrar de novo.');
    process.exit(1);
  }
  try {
    const result = await revokeSessions({ role, userIds });
    console.log(`Sessões derrubadas: ${result.users} usuário(s), ${result.refreshTokens} refresh token(s) revogado(s).`);
    process.exit(0);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  } finally {
    await sequelize.close().catch(() => {});
  }
})();
