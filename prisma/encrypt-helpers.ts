/**
 * Utilitário de criptografia para o seed.
 * Usa o mesmo algoritmo do frontend/backend: AES-256-GCM com chave derivada por PBKDF2.
 * Garante que os dados do seed fiquem no mesmo formato dos dados cadastrados normalmente.
 */
import * as crypto from 'crypto';

const SALT = Buffer.from('polys-salt-fixed', 'utf-8');

function deriveKey(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    crypto.pbkdf2(password, salt, 100000, 32, 'sha256', (err, derivedKey) => {
      if (err) reject(err);
      else resolve(derivedKey);
    });
  });
}

async function getEncryptionKey(userEmail: string): Promise<Buffer> {
  const masterKey =
    process.env.ENCRYPTION_MASTER_KEY || 'polys-master-key-change-in-production';
  const keyString = `${masterKey}-${userEmail}`;
  return deriveKey(keyString, SALT);
}

/**
 * Criptografa um texto usando AES-256-GCM (mesmo formato do frontend).
 */
export async function encrypt(text: string, userEmail: string): Promise<string> {
  if (!text || !userEmail) return text;

  const key = await getEncryptionKey(userEmail);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

  let encrypted = cipher.update(text, 'utf8');
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  const authTag = cipher.getAuthTag();

  const combined = Buffer.concat([iv, encrypted, authTag]);
  return combined.toString('base64');
}

/**
 * Criptografa os campos sensíveis de um usuário para o seed.
 */
export async function encryptUserFields(
  data: Record<string, string | null | undefined>,
  userEmail: string,
): Promise<Record<string, string | null | undefined>> {
  const sensitiveFields = [
    'phone',
    'cep',
    'street',
    'houseNumber',
    'neighborhood',
    'pixKeyRandom',
    'pixKeyPhone',
    'pixKeyEmail',
    'pixKeyCpf',
  ];

  const result = { ...data };
  for (const field of sensitiveFields) {
    const value = result[field];
    if (value != null && typeof value === 'string' && value.trim() !== '') {
      result[field] = await encrypt(value, userEmail);
    }
  }
  return result;
}
