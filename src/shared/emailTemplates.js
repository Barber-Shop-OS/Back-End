// BE-16: templates de e-mail em src/templates/email/<nome>.html (pt-BR).
// Formato do arquivo: primeira linha `<!-- subject: Assunto com {{variavel}} -->`, depois o corpo.
// Sintaxe mínima: {{chave}} (sempre com escape HTML), {{a.b}} e blocos {{#if chave}}…{{/if}}.
// Variável ausente lança erro — melhor falhar no teste do que mandar "{{nome}}" para o cliente.
// A versão texto é gerada do HTML (clientes de e-mail sem HTML e filtros antispam).
const fs = require('fs');
const path = require('path');

const DIR = path.resolve(__dirname, '../templates/email');
const cache = new Map();

const TEMPLATES = Object.freeze([
  'appointment-confirmation',
  'appointment-cancellation',
  'appointment-reschedule',
  'appointment-reminder',
  'welcome',
  'invitation',
  'password-reset',
  'email-verification',
  'billing',
  'account-notice',
  'email-change',
]);

const escapeHtml = (value) =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const lookup = (data, key) => key.split('.').reduce((acc, part) => (acc === null || acc === undefined ? undefined : acc[part]), data);

const load = (name) => {
  if (!cache.has(name)) {
    if (name !== '_layout' && !TEMPLATES.includes(name)) throw new Error(`Template de e-mail desconhecido: ${name}`);
    cache.set(name, fs.readFileSync(path.join(DIR, `${name}.html`), 'utf8'));
  }
  return cache.get(name);
};

const interpolate = (source, data, name) =>
  source
    .replace(/\{\{#if ([\w.]+)\}\}([\s\S]*?)\{\{\/if\}\}/g, (_, key, inner) => (lookup(data, key) ? inner : ''))
    .replace(/\{\{([\w.]+)\}\}/g, (_, key) => {
      const value = lookup(data, key);
      if (value === undefined || value === null) throw new Error(`Template ${name}: variável '${key}' ausente`);
      return escapeHtml(value);
    });

const decodeEntities = (text) =>
  text
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');

/** HTML → texto: links viram "texto: url", blocos viram quebras de linha. */
const htmlToText = (html) =>
  decodeEntities(
    html
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<a [^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (_, href, label) => {
        const text = label.replace(/<[^>]+>/g, '').trim();
        return text && text !== href ? `${text}: ${href}` : href;
      })
      .replace(/<(br|\/p|\/h\d|\/li|\/tr|\/div)[^>]*>/gi, '\n')
      .replace(/<li[^>]*>/gi, '- ')
      .replace(/<[^>]+>/g, '')
  )
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

/** Renderiza { subject, html, text }. */
const render = (name, data = {}) => {
  const source = load(name);
  const match = /^<!--\s*subject:\s*(.+?)\s*-->\s*\n?/.exec(source);
  if (!match) throw new Error(`Template ${name} sem linha de assunto`);
  const body = interpolate(source.slice(match[0].length), data, name);
  // Assunto é texto puro: interpola com escape e decodifica de volta.
  const subject = decodeEntities(interpolate(match[1], data, name));
  const html = interpolate(load('_layout'), { subject, app_url: data.app_url || '' }, '_layout').replace('<!--content-->', body);
  return { subject, html, text: htmlToText(body) };
};

module.exports = { render, htmlToText, escapeHtml, TEMPLATES };
