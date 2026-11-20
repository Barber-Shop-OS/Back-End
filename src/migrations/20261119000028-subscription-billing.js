'use strict';

// BE-32: dados de cobrança na assinatura — CPF/CNPJ do pagador, troca de plano agendada
// (vale no próximo ciclo na AbacatePay) e pedido de cancelamento no fim do período.
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('subscriptions', 'billing_tax_id', { type: Sequelize.STRING(14), allowNull: true });
    await queryInterface.addColumn('subscriptions', 'pending_plan_code', { type: Sequelize.STRING(30), allowNull: true });
    await queryInterface.addColumn('subscriptions', 'cancel_requested_at', { type: Sequelize.DATE, allowNull: true });
  },

  down: async (queryInterface) => {
    await queryInterface.removeColumn('subscriptions', 'cancel_requested_at');
    await queryInterface.removeColumn('subscriptions', 'pending_plan_code');
    await queryInterface.removeColumn('subscriptions', 'billing_tax_id');
  },
};
