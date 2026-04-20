// Sprint 1.9: Updated Appointment model with branch and payment association
const {DataTypes} = require('sequelize');
const sequelize = require('../config/sequelize');

const Appointment = sequelize.define('appointments', {
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
    },
    user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
        model: 'users',
        key: 'id',
        },
    },
    barber_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
        model: 'barbers',
        key: 'id',
        },
    },
    service_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
        model: 'services',
        key: 'id',
        },
    },
    branch_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
        model: 'branches',
        key: 'id',
        },
    },
    appointment_date: {
        type: DataTypes.DATE,
        allowNull: false,
    },
    status: {
        type: DataTypes.ENUM('pendente', 'confirmado', 'cancelado'),
        allowNull: false,
    },
    created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
    },
}, {
    timestamps: false,
});

module.exports = Appointment;
