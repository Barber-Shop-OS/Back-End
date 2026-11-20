// BE-34 / SEC-22: upload de imagens (logo, capa, foto do barbeiro) com URL pré-assinada.
//   presign: valida tipo (jpeg/png/webp — nunca SVG), tamanho (≤ 2 MB) e tenant; a chave é gerada
//            aqui (tenants/<barbearia>/<tipo>/<uuid>.<ext>) — nunca vem do nome do arquivo.
//   confirm: HEAD (tamanho/tipo iguais aos pedidos) + magic bytes; só então grava a URL no registro.
//            Arquivo que não confere é apagado do bucket.
const crypto = require('crypto');
const { Upload, Barbershop, Barber } = require('../../models');
const { getStorage } = require('../../integrations/storage/objectStorage');
const { assertCanManageBarbershop, assertCanManageBarber } = require('../../shared/authz');
const audit = require('../audit/auditService');
const logger = require('../../utils/logger');
const { AppError, ValidationError, NotFoundError, ConflictError, CODES } = require('../../utils/errorHandler');

const MAX_BYTES = 2 * 1024 * 1024;
const PRESIGN_TTL_S = 300;
const TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const KINDS = ['logo', 'cover', 'barber_photo'];

const storage = () => {
  const instance = getStorage();
  if (!instance.configured) throw new AppError('Envio de imagens indisponível no momento', 503, CODES.UPLOADS_UNAVAILABLE);
  return instance;
};

/** Confere a assinatura binária do formato declarado. */
const matchesMagic = (bytes, contentType) => {
  if (!bytes || bytes.length < 12) return false;
  if (contentType === 'image/jpeg') return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (contentType === 'image/png') return bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (contentType === 'image/webp') return bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP';
  return false;
};

/** Barbearia dona do alvo + checagem de permissão (e de escrita — BE-35). */
const resolveTarget = async (kind, { barbershop_id: barbershopId, barber_id: barberId }, user) => {
  if (kind === 'barber_photo') {
    if (!barberId) throw new ValidationError("Campo 'barber_id' é obrigatório para foto de barbeiro");
    const barber = await assertCanManageBarber(user, barberId);
    return { barbershopId: barber.Branch.barbershop_id, targetId: barber.id };
  }
  if (!barbershopId) throw new ValidationError("Campo 'barbershop_id' é obrigatório");
  const shop = await assertCanManageBarbershop(user, barbershopId);
  return { barbershopId: shop.id, targetId: shop.id };
};

/** POST /api/uploads/presign */
const presign = async ({ kind, content_type: contentType, size, barbershop_id, barber_id }, user, now = new Date()) => {
  if (!KINDS.includes(kind)) throw new ValidationError('Tipo de imagem inválido');
  if (!TYPES[contentType]) throw new ValidationError('Formato não permitido. Use JPEG, PNG ou WebP', undefined, CODES.INVALID_FILE);
  if (!Number.isInteger(size) || size <= 0 || size > MAX_BYTES) {
    throw new ValidationError('A imagem deve ter no máximo 2 MB', undefined, CODES.INVALID_FILE);
  }
  const { barbershopId, targetId } = await resolveTarget(kind, { barbershop_id, barber_id }, user);
  const store = storage();
  const key = `tenants/${barbershopId}/${kind}/${crypto.randomUUID()}.${TYPES[contentType]}`;
  const uploadUrl = await store.presignPut(key, { contentType, size, expiresIn: PRESIGN_TTL_S });
  const upload = await Upload.create({
    barbershop_id: barbershopId,
    kind,
    target_id: targetId,
    object_key: key,
    content_type: contentType,
    size,
    created_by: user.id,
    expires_at: new Date(now.getTime() + 24 * 3600 * 1000),
  });
  return {
    upload_id: upload.id,
    upload_url: uploadUrl,
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    expires_in: PRESIGN_TTL_S,
  };
};

/** POST /api/uploads/confirm {upload_id} */
const confirm = async ({ upload_id: uploadId }, user, now = new Date()) => {
  const upload = await Upload.findByPk(uploadId);
  if (!upload) throw new NotFoundError('Envio não encontrado');
  // Mesma permissão do presign (tenant e modo leitura).
  await resolveTarget(upload.kind, upload.kind === 'barber_photo' ? { barber_id: upload.target_id } : { barbershop_id: upload.barbershop_id }, user);
  if (upload.status !== 'pending') throw new ConflictError('Envio já processado');
  if (new Date(upload.expires_at) <= now) throw new AppError('Envio expirado; gere um novo', 410, CODES.TOKEN_INVALID_OR_EXPIRED);

  const store = storage();
  let head;
  try {
    head = await store.head(upload.object_key);
  } catch {
    throw new ValidationError('Arquivo não encontrado no armazenamento. Envie de novo.', undefined, CODES.INVALID_FILE);
  }
  const bytes = head.size > 0 ? await store.readStart(upload.object_key, 16) : Buffer.alloc(0);
  const ok = head.size === upload.size && head.contentType === upload.content_type && matchesMagic(bytes, upload.content_type);
  if (!ok) {
    await upload.update({ status: 'rejected' });
    try {
      await store.remove(upload.object_key);
    } catch (error) {
      logger.warn('[uploads] falha ao apagar arquivo rejeitado', { key: upload.object_key, message: error.message });
    }
    throw new ValidationError('Arquivo inválido: não é uma imagem JPEG, PNG ou WebP válida', undefined, CODES.INVALID_FILE);
  }

  const url = store.publicUrl(upload.object_key);
  if (upload.kind === 'barber_photo') {
    await Barber.update({ photo_url: url }, { where: { id: upload.target_id } });
  } else {
    await Barbershop.update({ [upload.kind === 'logo' ? 'logo_url' : 'cover_url']: url }, { where: { id: upload.target_id } });
  }
  await upload.update({ status: 'confirmed' });
  await audit.record({ action: `upload.${upload.kind}`, entity: upload.kind === 'barber_photo' ? 'barber' : 'barbershop', entityId: upload.target_id, barbershopId: upload.barbershop_id, after: { url } });
  return { url, kind: upload.kind, target_id: upload.target_id };
};

module.exports = { presign, confirm, matchesMagic, MAX_BYTES, TYPES, KINDS };
