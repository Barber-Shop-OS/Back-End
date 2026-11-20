/* eslint-disable no-console -- script de linha de comando */
// BE-41 / SEC-27: criação de administrador SOMENTE por CLI (nunca pela API pública).
// Uso: npm run create-admin -- email@empresa.com "Nome" "SenhaForte#2026"
// Se o e-mail já existir, promove a admin (derrubando as sessões abertas).
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { sequelize, User } = require('../src/models');
const { assertStrongPassword } = require('../src/shared/passwordPolicy');

(async () => {
  const [email, name, password] = process.argv.slice(2);
  if (!email || !name || !password) {
    console.error('Uso: npm run create-admin -- <email> "<nome>" "<senha>"');
    process.exit(1);
  }
  try {
    const normalized = email.trim().toLowerCase();
    assertStrongPassword(password, { email: normalized, name });
    await sequelize.authenticate();
    const hash = await bcrypt.hash(password, 12);
    const existing = await User.findOne({ where: { email: normalized } });
    if (existing) {
      await existing.update({
        role: 'admin',
        password: hash,
        token_version: Number(existing.token_version || 0) + 1,
        email_verified_at: existing.email_verified_at || new Date(),
      });
      console.log(`Usuário ${normalized} promovido a admin.`);
    } else {
      await User.create({ email: normalized, name, password: hash, role: 'admin', email_verified_at: new Date() });
      console.log(`Admin ${normalized} criado.`);
    }
    await sequelize.close();
  } catch (error) {
    console.error(`Falha: ${error.message}`);
    process.exit(1);
  }
})();
