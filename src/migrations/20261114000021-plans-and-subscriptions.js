'use strict';

// BE-31: planos (semeados a partir de src/shared/plans.js), assinaturas por barbearia e histórico.
// Barbearias existentes recebem uma assinatura em trial de 14 dias.
const { PLANS, TRIAL_DAYS, TRIAL_PLAN_CODE } = require('../shared/plans');

const STATUSES = ['trialing', 'pending', 'active', 'past_due', 'canceled', 'expired'];

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('plans', {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      code: { type: Sequelize.STRING(30), allowNull: false, unique: true },
      name: { type: Sequelize.STRING(60), allowNull: false },
      price_cents: { type: Sequelize.INTEGER, allowNull: false },
      interval: { type: Sequelize.STRING(20), allowNull: false, defaultValue: 'MONTHLY' },
      limits: { type: Sequelize.JSON, allowNull: false },
      features: { type: Sequelize.JSON, allowNull: false },
      sort_order: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      abacatepay_product_id: { type: Sequelize.STRING(100), allowNull: true },
      active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
    });

    await queryInterface.createTable('subscriptions', {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      barbershop_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        unique: true,
        references: { model: 'barbershops', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      plan_code: { type: Sequelize.STRING(30), allowNull: false },
      status: { type: Sequelize.ENUM(...STATUSES), allowNull: false, defaultValue: 'trialing' },
      trial_ends_at: { type: Sequelize.DATE, allowNull: true },
      current_period_start: { type: Sequelize.DATE, allowNull: true },
      current_period_end: { type: Sequelize.DATE, allowNull: true },
      cancel_at_period_end: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      past_due_since: { type: Sequelize.DATE, allowNull: true },
      abacatepay_customer_id: { type: Sequelize.STRING(100), allowNull: true },
      abacatepay_subscription_id: { type: Sequelize.STRING(100), allowNull: true },
      abacatepay_checkout_id: { type: Sequelize.STRING(100), allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      updated_at: { type: Sequelize.DATE, allowNull: true },
    });

    await queryInterface.createTable('subscription_events', {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      subscription_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'subscriptions', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      type: { type: Sequelize.STRING(60), allowNull: false },
      from_status: { type: Sequelize.STRING(20), allowNull: true },
      to_status: { type: Sequelize.STRING(20), allowNull: true },
      payload: { type: Sequelize.JSON, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
    });
    await queryInterface.addIndex('subscription_events', ['subscription_id'], { name: 'subscription_events_subscription_idx' });

    await queryInterface.bulkInsert(
      'plans',
      PLANS.map((plan) => ({
        code: plan.code,
        name: plan.name,
        price_cents: plan.price_cents,
        interval: plan.interval,
        limits: JSON.stringify(plan.limits),
        features: JSON.stringify(plan.features),
        sort_order: plan.sort_order,
        active: true,
      }))
    );

    const shops = await queryInterface.sequelize.query('SELECT id FROM barbershops', {
      type: queryInterface.sequelize.QueryTypes.SELECT,
    });
    // Datas em texto UTC no formato de cada dialeto (o escape padrão usaria o fuso local).
    const sqlite = queryInterface.sequelize.getDialect() === 'sqlite';
    const fmt = (date) => `${date.toISOString().replace('T', ' ').replace('Z', '')}${sqlite ? ' +00:00' : ''}`;
    const nowDate = new Date();
    const now = fmt(nowDate);
    const trialEnd = fmt(new Date(nowDate.getTime() + TRIAL_DAYS * 86400000));
    for (const shop of shops) {
      await queryInterface.sequelize.query(
        `INSERT INTO subscriptions (barbershop_id, plan_code, status, trial_ends_at, cancel_at_period_end, created_at, updated_at)
         VALUES (:id, :plan, 'trialing', :trialEnd, false, :now, :now)`,
        { replacements: { id: shop.id, plan: TRIAL_PLAN_CODE, trialEnd, now } }
      );
    }
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable('subscription_events', {});
    await queryInterface.dropTable('subscriptions', {});
    await queryInterface.dropTable('plans', {});
  },
};
