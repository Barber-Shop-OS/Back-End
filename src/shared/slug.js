// BE-18: slugs públicos de barbearia (/b/:slug). [a-z0-9-], 3–60, sem palavras reservadas.
const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,58})[a-z0-9]$/;

// Rotas do front e termos que não podem virar página de barbearia.
const RESERVED = new Set([
  'admin', 'api', 'app', 'login', 'logout', 'cadastro', 'register', 'signup', 'entrar', 'sair',
  'dashboard', 'painel', 'conta', 'me', 'perfil', 'config', 'configuracoes', 'ajuda', 'suporte',
  'planos', 'assinatura', 'billing', 'checkout', 'pagamento', 'busca', 'search', 'b', 'barbearia',
  'barbearias', 'termos', 'privacidade', 'blog', 'static', 'assets', 'www', 'mail', 'status', 'docs',
  'barberos', 'root', 'null', 'undefined',
]);

/** "Barbearia São João!" → "barbearia-sao-joao". Pode devolver string curta (validar depois). */
const slugify = (text) =>
  String(text || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '');

const isReserved = (slug) => RESERVED.has(slug);
const isValidSlug = (slug) => SLUG_RE.test(String(slug)) && !String(slug).includes('--') && !isReserved(slug);

/**
 * Gera um slug livre a partir do nome. `exists(slug)` diz se já está em uso.
 * Nome curto/reservado ganha sufixo; colisão ganha -2, -3, ...
 */
const generateUniqueSlug = async (name, exists) => {
  let base = slugify(name);
  if (base.length < 3 || isReserved(base)) base = `${base || 'barbearia'}-barbearia`.replace(/^-/, '');
  base = base.slice(0, 55).replace(/-+$/g, '');
  let candidate = base;
  for (let n = 2; await exists(candidate); n += 1) {
    candidate = `${base}-${n}`;
  }
  return candidate;
};

module.exports = { slugify, isValidSlug, isReserved, generateUniqueSlug, RESERVED };
