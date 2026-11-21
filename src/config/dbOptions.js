// Opções de conexão do PostgreSQL compartilhadas pela API e pelo CLI de migrations.
// - DATABASE_URL (Supabase/Railway) tem prioridade; senão DB_HOST/DB_PORT/DB_USER/DB_PASS/DB_NAME.
// - DB_SSL=true liga TLS validando o certificado (DB_SSL_CA = PEM ou caminho do arquivo da CA do provedor).
// - Supabase: use a URL do "Session pooler" (porta 5432) ou a conexão direta; o "Transaction pooler"
//   (porta 6543) não suporta locks de sessão usados pelas migrations.
const fs = require('fs');

const sslOptions = (env = process.env) => {
  const ca = env.DB_SSL_CA;
  const options = { require: true, rejectUnauthorized: env.DB_SSL_REJECT_UNAUTHORIZED !== 'false' };
  // PEM em variável de ambiente costuma vir com "\n" literais no lugar das quebras de linha.
  if (ca) options.ca = ca.includes('BEGIN CERTIFICATE') ? ca.replace(/\n/g, '\n') : fs.readFileSync(ca, 'utf8');
  return options;
};

/** { url?, options } para `new Sequelize(url, options)` ou `new Sequelize(name, user, pass, options)`. */
const postgresConfig = (env = process.env) => {
  const options = {
    dialect: 'postgres',
    logging: false,
    pool: { max: Number(env.DB_POOL_MAX || 10), min: 0, idle: 10000, acquire: 30000 },
    dialectOptions: env.DB_SSL === 'true' ? { ssl: sslOptions(env) } : {},
  };
  if (env.DATABASE_URL) return { url: env.DATABASE_URL, options };
  return {
    options: { ...options, host: env.DB_HOST || 'localhost', port: Number(env.DB_PORT || 5432) },
    database: env.DB_NAME,
    username: env.DB_USER,
    password: env.DB_PASS,
  };
};

module.exports = { postgresConfig, sslOptions };
