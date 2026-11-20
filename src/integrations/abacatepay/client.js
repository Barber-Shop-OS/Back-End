// BE-32: cliente HTTP da AbacatePay (API v2). Usa o fetch nativo do Node (sem dependência nova).
// - Base https://api.abacatepay.com/v2, header Authorization: Bearer <ABACATEPAY_API_KEY>.
// - Ambiente (teste/produção) é definido pela chave (prefixo abc_dev_ = modo teste).
// - Envelope de resposta: { data, success, error }. Valores em centavos.
// - Timeout de 10 s; nova tentativa só em GET ou 5xx/429/rede (POST com erro 4xx nunca repete).
// - Logs sem dados sensíveis (só método, rota, status e duração).
const logger = require('../../utils/logger');

const DEFAULT_BASE_URL = 'https://api.abacatepay.com/v2';
const TIMEOUT_MS = 10000;
const MAX_RETRIES = 2;

class AbacatePayError extends Error {
  constructor(message, { status, path, retryable } = {}) {
    super(message);
    this.name = 'AbacatePayError';
    this.status = status;
    this.path = path;
    this.retryable = Boolean(retryable);
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const createClient = ({
  apiKey = process.env.ABACATEPAY_API_KEY,
  baseUrl = process.env.ABACATEPAY_BASE_URL || DEFAULT_BASE_URL,
  fetchImpl = (...args) => fetch(...args),
  timeoutMs = TIMEOUT_MS,
  retryDelayMs = 300,
} = {}) => {
  const configured = Boolean(apiKey);

  const request = async (method, path, { query, body } = {}) => {
    if (!configured) throw new AbacatePayError('AbacatePay não configurada (ABACATEPAY_API_KEY)', { path });
    const url = new URL(baseUrl.replace(/\/$/, '') + path);
    Object.entries(query || {}).forEach(([key, value]) => {
      if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
    });

    for (let attempt = 0; ; attempt += 1) {
      const started = Date.now();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      let status;
      try {
        const res = await fetchImpl(url.toString(), {
          method,
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', Accept: 'application/json' },
          body: body ? JSON.stringify(body) : undefined,
          signal: controller.signal,
        });
        status = res.status;
        const text = await res.text();
        let json = null;
        try {
          json = text ? JSON.parse(text) : null;
        } catch {
          json = null;
        }
        logger.info('[abacatepay] requisição', { method, path, status, ms: Date.now() - started });
        if (res.ok && json && json.success !== false && (json.error === null || json.error === undefined)) return json.data;
        const message = (json && json.error) || `HTTP ${status}`;
        const retryable = status >= 500 || status === 429;
        throw new AbacatePayError(String(message), { status, path, retryable });
      } catch (error) {
        const isNetwork = !(error instanceof AbacatePayError);
        const retryable = isNetwork || error.retryable;
        const canRetry = attempt < MAX_RETRIES && retryable && (method === 'GET' || isNetwork || error.status >= 500 || error.status === 429);
        if (!canRetry) {
          if (isNetwork) {
            logger.warn('[abacatepay] falha de rede', { method, path, message: error.name === 'AbortError' ? 'timeout' : error.message });
            throw new AbacatePayError(error.name === 'AbortError' ? 'Timeout na AbacatePay' : 'Falha de rede na AbacatePay', {
              path,
              retryable: true,
            });
          }
          throw error;
        }
        await sleep(retryDelayMs * (attempt + 1));
      } finally {
        clearTimeout(timer);
      }
    }
  };

  return {
    configured,
    request,
    createCustomer: (customer) => request('POST', '/customers/create', { body: customer }),
    createProduct: (product) => request('POST', '/products/create', { body: product }),
    listProducts: (query) => request('GET', '/products/list', { query }),
    createSubscriptionCheckout: (checkout) => request('POST', '/subscriptions/create', { body: checkout }),
    getSubscription: (query) => request('GET', '/subscriptions/get', { query }),
    cancelSubscription: (id) => request('POST', '/subscriptions/cancel', { body: { id } }),
    changePlan: (id, productId) => request('POST', '/subscriptions/change-plan', { body: { id, items: [{ productId, quantity: 1 }] } }),
    createCustomerPortal: (customerId, checkoutId) => request('POST', '/customer-portal/create', { body: { customerId, checkoutId } }),
  };
};

// Instância usada pela aplicação; os testes trocam por um fetch falso com setClient().
let instance = null;
const getClient = () => {
  if (!instance) instance = createClient();
  return instance;
};
const setClient = (client) => {
  instance = client;
};

module.exports = { createClient, getClient, setClient, AbacatePayError, DEFAULT_BASE_URL };
