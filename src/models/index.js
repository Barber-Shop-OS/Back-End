// Sprint 1.10: Complete model associations for SaaS architecture
const sequelize = require('../config/sequelize');
const User = require('./user');
const Barber = require('./barber');
const Service = require('./service');
const Appointment = require('./appointment');
const Address = require('./address');
const Barbershop = require('./barbershop');
const Branch = require('./branch');
const Payment = require('./payment');

// ============================================
// User associations
// ============================================
User.hasMany(Barbershop, { 
  foreignKey: 'owner_id', 
  as: 'barbershops' 
});
Barbershop.belongsTo(User, { 
  foreignKey: 'owner_id', 
  as: 'owner' 
});

// ============================================
// Barbershop → Branch
// ============================================
Barbershop.hasMany(Branch, { 
  foreignKey: 'barbershop_id' 
});
Branch.belongsTo(Barbershop, { 
  foreignKey: 'barbershop_id' 
});

// ============================================
// Branch → Address
// ============================================
Branch.belongsTo(Address, { 
  foreignKey: 'address_id' 
});
Address.hasOne(Branch, { 
  foreignKey: 'address_id' 
});

// ============================================
// Branch → Barber
// ============================================
Branch.hasMany(Barber, { 
  foreignKey: 'branch_id' 
});
Barber.belongsTo(Branch, { 
  foreignKey: 'branch_id' 
});

// ============================================
// Barbershop → Service
// ============================================
Barbershop.hasMany(Service, { 
  foreignKey: 'barbershop_id' 
});
Service.belongsTo(Barbershop, { 
  foreignKey: 'barbershop_id' 
});

// ============================================
// Barber → User (existing relation)
// ============================================
Barber.belongsTo(User, { 
  foreignKey: 'user_id' 
});
User.hasMany(Barber, { 
  foreignKey: 'user_id',
  as: 'barberProfiles'
});

// ============================================
// Appointment associations
// ============================================
Appointment.belongsTo(User, { 
  foreignKey: 'user_id', 
  as: 'client' 
});
User.hasMany(Appointment, { 
  foreignKey: 'user_id' 
});

Appointment.belongsTo(Barber, { 
  foreignKey: 'barber_id' 
});
Barber.hasMany(Appointment, { 
  foreignKey: 'barber_id' 
});

Appointment.belongsTo(Service, { 
  foreignKey: 'service_id' 
});
Service.hasMany(Appointment, { 
  foreignKey: 'service_id' 
});

Appointment.belongsTo(Branch, { 
  foreignKey: 'branch_id' 
});
Branch.hasMany(Appointment, { 
  foreignKey: 'branch_id' 
});

// ============================================
// Payment associations
// ============================================
Appointment.hasOne(Payment, { 
  foreignKey: 'appointment_id' 
});
Payment.belongsTo(Appointment, { 
  foreignKey: 'appointment_id' 
});

module.exports = {
  sequelize,
  User,
  Barber,
  Service,
  Appointment,
  Address,
  Barbershop,
  Branch,
  Payment,
};
