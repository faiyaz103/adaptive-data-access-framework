import { ValueTransformer } from 'typeorm';
import { encryptData } from '../utils/encryption.util';

export class EncryptionTransformer implements ValueTransformer {
  /**
   * Called when saving to the database (Data at Rest encryption)
   */
  to(value: string | null | undefined): string | null {
    if (!value) return null;
    try {
      return encryptData(value);
    } catch (error) {
      throw new Error(`Encryption error: ${(error as Error).message}`);
    }
  }

  /**
   * Called when loading from the database.
   * THESIS DESIGN CHOICE (Late-Binding Cryptography): decryption is DEFERRED
   * to the Adaptive ML Gatekeeper (AdaptiveAleService). We return the raw
   * ciphertext so no plaintext materializes in RAM before the risk evaluation.
   */
  from(value: string | null | undefined): string | null {
    return value || null; // ciphertext string, e.g. "v1:iv:authTag:cipher"
  }
}