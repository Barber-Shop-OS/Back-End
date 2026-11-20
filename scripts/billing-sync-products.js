// BE-32: npm run billing:sync-products — cria/vincula na AbacatePay um produto mensal por plano.
/* eslint-disable no-console -- script de linha de comando */
// Precisa de ABACATEPAY_API_KEY (use uma chave abc_dev_ para o modo teste) e do banco configurado.
require('dotenv').config();
const { connectDatabase } = require('../src/config/sequelize');
const { sequelize } = require('../src/models');
const billingService = require('../src/modules/billing/billingService');

(async () => {
  try {
    await connectDatabase();
    const results = await billingService.syncProducts({ log: (line) => console.log(line) });
    results.forEach((row) => console.log(`${row.code}: ${row.product_id} (${row.action})`));
    await sequelize.close();
  } catch (error) {
    console.error(`Falha ao sincronizar produtos: ${error.message}`);
    process.exit(1);
  }
})();
