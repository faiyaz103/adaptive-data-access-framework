import * as crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // Standard for GCM
const AUTH_TAG_LENGTH = 16;
const ENCRYPTION_VERSION = 'v1';

// Validate key on module load
const hexKey = process.env.DB_ENCRYPTION_KEY;
if (!hexKey || hexKey.length !== 64) {
  throw new Error('EXT_AUTH_ERR: DB_ENCRYPTION_KEY must be a 64-character hex string (32 bytes).');
}

const ENCRYPTION_KEY = Buffer.from(hexKey, 'hex');

export function encryptData(text: string | null | undefined): string | null {
  if (!text) return null;

  try {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, ENCRYPTION_KEY, iv);

    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag();

    // Format: version:iv:authTag:encryptedData
    return `${ENCRYPTION_VERSION}:${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
  } catch (error) {
    throw new Error(`Encryption failed: ${(error as Error).message}`);
  }
}

export function decryptData(encryptedText: string | null | undefined): string | null {
  if (!encryptedText) return null;

  try {
    const parts = encryptedText.split(':');
    
    if (parts.length !== 4) {
      throw new Error('Invalid encrypted data format: expected 4 components separated by colons');
    }

    const [version, ivHex, authTagHex, encryptedData] = parts as [string, string, string, string];

    // Validate version
    if (version !== ENCRYPTION_VERSION) {
      throw new Error(`Unsupported encryption version: ${version}`);
    }

    // Validate component lengths
    if (ivHex.length !== IV_LENGTH * 2) {
      throw new Error(`Invalid IV length: expected ${IV_LENGTH * 2} hex chars, got ${ivHex.length}`);
    }
    if (authTagHex.length !== AUTH_TAG_LENGTH * 2) {
      throw new Error(`Invalid auth tag length: expected ${AUTH_TAG_LENGTH * 2} hex chars, got ${authTagHex.length}`);
    }
    if (!encryptedData) {
      throw new Error('Empty encrypted data');
    }

    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');

    const decipher = crypto.createDecipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch (error) {
    // Re-throw validation errors as-is, wrap crypto/other errors
    if (error instanceof Error && (error.message.startsWith('Invalid') || error.message.startsWith('Unsupported') || error.message.startsWith('Empty'))) {
      throw error;
    }
    throw new Error(`Decryption failed: ${(error as Error).message}`);
  }
}