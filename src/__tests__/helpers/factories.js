// Factories e helpers de autenticação para testes de integração.
const bcrypt = require('bcryptjs');
const request = require('supertest');
const app = require('../../app');
const {
  sequelize,
  User,
  Barbershop,
  Address,
  Branch,
  Barber,
  Service,
  Appointment,
  BarberService,
  Subscription,
} = require('../../models');

const DEFAULT_PASSWORD = 'Tesoura#Navalha9';
let sequence = 0;
const next = () => {
  sequence += 1;
  return sequence;
};

// Recria o schema e semeia os planos (a migration faz isso em produção — BE-31).
const resetDatabase = async () => {
  await sequelize.sync({ force: true });
  const { Plan } = require('../../models');
  const { PLANS } = require('../../shared/plans');
  await Plan.bulkCreate(PLANS.map((plan) => ({ ...plan })));
};

const createUser = async ({ role = 'cliente', name, email, password = DEFAULT_PASSWORD } = {}) => {
  const n = next();
  return User.create({
    name: name || `Usuário ${n}`,
    email: email || `user${n}@test.com`,
    password: await bcrypt.hash(password, 4),
    role,
  });
};

const loginAs = async (user, password = DEFAULT_PASSWORD) => {
  const response = await request(app).post('/api/auth/login').send({ email: user.email, password });
  if (response.status !== 200) {
    throw new Error(`Falha no login de teste: ${response.status} ${JSON.stringify(response.body)}`);
  }
  return response.body.token;
};

const bearer = (token) => ({ Authorization: `Bearer ${token}` });

/**
 * Cria um tenant completo: owner, barbearia, endereço, filial, barbeiro e serviço.
 */
const createTenant = async ({ name, subscription = {} } = {}) => {
  const n = next();
  const owner = await createUser({ role: 'owner', name: `Owner ${n}` });
  const barbershop = await Barbershop.create({ name: name || `Barbearia ${n}`, owner_id: owner.id });
  await Subscription.create({
    barbershop_id: barbershop.id,
    plan_code: subscription.plan_code || 'profissional',
    status: subscription.status || 'trialing',
    trial_ends_at: subscription.trial_ends_at || new Date(Date.now() + 14 * 86400000),
    ...subscription,
  });
  const address = await Address.create({ cep: '01001-000', number: 100, city: 'São Paulo', state: 'SP' });
  const branch = await Branch.create({ name: `Filial ${n}`, barbershop_id: barbershop.id, address_id: address.id });
  const barberUser = await createUser({ role: 'barbeiro', name: `Barbeiro ${n}` });
  const barber = await Barber.create({ user_id: barberUser.id, branch_id: branch.id, bio: 'Especialista' });
  const service = await Service.create({
    name: 'Corte',
    description: 'Corte masculino',
    price: 50,
    duration: 30,
    barbershop_id: barbershop.id,
  });
  await BarberService.create({ barber_id: barber.id, service_id: service.id });
  return { owner, barbershop, address, branch, barberUser, barber, service };
};

const createAppointment = async ({ tenant, client, date, status = 'confirmado', barber, service, ...extra }) => {
  const start = date ? new Date(date) : new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
  const svc = service || tenant.service;
  return Appointment.create({
    user_id: client.id,
    barber_id: (barber || tenant.barber).id,
    service_id: svc.id,
    branch_id: tenant.branch.id,
    start_at: start,
    end_at: new Date(start.getTime() + svc.duration * 60000),
    duration_min: svc.duration,
    price_snapshot: svc.price,
    service_name_snapshot: svc.name,
    status,
    ...extra,
  });
};

module.exports = {
  app,
  request,
  DEFAULT_PASSWORD,
  resetDatabase,
  createUser,
  loginAs,
  bearer,
  createTenant,
  createAppointment,
  sequelize,
};
