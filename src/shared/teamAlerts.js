// SEC-27: avisa o dono por e-mail quando alguém ganha acesso à barbearia (barbeiro, gerente, recepção).
// Detecta inclusões indevidas (ex.: sessão de gerente comprometida). Falha no envio nunca bloqueia a ação.
const logger = require('../utils/logger');

const ROLE_LABEL = { barber: 'barbeiro(a)', manager: 'gerente', receptionist: 'atendente (recepção)' };

const appUrl = () => (process.env.APP_URL || 'http://localhost:5173').replace(/\/$/, '');

/**
 * @param {object} params
 * @param {number} params.barbershopId
 * @param {{ name?: string, email?: string }} params.person  quem entrou
 * @param {'barber'|'manager'|'receptionist'} params.role
 * @param {number} [params.actorId]  quem adicionou (o dono também recebe — fica o registro)
 */
const notifyOwnerOfNewMember = async ({ barbershopId, person, role, actorId }) => {
  try {
    const { Barbershop, User } = require('../models');
    const templates = require('./emailTemplates');
    const mailer = require('./mailer');
    const shop = await Barbershop.findByPk(barbershopId, { include: [{ model: User, as: 'owner', attributes: ['id', 'name', 'email'] }] });
    if (!shop || !shop.owner || !shop.owner.email) return;
    const actor = actorId && String(actorId) !== String(shop.owner.id) ? await User.findByPk(actorId, { attributes: ['name'] }) : null;
    const who = person.name ? `${person.name} (${person.email})` : person.email;
    const by = actor ? ` por ${actor.name}` : '';
    const mail = templates.render('account-notice', {
      app_url: appUrl(),
      first_name: String(shop.owner.name || '').split(' ')[0],
      title: 'Nova pessoa na equipe',
      message: `${who} foi adicionado(a) como ${ROLE_LABEL[role] || role} em ${shop.name}${by}. Se você não reconhece esta inclusão, remova o acesso no painel em Equipe ou Barbeiros e troque sua senha.`,
    });
    await mailer.send({ to: shop.owner.email, ...mail });
  } catch (error) {
    logger.warn('[team-alerts] falha ao avisar o dono', { barbershop_id: barbershopId, message: error.message });
  }
};

module.exports = { notifyOwnerOfNewMember };
