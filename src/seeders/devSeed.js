// BE-39: dados de desenvolvimento e E2E (front FE-32 e mobile). Idempotente: se o admin semente já
// existe, não faz nada. Nunca roda com NODE_ENV=production.
//
// Contas (senha de todas: SEED_PASSWORD):
//   admin@barberos.dev                    admin
//   dono.navalha@barberos.dev             owner — "Navalha de Ouro", plano Profissional ativo, 2 filiais
//   dono.bigode@barberos.dev              owner — "Bigode Grosso", trial (Essencial), 1 filial
//   barbeiro1..6@barberos.dev             barbeiros (4 na Navalha, 2 no Bigode)
//   cliente1..8@barberos.dev              clientes com conta
const bcrypt = require('bcryptjs');
const models = require('../models');
const time = require('../shared/time');

const SEED_PASSWORD = 'Barberos#Dev2026';
const DAY = 86400000;

const {
  sequelize,
  User,
  Barbershop,
  Address,
  Branch,
  Barber,
  Service,
  BarberService,
  BranchOpeningHour,
  BarberWorkingHour,
  Subscription,
  Appointment,
  Payment,
  BarbershopClient,
} = models;

const assertNotProduction = () => {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Seed bloqueado: NODE_ENV=production');
  }
};

const seed = async ({ now = new Date(), log = () => {} } = {}) => {
  assertNotProduction();
  if (await User.findOne({ where: { email: 'admin@barberos.dev' }, paranoid: false })) {
    log('Seed já aplicado (admin@barberos.dev existe) — nada a fazer.');
    return { skipped: true };
  }
  const password = await bcrypt.hash(SEED_PASSWORD, 10);
  const verified = now;

  return sequelize.transaction(async (transaction) => {
    const opts = { transaction };
    const user = (email, name, role, extra = {}) =>
      User.create({ email, name, role, password, email_verified_at: verified, ...extra }, opts);

    await user('admin@barberos.dev', 'Admin BarberOS', 'admin');
    const owners = [
      await user('dono.navalha@barberos.dev', 'Carlos Navalha', 'owner', { phone: '+5511990000001' }),
      await user('dono.bigode@barberos.dev', 'Bruna Bigode', 'owner', { phone: '+5511990000002' }),
    ];

    const shops = [
      await Barbershop.create({ name: 'Navalha de Ouro', slug: 'navalha-de-ouro', owner_id: owners[0].id, description: 'Barbearia clássica no centro de São Paulo.', phone: '+5511330000001', instagram: 'navalhadeouro' }, opts),
      await Barbershop.create({ name: 'Bigode Grosso', slug: 'bigode-grosso', owner_id: owners[1].id, description: 'Cortes modernos e barba na régua.' }, opts),
    ];
    await Subscription.create(
      { barbershop_id: shops[0].id, plan_code: 'profissional', status: 'active', current_period_start: new Date(now.getTime() - 10 * DAY), current_period_end: new Date(now.getTime() + 20 * DAY), abacatepay_customer_id: 'cust_seed_1', abacatepay_subscription_id: 'subs_seed_1' },
      opts
    );
    await Subscription.create(
      { barbershop_id: shops[1].id, plan_code: 'essencial', status: 'trialing', trial_ends_at: new Date(now.getTime() + 9 * DAY) },
      opts
    );

    const branchSpecs = [
      { shop: 0, name: 'Centro', street: 'Rua Direita', number: 120, neighborhood: 'Sé', city: 'São Paulo', lat: -23.5489, lng: -46.6388 },
      { shop: 0, name: 'Pinheiros', street: 'Rua dos Pinheiros', number: 870, neighborhood: 'Pinheiros', city: 'São Paulo', lat: -23.5657, lng: -46.6819 },
      { shop: 1, name: 'Cambuí', street: 'Rua Coronel Quirino', number: 1300, neighborhood: 'Cambuí', city: 'Campinas', lat: -22.8953, lng: -47.0517 },
    ];
    const branches = [];
    for (const spec of branchSpecs) {
      const address = await Address.create(
        { cep: '01001-000', street: spec.street, number: spec.number, neighborhood: spec.neighborhood, city: spec.city, state: 'SP', latitude: spec.lat, longitude: spec.lng },
        opts
      );
      const branch = await Branch.create({ name: spec.name, barbershop_id: shops[spec.shop].id, address_id: address.id, phone: '+5511330000099' }, opts);
      // Seg–sáb 09:00–20:00, domingo fechado.
      await BranchOpeningHour.bulkCreate(
        [1, 2, 3, 4, 5, 6].map((weekday) => ({ branch_id: branch.id, weekday, opens_at: '09:00', closes_at: '20:00' })),
        opts
      );
      branches.push({ ...spec, model: branch });
    }

    const serviceSpecs = [
      [0, 'Corte', 'Corte masculino tradicional', 55, 30],
      [0, 'Barba', 'Barba com toalha quente', 40, 30],
      [0, 'Corte + Barba', 'Combo completo', 85, 60],
      [0, 'Pigmentação', 'Pigmentação de barba', 50, 45],
      [1, 'Corte degradê', 'Degradê na navalha', 45, 30],
      [1, 'Barba', 'Barba na régua', 30, 20],
      [1, 'Sobrancelha', 'Design de sobrancelha', 20, 15],
    ];
    const services = [];
    for (const [shop, name, description, price, duration] of serviceSpecs) {
      services.push(await Service.create({ barbershop_id: shops[shop].id, name, description, price, duration }, opts));
    }

    const barberSpecs = [
      [0, 'Zé Navalha'], [0, 'Léo Tesoura'], [1, 'Rafa Degradê'], [1, 'Duda Barba'], [2, 'Gui Régua'], [2, 'Nina Fade'],
    ];
    const barbers = [];
    for (let i = 0; i < barberSpecs.length; i += 1) {
      const [branchIndex, displayName] = barberSpecs[i];
      const branch = branches[branchIndex].model;
      const account = await user(`barbeiro${i + 1}@barberos.dev`, displayName, 'barbeiro');
      const barber = await Barber.create({ user_id: account.id, branch_id: branch.id, display_name: displayName, bio: 'Barbeiro há mais de 5 anos.' }, opts);
      const shopServices = services.filter((service) => service.barbershop_id === branch.barbershop_id);
      await BarberService.bulkCreate(shopServices.map((service) => ({ barber_id: barber.id, service_id: service.id })), opts);
      // Metade dos barbeiros com jornada própria (10–19h), o resto segue a filial.
      if (i % 2 === 1) {
        await BarberWorkingHour.bulkCreate(
          [1, 2, 3, 4, 5, 6].map((weekday) => ({ barber_id: barber.id, weekday, start_time: '10:00', end_time: '19:00' })),
          opts
        );
      }
      barbers.push({ model: barber, branch, services: shopServices });
    }

    const clients = [];
    for (let i = 1; i <= 8; i += 1) {
      clients.push(await user(`cliente${i}@barberos.dev`, `Cliente ${i}`, 'cliente', { phone: `+55119800000${String(i).padStart(2, '0')}` }));
    }
    const quickClient = await BarbershopClient.create({ barbershop_id: shops[0].id, name: 'Seu Jorge (balcão)', phone: '+5511977770000', notes: 'Prefere máquina 2' }, opts);

    // 50 agendamentos: passados (concluído/falta/cancelado) e futuros (confirmado/cancelado).
    const statusCycle = ['concluido', 'concluido', 'concluido', 'nao_compareceu', 'cancelado'];
    const clientIds = new Map();
    const ensureClient = async (shopId, account) => {
      const key = `${shopId}:${account.id}`;
      if (!clientIds.has(key)) {
        const row = await BarbershopClient.create({ barbershop_id: shopId, user_id: account.id, name: account.name, email: account.email, phone: account.phone }, opts);
        clientIds.set(key, row.id);
      }
      return clientIds.get(key);
    };
    let created = 0;
    for (let i = 0; i < 50; i += 1) {
      const barber = barbers[i % barbers.length];
      const service = barber.services[i % barber.services.length];
      const dayOffset = i < 30 ? -(1 + (i % 25)) : 1 + (i % 12);
      const date = time.addDays(time.todayIn(barber.branch.timezone, now), dayOffset);
      if (time.weekdayOf(date) === 0) continue; // domingo fechado
      const hour = 10 + (i % 8);
      const start = time.localToUtc(date, hour * 60, barber.branch.timezone);
      const status = i < 30 ? statusCycle[i % statusCycle.length] : i % 7 === 0 ? 'cancelado' : 'confirmado';
      const shopId = barber.branch.barbershop_id;
      const quick = i % 10 === 0 && shopId === shops[0].id;
      const account = clients[i % clients.length];
      const appointment = await Appointment.create(
        {
          user_id: quick ? null : account.id,
          client_id: quick ? quickClient.id : await ensureClient(shopId, account),
          barber_id: barber.model.id,
          service_id: service.id,
          branch_id: barber.branch.id,
          start_at: start,
          end_at: new Date(start.getTime() + service.duration * 60000),
          duration_min: service.duration,
          price_snapshot: service.price,
          service_name_snapshot: service.name,
          status,
          source: quick ? 'balcao' : i % 3 === 0 ? 'mobile' : 'web',
          ...(status === 'cancelado' ? { cancelled_at: new Date(start.getTime() - DAY), cancel_reason: 'Imprevisto' } : {}),
        },
        opts
      );
      if (status === 'concluido') {
        await Payment.create(
          {
            appointment_id: appointment.id,
            amount: service.price,
            method: ['PIX', 'CASH', 'CARD'][i % 3],
            status: 'PAID',
            paid_at: new Date(start.getTime() + service.duration * 60000),
            branch_id: barber.branch.id,
            barbershop_id: shopId,
          },
          opts
        );
      }
      created += 1;
    }
    log(`Seed aplicado: 2 barbearias, 3 filiais, 6 barbeiros, ${services.length} serviços, ${created} agendamentos.`);
    return { skipped: false, appointments: created };
  });
};

module.exports = { seed, SEED_PASSWORD, assertNotProduction };
