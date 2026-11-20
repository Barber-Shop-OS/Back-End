// BE-23: /api/barbershop/:id/clients — clientes da barbearia (CRM) e cliente rápido de balcão.
const authMiddleware = require('../../middlewares/authMiddleware');
const roleMiddleware = require('../../middlewares/roleMiddleware');
const validate = require('../../middlewares/validate');
const { Joi, id, text, email, idParams, pagination } = require('../../shared/schemas');
const { handle } = require('../branchSchedule/branchScheduleController');
const { success, created } = require('../../utils/responseHandler');
const clientService = require('./clientService');

const clientParams = Joi.object({ id: id().required(), clientId: id().required() });
const fields = {
  name: text(120).min(2),
  phone: text(20),
  email: email().allow('', null),
  notes: text(1000).allow('', null),
};

const schemas = {
  list: validate({
    params: idParams,
    query: Joi.object({
      ...pagination,
      search: text(100).allow(''),
      sortBy: Joi.string().valid('name', 'last_visit', 'visits', 'total_spent', 'created_at'),
    }),
  }),
  byId: validate({ params: clientParams }),
  create: validate({
    params: idParams,
    body: Joi.object({ ...fields, name: fields.name.required(), phone: fields.phone.required() }),
  }),
  update: validate({ params: clientParams, body: Joi.object(fields).min(1) }),
};

const staff = [authMiddleware, roleMiddleware(['admin', 'owner', 'barbeiro'])];

/**
 * @swagger
 * /barbershop/{id}/clients:
 *   get:
 *     summary: Clientes da barbearia com visitas, última visita, total gasto e faltas
 *     description: Dono/admin ou barbeiro ativo da barbearia. Busca por nome, e-mail ou parte do telefone.
 *     tags: [Clients]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: integer } }
 *       - { in: query, name: search, schema: { type: string }, description: 'Nome, e-mail ou dígitos do telefone (mín. 3)' }
 *       - { in: query, name: sortBy, schema: { type: string, enum: [name, last_visit, visits, total_spent, created_at] } }
 *       - { in: query, name: page, schema: { type: integer } }
 *       - { in: query, name: pageSize, schema: { type: integer, maximum: 100 } }
 *     responses:
 *       200:
 *         description: "{ items: [{ id, name, phone, email, has_account, visits, no_shows, last_visit, total_spent }], page, pageSize, total, totalPages }"
 *       403: { description: Barbearia de outro tenant }
 *       404: { description: Barbearia não encontrada }
 *   post:
 *     summary: Cadastrar cliente (cliente rápido de balcão, sem conta)
 *     description: Se já existe conta com o mesmo e-mail/telefone, o cliente nasce vinculado. Duplicado → 409 CLIENT_ALREADY_EXISTS com details.client_id.
 *     tags: [Clients]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: integer } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, phone]
 *             properties:
 *               name: { type: string, example: João da Silva }
 *               phone: { type: string, example: '(11) 98888-7777' }
 *               email: { type: string, example: joao@email.com }
 *               notes: { type: string, example: Prefere máquina 2 }
 *     responses:
 *       201: { description: Cliente criado }
 *       409: { description: CLIENT_ALREADY_EXISTS }
 * /barbershop/{id}/clients/{clientId}:
 *   get:
 *     summary: Cliente com estatísticas e histórico (últimos 50 agendamentos com pagamento)
 *     tags: [Clients]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: integer } }
 *       - { in: path, name: clientId, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: Cliente }
 *       404: { description: Cliente não encontrado nesta barbearia }
 *   patch:
 *     summary: Atualizar nome, telefone, e-mail ou observações do cliente
 *     tags: [Clients]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: integer } }
 *       - { in: path, name: clientId, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: Cliente atualizado }
 */
const registerBarbershopRoutes = (router) => {
  router.get(
    '/:id/clients',
    ...staff,
    schemas.list,
    handle(async (req, res) => success(res, await clientService.list(req.params.id, req.query, req.user)))
  );
  router.post(
    '/:id/clients',
    ...staff,
    schemas.create,
    handle(async (req, res) => created(res, { client: await clientService.create(req.params.id, req.body, req.user) }))
  );
  router.get(
    '/:id/clients/:clientId',
    ...staff,
    schemas.byId,
    handle(async (req, res) => success(res, await clientService.getById(req.params.id, req.params.clientId, req.user)))
  );
  router.patch(
    '/:id/clients/:clientId',
    ...staff,
    schemas.update,
    handle(async (req, res) =>
      success(res, { client: await clientService.update(req.params.id, req.params.clientId, req.body, req.user) })
    )
  );
};

module.exports = { registerBarbershopRoutes };
