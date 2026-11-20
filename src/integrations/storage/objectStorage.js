// BE-34: armazenamento de objetos compatível com S3 (Cloudflare R2). Só o back-end conhece as
// credenciais; o navegador sobe direto para o R2 com URL pré-assinada de curta duração.
//   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_PUBLIC_BASE_URL
//   (R2_ENDPOINT opcional — padrão https://<account>.r2.cloudflarestorage.com)
const { S3Client, PutObjectCommand, HeadObjectCommand, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const createStorage = (env = process.env) => {
  const configured = Boolean(env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY && env.R2_BUCKET && (env.R2_ENDPOINT || env.R2_ACCOUNT_ID));
  if (!configured) return { configured: false };
  const bucket = env.R2_BUCKET;
  const client = new S3Client({
    region: 'auto',
    endpoint: env.R2_ENDPOINT || `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY },
    // MinIO/ambientes locais usam caminho (http://host/bucket/chave); o R2 aceita os dois.
    forcePathStyle: String(env.R2_FORCE_PATH_STYLE) === 'true',
  });
  const publicBase = String(env.R2_PUBLIC_BASE_URL || '').replace(/\/$/, '');

  return {
    configured: true,
    /** URL de PUT assinada: tipo e tamanho exatos fazem parte da assinatura. */
    presignPut: (key, { contentType, size, expiresIn = 300 }) =>
      getSignedUrl(client, new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType, ContentLength: size }), { expiresIn }),
    head: async (key) => {
      const out = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
      return { size: Number(out.ContentLength), contentType: out.ContentType };
    },
    /** Primeiros bytes do objeto (magic bytes). */
    readStart: async (key, length = 16) => {
      const out = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key, Range: `bytes=0-${length - 1}` }));
      return Buffer.from(await out.Body.transformToByteArray());
    },
    remove: (key) => client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key })),
    publicUrl: (key) => `${publicBase}/${key}`,
  };
};

let instance = null;
const getStorage = () => {
  if (!instance) instance = createStorage();
  return instance;
};
const setStorage = (storage) => {
  instance = storage;
};

module.exports = { createStorage, getStorage, setStorage };
