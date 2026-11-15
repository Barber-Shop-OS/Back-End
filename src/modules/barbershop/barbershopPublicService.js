// BE-18 / SEC-06: perfil público da barbearia por slug. DTO montado campo a campo (allowlist):
// nunca inclui owner, e-mails ou ids de usuário.
const { Op } = require('sequelize');
const { Barbershop, Branch, Address, Service, Barber, User, BranchOpeningHour, BranchClosure } = require('../../models');
const { isOpenAt } = require('../branchSchedule/branchScheduleService');
const { toPublicBarber } = require('../barber/barberService');
const time = require('../../shared/time');
const { NotFoundError } = require('../../utils/errorHandler');

// Gancho para BE-35 (assinatura): barbearia sem assinatura ativa não aparece publicamente.
let visibilityCheck = async () => true;
const setVisibilityCheck = (fn) => {
  visibilityCheck = fn;
};

const publicAddress = (address) =>
  address && {
    street: address.street,
    number: address.number,
    complement: address.complement,
    neighborhood: address.neighborhood,
    city: address.city,
    state: address.state,
    cep: address.cep,
    latitude: address.latitude,
    longitude: address.longitude,
  };

const publicBranch = (branch, now) => {
  const openingHours = (branch.opening_hours || []).map((row) => ({
    weekday: row.weekday,
    opens_at: row.opens_at,
    closes_at: row.closes_at,
  }));
  const closures = (branch.closures || []).map((row) => ({
    date: row.date,
    all_day: Boolean(row.all_day),
    start_time: row.start_time,
    end_time: row.end_time,
  }));
  return {
    id: branch.id,
    name: branch.name,
    timezone: branch.timezone,
    phone: branch.phone,
    whatsapp: branch.whatsapp,
    address: publicAddress(branch.Address),
    opening_hours: openingHours,
    open_now: isOpenAt({ openingHours, closures, timezone: branch.timezone }, now),
  };
};

const getBySlug = async (slug, now = new Date()) => {
  const barbershop = await Barbershop.findOne({ where: { slug: String(slug).toLowerCase(), status: 'active' } });
  if (!barbershop || !(await visibilityCheck(barbershop))) {
    throw new NotFoundError('Barbearia não encontrada');
  }

  // Fechamentos de hoje (em qualquer fuso do Brasil, ontem/amanhã UTC cobrem o dia local).
  const today = time.todayIn(time.DEFAULT_TIMEZONE, now);
  const [branches, services, barbers] = await Promise.all([
    Branch.findAll({
      where: { barbershop_id: barbershop.id, active: true },
      include: [
        { model: Address },
        { model: BranchOpeningHour, as: 'opening_hours' },
        {
          model: BranchClosure,
          as: 'closures',
          required: false,
          where: { date: { [Op.between]: [time.addDays(today, -1), time.addDays(today, 1)] } },
        },
      ],
      order: [['id', 'ASC']],
    }),
    Service.findAll({
      where: { barbershop_id: barbershop.id, active: true },
      attributes: ['id', 'name', 'description', 'price', 'duration'],
      order: [['name', 'ASC']],
    }),
    Barber.findAll({
      where: { active: true },
      include: [
        { model: Branch, where: { barbershop_id: barbershop.id, active: true }, attributes: [] },
        { model: User, attributes: ['id', 'name'] },
        { model: Service, attributes: ['id', 'name'], through: { attributes: [] }, where: { active: true }, required: false },
      ],
      order: [['id', 'ASC']],
    }),
  ]);

  return {
    id: barbershop.id,
    slug: barbershop.slug,
    name: barbershop.name,
    description: barbershop.description,
    phone: barbershop.phone,
    whatsapp: barbershop.whatsapp,
    instagram: barbershop.instagram,
    logo_url: barbershop.logo_url,
    cover_url: barbershop.cover_url,
    branches: branches.map((branch) => publicBranch(branch, now)),
    services: services.map((service) => ({
      id: service.id,
      name: service.name,
      description: service.description,
      price: service.price,
      duration: service.duration,
    })),
    barbers: barbers.map(toPublicBarber),
  };
};

module.exports = { getBySlug, setVisibilityCheck, publicAddress };
