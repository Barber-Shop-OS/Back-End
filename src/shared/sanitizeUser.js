// Campos de usuário que nunca saem da API.
const PRIVATE_USER_FIELDS = ['password', 'token_version'];

const sanitizeUser = (user) => {
  if (!user) return null;
  const plain = user.toJSON ? user.toJSON() : { ...user };
  PRIVATE_USER_FIELDS.forEach((field) => delete plain[field]);
  return plain;
};

module.exports = { sanitizeUser, PRIVATE_USER_FIELDS };
