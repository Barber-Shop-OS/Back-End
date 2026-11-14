// Registro central das rotas. `mounts` também é usado pelo teste de matriz de autorização (SEC-23),
// que falha se uma rota nova não declarar quem pode acessá-la.
const express = require('express');

const mounts = [
  ['/api/auth', require('../modules/auth/authRoutes')],
  ['/api/me', require('../modules/me/meRoutes')],
  ['/api/user', require('../modules/user/userRoutes')],
  ['/api/barber', require('../modules/barber/barberRoutes')],
  ['/api/services', require('../modules/service/serviceRoutes')],
  ['/api/appointment', require('../modules/appointment/appointmentRoutes')],
  ['/api/barbershop', require('../modules/barbershop/barbershopRoutes')],
  ['/api/branch', require('../modules/branch/branchRoutes')],
  ['/api/address', require('../modules/address/addressRoutes')],
  ['/api/payment', require('../modules/payment/paymentRoutes')],
  ['/api/admin', require('../modules/admin/adminRoutes')],
  ['/api/invitations', require('../modules/invitation/invitationRoutes')],
  ['/api/plans', require('../modules/subscription/subscriptionRoutes').plansRouter],
];

const router = express.Router();
mounts.forEach(([prefix, moduleRouter]) => router.use(prefix, moduleRouter));

/** Lista "MÉTODO /caminho" de todas as rotas registradas. */
const listRoutes = () =>
  mounts.flatMap(([prefix, moduleRouter]) =>
    moduleRouter.stack
      .filter((layer) => layer.route)
      .flatMap((layer) =>
        Object.keys(layer.route.methods).map((method) => `${method.toUpperCase()} ${prefix}${layer.route.path === '/' ? '' : layer.route.path}`)
      )
  );

module.exports = router;
module.exports.mounts = mounts;
module.exports.listRoutes = listRoutes;
