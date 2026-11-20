// BE-25: busca pública de filiais.
// Só filiais ativas de barbearias ativas com assinatura visível (ativa, em atraso ou trial vigente —
// mesma regra de entitlements.isPubliclyVisible). `q` procura no nome da barbearia, da filial ou de
// um serviço ativo; `city` na cidade do endereço; `service` restringe a quem oferece o serviço.
// Com lat/lng ordena por distância (Haversine em SQL); filiais sem coordenadas vão para o fim.
// LIKE sempre com curingas escapados [SEC-09].
const { Op, literal } = require('sequelize');
const { Branch, Barbershop, Address, Service, Subscription } = require('../../models');
const { likeMatch } = require('../../shared/query');
const entitlements = require('../../shared/entitlements');
const { publicAddress } = require('../barbershop/barbershopPublicService');

const MAX_PAGE_SIZE = 50;
const DEFAULT_PAGE_SIZE = 20;
const EARTH_RADIUS_KM = 6371;

const parsePage = (query) => {
  const page = Number.isInteger(Number(query.page)) && Number(query.page) > 0 ? Number(query.page) : 1;
  const requested = Number.isInteger(Number(query.pageSize)) && Number(query.pageSize) > 0 ? Number(query.pageSize) : DEFAULT_PAGE_SIZE;
  const pageSize = Math.min(requested, MAX_PAGE_SIZE);
  return { page, pageSize, offset: (page - 1) * pageSize };
};

/** Mesma regra de entitlements.isPubliclyVisible, em SQL. */
const visibleSubscriptionWhere = (now) => ({
  [Op.or]: [
    { status: 'active' },
    { status: 'trialing', trial_ends_at: { [Op.gt]: now } },
    // BE-35: em atraso só dentro da carência de 7 dias.
    {
      status: 'past_due',
      [Op.or]: [{ past_due_since: null }, { past_due_since: { [Op.gt]: new Date(now.getTime() - entitlements.GRACE_DAYS * 86400000) } }],
    },
  ],
});

/**
 * Distância em km (Haversine). lat/lng já validados como números pelo schema; ainda assim são
 * convertidos com Number() e formatados — nunca concatenamos texto do usuário no SQL.
 */
const distanceSql = (lat, lng) => {
  const la = Number(lat).toFixed(6);
  const lo = Number(lng).toFixed(6);
  return (
    `(${EARTH_RADIUS_KM} * 2 * ASIN(SQRT(` +
    `POWER(SIN(RADIANS(\`Address\`.\`latitude\` - ${la}) / 2), 2) + ` +
    `COS(RADIANS(${la})) * COS(RADIANS(\`Address\`.\`latitude\`)) * ` +
    `POWER(SIN(RADIANS(\`Address\`.\`longitude\` - ${lo}) / 2), 2))))`
  );
};

/** ids das barbearias com serviço ativo cujo nome contém o termo. */
const barbershopsOffering = async (term) => {
  const rows = await Service.findAll({
    where: { [Op.and]: [{ active: true }, likeMatch('Service.name', term)] },
    attributes: ['barbershop_id'],
    group: ['barbershop_id'],
  });
  return rows.map((row) => row.barbershop_id);
};

const toItem = (branch, withDistance) => {
  const distance = withDistance ? branch.get('distance_km') : undefined;
  return {
    id: branch.id,
    name: branch.name,
    timezone: branch.timezone,
    phone: branch.phone,
    whatsapp: branch.whatsapp,
    address: publicAddress(branch.Address),
    barbershop: {
      id: branch.Barbershop.id,
      slug: branch.Barbershop.slug,
      name: branch.Barbershop.name,
      logo_url: branch.Barbershop.logo_url,
    },
    distance_km: distance === null || distance === undefined ? null : Math.round(Number(distance) * 10) / 10,
  };
};

const searchBranches = async (query = {}, now = new Date()) => {
  const { page, pageSize, offset } = parsePage(query);
  const and = [{ active: true }];

  if (query.q) {
    const term = String(query.q).trim();
    const offering = await barbershopsOffering(term);
    and.push({
      [Op.or]: [
        likeMatch('Branch.name', term),
        likeMatch('Barbershop.name', term),
        ...(offering.length ? [{ barbershop_id: { [Op.in]: offering } }] : []),
      ],
    });
  }
  if (query.service) {
    const offering = await barbershopsOffering(String(query.service).trim());
    and.push({ barbershop_id: { [Op.in]: offering.length ? offering : [0] } });
  }
  if (query.city) {
    and.push(likeMatch('Address.city', String(query.city).trim()));
  }

  const withDistance = query.lat !== undefined && query.lng !== undefined;
  const distance = withDistance ? distanceSql(query.lat, query.lng) : null;

  const result = await Branch.findAndCountAll({
    where: { [Op.and]: and },
    attributes: [
      'id',
      'name',
      'timezone',
      'phone',
      'whatsapp',
      'barbershop_id',
      ...(withDistance ? [[literal(distance), 'distance_km']] : []),
    ],
    include: [
      {
        model: Barbershop,
        required: true,
        where: { status: 'active' },
        attributes: ['id', 'name', 'slug', 'logo_url'],
        include: [{ model: Subscription, required: true, attributes: [], where: visibleSubscriptionWhere(now) }],
      },
      { model: Address, required: false },
    ],
    order: withDistance
      ? [
          [literal(`(\`Address\`.\`latitude\` IS NULL OR \`Address\`.\`longitude\` IS NULL)`), 'ASC'],
          [literal(distance), 'ASC'],
          ['id', 'ASC'],
        ]
      : [
          [Barbershop, 'name', 'ASC'],
          ['name', 'ASC'],
          ['id', 'ASC'],
        ],
    limit: pageSize,
    offset,
    subQuery: false,
    distinct: true,
  });

  return {
    items: result.rows.map((branch) => toItem(branch, withDistance)),
    page,
    pageSize,
    total: result.count,
    totalPages: Math.ceil(result.count / pageSize),
  };
};

module.exports = { searchBranches, visibleSubscriptionWhere, distanceSql, MAX_PAGE_SIZE };
