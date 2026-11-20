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
const BranchOpeningHour = require('./branchOpeningHour');
const BranchClosure = require('./branchClosure');
const BarberWorkingHour = require('./barberWorkingHour');
const BarberTimeOff = require('./barberTimeOff');
const BarberService = require('./barberService');
const Plan = require('./plan');
const Subscription = require('./subscription');
const SubscriptionEvent = require('./subscriptionEvent');
const Invitation = require('./invitation');
const IdempotencyKey = require('./idempotencyKey');
const AppointmentEvent = require('./appointmentEvent');
const Job = require('./job');
const BarbershopClient = require('./barbershopClient');
const WebhookEvent = require('./webhookEvent');
const UserToken = require('./userToken');
const UserIdentity = require('./userIdentity');
const RefreshToken = require('./refreshToken');
const AuditLog = require('./auditLog');
const Upload = require('./upload');
const BarbershopMember = require('./barbershopMember');
const PushToken = require('./pushToken');

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

// Histórico do agendamento (BE-15)
Appointment.hasMany(AppointmentEvent, { foreignKey: 'appointment_id', as: 'events', onDelete: 'CASCADE' });
AppointmentEvent.belongsTo(Appointment, { foreignKey: 'appointment_id' });

// ============================================
// Payment associations
// ============================================
Appointment.hasOne(Payment, { 
  foreignKey: 'appointment_id' 
});
Payment.belongsTo(Appointment, { 
  foreignKey: 'appointment_id' 
});

// ============================================
// Branch → horário de funcionamento e fechamentos (BE-10)
// ============================================
Branch.hasMany(BranchOpeningHour, { foreignKey: 'branch_id', as: 'opening_hours', onDelete: 'CASCADE' });
BranchOpeningHour.belongsTo(Branch, { foreignKey: 'branch_id' });
Branch.hasMany(BranchClosure, { foreignKey: 'branch_id', as: 'closures', onDelete: 'CASCADE' });
BranchClosure.belongsTo(Branch, { foreignKey: 'branch_id' });

// ============================================
// Barber → jornada e bloqueios (BE-11)
// ============================================
Barber.hasMany(BarberWorkingHour, { foreignKey: 'barber_id', as: 'working_hours', onDelete: 'CASCADE' });
BarberWorkingHour.belongsTo(Barber, { foreignKey: 'barber_id' });
Barber.hasMany(BarberTimeOff, { foreignKey: 'barber_id', as: 'time_off', onDelete: 'CASCADE' });
BarberTimeOff.belongsTo(Barber, { foreignKey: 'barber_id' });

// ============================================
// Barber × Service — quem executa o quê (BE-19)
// ============================================
Barber.belongsToMany(Service, { through: BarberService, foreignKey: 'barber_id', otherKey: 'service_id' });
Service.belongsToMany(Barber, { through: BarberService, foreignKey: 'service_id', otherKey: 'barber_id' });

// ============================================
// Assinatura SaaS (BE-31)
// ============================================
Barbershop.hasOne(Subscription, { foreignKey: 'barbershop_id', onDelete: 'CASCADE' });
Subscription.belongsTo(Barbershop, { foreignKey: 'barbershop_id' });
Subscription.hasMany(SubscriptionEvent, { foreignKey: 'subscription_id', as: 'events', onDelete: 'CASCADE' });
SubscriptionEvent.belongsTo(Subscription, { foreignKey: 'subscription_id' });

// ============================================
// Convites de barbeiro (BE-22)
// ============================================
Invitation.belongsTo(Branch, { foreignKey: 'branch_id' });
Invitation.belongsTo(Barbershop, { foreignKey: 'barbershop_id' });
Branch.hasMany(Invitation, { foreignKey: 'branch_id', onDelete: 'CASCADE' });

// ============================================
// Clientes da barbearia (BE-23)
// ============================================
Barbershop.hasMany(BarbershopClient, { foreignKey: 'barbershop_id', onDelete: 'CASCADE' });
BarbershopClient.belongsTo(Barbershop, { foreignKey: 'barbershop_id' });
BarbershopClient.belongsTo(User, { foreignKey: 'user_id', as: 'user' });
Appointment.belongsTo(BarbershopClient, { foreignKey: 'client_id', as: 'customer' });
BarbershopClient.hasMany(Appointment, { foreignKey: 'client_id', as: 'appointments' });

UserToken.belongsTo(User, { foreignKey: 'user_id' });
User.hasMany(UserToken, { foreignKey: 'user_id', onDelete: 'CASCADE' });

UserIdentity.belongsTo(User, { foreignKey: 'user_id' });
User.hasMany(UserIdentity, { foreignKey: 'user_id', as: 'identities', onDelete: 'CASCADE' });

RefreshToken.belongsTo(User, { foreignKey: 'user_id' });
User.hasMany(RefreshToken, { foreignKey: 'user_id', onDelete: 'CASCADE' });

AuditLog.belongsTo(User, { foreignKey: 'actor_id', as: 'actor' });

Barbershop.hasMany(BarbershopMember, { foreignKey: 'barbershop_id', as: 'members', onDelete: 'CASCADE' });
BarbershopMember.belongsTo(Barbershop, { foreignKey: 'barbershop_id' });
BarbershopMember.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

PushToken.belongsTo(User, { foreignKey: 'user_id' });

module.exports = {
  sequelize,
  PushToken,
  BarbershopMember,
  Upload,
  AuditLog,
  RefreshToken,
  UserIdentity,
  UserToken,
  WebhookEvent,
  BarbershopClient,
  Job,
  AppointmentEvent,
  IdempotencyKey,
  Invitation,
  Plan,
  Subscription,
  SubscriptionEvent,
  BarberService,
  BarberWorkingHour,
  BarberTimeOff,
  BranchOpeningHour,
  BranchClosure,
  User,
  Barber,
  Service,
  Appointment,
  Address,
  Barbershop,
  Branch,
  Payment,
};
