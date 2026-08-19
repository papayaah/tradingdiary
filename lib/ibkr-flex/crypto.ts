import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const VERSION = 'v1';
const IV_BYTES = 12;

function encryptionKey(secretOverride?: string): Buffer {
  const secret = secretOverride ?? process.env.IBKR_FLEX_ENCRYPTION_KEY;
  if (!secret || secret.length < 32) {
    throw new Error('IBKR_FLEX_ENCRYPTION_KEY must be configured with at least 32 characters.');
  }
  return createHash('sha256').update(secret, 'utf8').digest();
}

export function encryptFlexToken(token: string, secretOverride?: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(secretOverride), iv);
  const encrypted = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString('base64url'), tag.toString('base64url'), encrypted.toString('base64url')].join('.');
}

export function decryptFlexToken(payload: string, secretOverride?: string): string {
  const [version, ivRaw, tagRaw, encryptedRaw] = payload.split('.');
  if (version !== VERSION || !ivRaw || !tagRaw || !encryptedRaw) {
    throw new Error('Stored IBKR Flex token has an unsupported format.');
  }
  const decipher = createDecipheriv(
    'aes-256-gcm',
    encryptionKey(secretOverride),
    Buffer.from(ivRaw, 'base64url'),
  );
  decipher.setAuthTag(Buffer.from(tagRaw, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedRaw, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}
