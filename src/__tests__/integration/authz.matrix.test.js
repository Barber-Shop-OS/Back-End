// BE-09 / SEC-23: matriz de autorização declarativa.
// TODA rota registrada precisa estar nesta tabela — rota nova sem declaração quebra o teste.
//   'public'          → acessível sem login
//   'auth'            → qualquer usuário logado (regras finas de tenant ficam no service e em
//                        tenant-isolation.test.js / appointment-authz.test.js)
//   ['admin', ...]    → somente esses papéis; os demais recebem 403
const { app, request, resetDatabase, createUser, loginAs, bearer, sequelize } = require('../helpers/factories');
const { listRoutes } = require('../../routes/indexRoutes');

const MATRIX = {
  'POST /api/auth/register': 'public',
  'POST /api/auth/register-owner': 'public',
  'POST /api/auth/login': 'public',
  'POST /api/auth/forgot-password': 'public',
  'POST /api/auth/reset-password': 'public',
  'POST /api/auth/verify-email': 'public',
  'POST /api/auth/resend-verification': 'auth',
  'GET /api/auth/me': 'auth',

  'GET /api/me': 'auth',
  'PATCH /api/me': 'auth',
  'GET /api/me/barbershops': 'auth',
  'GET /api/me/appointments': 'auth',
  'GET /api/user': ['admin'],
  'GET /api/user/:id': 'auth',
  'PUT /api/user/:id': 'auth',
  'PATCH /api/user/:id': 'auth',
  'DELETE /api/user/:id': ['admin'],

  'GET /api/barber': 'public',
  'GET /api/barber/:id': 'public',
  'POST /api/barber': ['admin', 'owner'],
  'PUT /api/barber/:id': ['admin', 'owner'],
  'DELETE /api/barber/:id': ['admin', 'owner'],
  'PUT /api/barber/:id/services': ['admin', 'owner'],
  'GET /api/barber/:id/working-hours': 'public',
  'PUT /api/barber/:id/working-hours': ['admin', 'owner'],
  'GET /api/barber/:id/time-off': ['admin', 'owner', 'barbeiro'],
  'POST /api/barber/:id/time-off': ['admin', 'owner', 'barbeiro'],
  'DELETE /api/barber/:id/time-off/:timeOffId': ['admin', 'owner', 'barbeiro'],

  'GET /api/services': 'public',
  'GET /api/services/:id': 'public',
  'POST /api/services': ['admin', 'owner'],
  'PUT /api/services/:id': ['admin', 'owner'],
  'DELETE /api/services/:id': ['admin', 'owner'],

  'GET /api/appointment': 'auth',
  'GET /api/appointment/:id': 'auth',
  'POST /api/appointment': 'auth',
  'PUT /api/appointment/:id': 'auth',
  'POST /api/appointment/:id/cancel': 'auth',
  'POST /api/appointment/:id/reschedule': 'auth',
  'POST /api/appointment/:id/complete': 'auth',
  'POST /api/appointment/:id/no-show': 'auth',
  'GET /api/appointment/:id/events': 'auth',
  'DELETE /api/appointment/:id': ['admin'],

  'GET /api/availability': 'public',
  'GET /api/search/branches': 'public',

  'GET /api/barbershop': 'public',
  'GET /api/barbershop/slug/:slug': 'public',
  'GET /api/barbershop/:id/subscription': ['admin', 'owner'],
  'GET /api/barbershop/:id/clients': ['admin', 'owner', 'barbeiro'],
  'POST /api/barbershop/:id/clients': ['admin', 'owner', 'barbeiro'],
  'GET /api/barbershop/:id/clients/:clientId': ['admin', 'owner', 'barbeiro'],
  'PATCH /api/barbershop/:id/clients/:clientId': ['admin', 'owner', 'barbeiro'],
  'GET /api/barbershop/:id': 'public',
  'POST /api/barbershop': ['admin', 'owner'],
  'PUT /api/barbershop/:id': ['admin', 'owner'],
  'DELETE /api/barbershop/:id': ['admin'],

  'GET /api/branch': 'public',
  'GET /api/branch/:id': 'public',
  'POST /api/branch': ['admin', 'owner'],
  'PUT /api/branch/:id': ['admin', 'owner'],
  'DELETE /api/branch/:id': ['admin', 'owner'],
  'POST /api/branch/:id/barbers': ['admin', 'owner'],
  'GET /api/branch/:id/invitations': ['admin', 'owner'],
  'POST /api/branch/:id/invitations': ['admin', 'owner'],
  'POST /api/branch/:id/invitations/:invitationId/resend': ['admin', 'owner'],
  'DELETE /api/branch/:id/invitations/:invitationId': ['admin', 'owner'],
  'GET /api/invitations/:token': 'public',
  'POST /api/invitations/:token/accept': 'public',
  'GET /api/branch/:id/opening-hours': 'public',
  'PUT /api/branch/:id/opening-hours': ['admin', 'owner'],
  'GET /api/branch/:id/closures': 'public',
  'POST /api/branch/:id/closures': ['admin', 'owner'],
  'PUT /api/branch/:id/closures/:closureId': ['admin', 'owner'],
  'DELETE /api/branch/:id/closures/:closureId': ['admin', 'owner'],

  'POST /api/address': ['admin', 'owner'],
  'GET /api/address/:id': 'auth',
  'PUT /api/address/:id': ['admin', 'owner'],

  'GET /api/payment': ['admin', 'owner', 'barbeiro'],
  'GET /api/dashboard/summary': ['admin', 'owner'],
  'GET /api/dashboard/barber': ['admin', 'owner', 'barbeiro'],
  'POST /api/payment': 'auth',
  'GET /api/payment/appointment/:appointment_id': 'auth',
  'GET /api/payment/:id': 'auth',
  'PUT /api/payment/:id/status': ['admin', 'owner', 'barbeiro'],

  'PATCH /api/admin/users/:id/role': ['admin'],
  'GET /api/plans': 'public',
  'POST /api/billing/checkout': ['admin', 'owner'],
  'POST /api/billing/change-plan': ['admin', 'owner'],
  'POST /api/billing/cancel': ['admin', 'owner'],
  'POST /api/billing/resume': ['admin', 'owner'],
  'POST /api/billing/portal': ['admin', 'owner'],
  // Sem login, autenticada pelo segredo do webhook (testes em billing/webhooks.test.js).
  'POST /api/webhooks/abacatepay': 'webhook',
};

const ROLES = ['cliente', 'barbeiro', 'owner', 'admin'];

const entries = Object.entries(MATRIX).map(([route, access]) => {
  const [method, path] = route.split(' ');
  return { route, method: method.toLowerCase(), url: path.replace(/:\w+/g, '1'), access };
});

const send = (method, url, token) => {
  const req = request(app)[method](url);
  if (token) req.set(bearer(token));
  return ['post', 'put', 'patch'].includes(method) ? req.send({}) : req;
};

describe('SEC-23 — matriz de autorização', () => {
  const tokens = {};

  beforeAll(async () => {
    await resetDatabase();
    for (const role of ROLES) {
      tokens[role] = await loginAs(await createUser({ role, email: `${role}@matrix.test` }));
    }
  });

  afterAll(() => sequelize.close());

  it('toda rota registrada está declarada na matriz (e vice-versa)', () => {
    const registered = listRoutes().sort();
    const declared = Object.keys(MATRIX).sort();
    expect(registered.filter((route) => !declared.includes(route))).toEqual([]);
    expect(declared.filter((route) => !registered.includes(route))).toEqual([]);
  });

  describe.each(entries.filter((entry) => !['public', 'webhook'].includes(entry.access)))('$route', ({ method, url, access }) => {
    it('anônimo → 401', async () => {
      const res = await send(method, url);
      expect(res.status).toBe(401);
    });

    if (Array.isArray(access)) {
      const denied = ROLES.filter((role) => !access.includes(role));
      if (denied.length) {
        it.each(denied)('papel %s → 403', async (role) => {
          const res = await send(method, url, tokens[role]);
          expect(res.status).toBe(403);
        });
      }
    }
  });

  describe.each(entries.filter((entry) => entry.access === 'public'))('$route (pública)', ({ method, url }) => {
    it('anônimo não recebe 401/403', async () => {
      const res = await send(method, url);
      expect([401, 403]).not.toContain(res.status);
    });
  });
});
