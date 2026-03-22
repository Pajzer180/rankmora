import 'server-only';

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'crypto';

const ALGORITHM = 'aes-256-gcm';

type SecretEnvName = 'WORDPRESS_CREDENTIALS_SECRET' | 'GSC_TOKENS_SECRET';

function getSecretKey(secretName: SecretEnvName): Buffer {
  const secret = process.env[secretName]?.trim();
  if (!secret) {
    console.error('[SecretCrypto] Brakuje zmiennej srodowiskowej: %s. Dodaj ja do .env.local.', secretName);
    throw new Error(`Brakuje zmiennej srodowiskowej ${secretName}. Dodaj ja do .env.local (np. losowy ciag 32+ znakow).`);
  }

  return createHash('sha256').update(secret).digest();
}

function encryptWithSecret(plainText: string, secretName: SecretEnvName): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, getSecretKey(secretName), iv);
  const encrypted = Buffer.concat([
    cipher.update(plainText, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return [
    'v1',
    iv.toString('base64url'),
    tag.toString('base64url'),
    encrypted.toString('base64url'),
  ].join('.');
}

function decryptWithSecret(payload: string, secretName: SecretEnvName): string {
  const [version, ivPart, tagPart, encryptedPart] = payload.split('.');
  if (version !== 'v1' || !ivPart || !tagPart || !encryptedPart) {
    throw new Error('Invalid encrypted secret payload');
  }

  const decipher = createDecipheriv(
    ALGORITHM,
    getSecretKey(secretName),
    Buffer.from(ivPart, 'base64url'),
  );
  decipher.setAuthTag(Buffer.from(tagPart, 'base64url'));

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedPart, 'base64url')),
    decipher.final(),
  ]);

  return decrypted.toString('utf8');
}

export function encryptSecret(plainText: string): string {
  return encryptWithSecret(plainText, 'WORDPRESS_CREDENTIALS_SECRET');
}

export function decryptSecret(payload: string): string {
  return decryptWithSecret(payload, 'WORDPRESS_CREDENTIALS_SECRET');
}

export function encryptGscSecret(plainText: string): string {
  return encryptWithSecret(plainText, 'GSC_TOKENS_SECRET');
}

export function decryptGscSecret(payload: string): string {
  try {
    return decryptWithSecret(payload, 'GSC_TOKENS_SECRET');
  } catch (error) {
    const hasLegacyWordPressSecret = Boolean(process.env.WORDPRESS_CREDENTIALS_SECRET?.trim());
    if (!hasLegacyWordPressSecret) {
      throw error;
    }

    return decryptWithSecret(payload, 'WORDPRESS_CREDENTIALS_SECRET');
  }
}