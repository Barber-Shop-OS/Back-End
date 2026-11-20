// BE-48: GET /api/app-config — configuração pública para o front e o app mobile (MOB-18):
// versão mínima do app, recursos ligados no ambiente e aviso de manutenção.
const express = require('express');
const { getStorage } = require('../../integrations/storage/objectStorage');
const { getClient } = require('../../integrations/abacatepay/client');

const router = express.Router();

const config = () => ({
  api_version: 'v1',
  min_app_version: process.env.MIN_APP_VERSION || '1.0.0',
  latest_app_version: process.env.LATEST_APP_VERSION || process.env.MIN_APP_VERSION || '1.0.0',
  maintenance: process.env.MAINTENANCE_MESSAGE ? { message: process.env.MAINTENANCE_MESSAGE } : null,
  features: {
    google_login: Boolean(process.env.GOOGLE_CLIENT_ID),
    google_client_id: process.env.GOOGLE_CLIENT_ID || null,
    billing: Boolean(getClient().configured),
    uploads: Boolean(getStorage().configured),
  },
  terms_version: process.env.TERMS_VERSION || '2026-11',
});

/**
 * @swagger
 * /app-config:
 *   get:
 *     summary: Configuração pública (versão mínima do app, recursos ligados, manutenção)
 *     tags: [App]
 *     security: []
 *     responses:
 *       200:
 *         description: Configuração
 *         content:
 *           application/json:
 *             example:
 *               api_version: v1
 *               min_app_version: '1.0.0'
 *               latest_app_version: '1.2.0'
 *               maintenance: null
 *               features: { google_login: true, google_client_id: 'xxx.apps.googleusercontent.com', billing: true, uploads: true }
 *               terms_version: '2026-11'
 */
router.get('/', (req, res) => {
  res.set('Cache-Control', 'public, max-age=60');
  res.json(config());
});

module.exports = router;
module.exports.config = config;
