import { ValueTransformer } from 'typeorm';
import { encryptData, decryptData } from '../utils/encryption.util';

export class EncryptionTransformer implements ValueTransformer {
  /**
   * Called when saving to the database
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
   * Called when loading from the database
   */
  from(value: string | null | undefined): string | null {
    if (!value) return null;
    try {
      return decryptData(value);
    } catch (error) {
      throw new Error(`Decryption error for bank details: ${(error as Error).message}`);
    }
  }
}