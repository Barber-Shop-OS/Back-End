// BE-19: tabela de junção barbeiro × serviço (quem executa o quê).
const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');

const BarberService = sequelize.define('BarberService', {
  barber_id: { type: DataTypes.INTEGER, allowNull: false, primaryKey: true, references: { model: 'barbers', key: 'id' } },
  service_id: { type: DataTypes.INTEGER, allowNull: false, primaryKey: true, references: { model: 'services', key: 'id' } },
}, {
  tableName: 'barber_services',
  timestamps: false,
  indexes: [{ name: 'barber_services_service_idx', fields: ['service_id'] }],
});

module.exports = BarberService;
