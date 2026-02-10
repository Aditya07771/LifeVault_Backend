import crypto from 'crypto';

class EncryptionService {
  constructor() {
    this.algorithm = 'aes-256-gcm';
    this.keyLength = 32;
    this.ivLength = 16;
    this.tagLength = 16;
    this.saltLength = 32;
  }

  /**
   * Generate a random encryption key
   */
  generateKey() {
    return crypto.randomBytes(this.keyLength).toString('hex');
  }

  /**
   * Derive a key from a password using PBKDF2
   */
  deriveKey(password, salt) {
    const saltBuffer = salt ? 
      Buffer.from(salt, 'hex') : 
      crypto.randomBytes(this.saltLength);
    
    const key = crypto.pbkdf2Sync(
      password,
      saltBuffer,
      100000,
      this.keyLength,
      'sha512'
    );

    return {
      key: key.toString('hex'),
      salt: saltBuffer.toString('hex')
    };
  }

  /**
   * Encrypt data with AES-256-GCM
   */
  encrypt(plaintext, keyHex) {
    const key = Buffer.from(keyHex, 'hex');
    const iv = crypto.randomBytes(this.ivLength);
    
    const cipher = crypto.createCipheriv(this.algorithm, key, iv);
    
    let encrypted = cipher.update(plaintext, 'utf8');
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    
    const authTag = cipher.getAuthTag();

    // Combine IV + authTag + encrypted data
    const combined = Buffer.concat([iv, authTag, encrypted]);
    
    return combined.toString('base64');
  }

  /**
   * Decrypt data encrypted with AES-256-GCM
   */
  decrypt(encryptedBase64, keyHex) {
    try {
      const key = Buffer.from(keyHex, 'hex');
      const combined = Buffer.from(encryptedBase64, 'base64');

      // Extract IV, authTag, and encrypted data
      const iv = combined.subarray(0, this.ivLength);
      const authTag = combined.subarray(this.ivLength, this.ivLength + this.tagLength);
      const encrypted = combined.subarray(this.ivLength + this.tagLength);

      const decipher = crypto.createDecipheriv(this.algorithm, key, iv);
      decipher.setAuthTag(authTag);

      let decrypted = decipher.update(encrypted);
      decrypted = Buffer.concat([decrypted, decipher.final()]);

      return decrypted.toString('utf8');
    } catch (error) {
      throw new Error('Decryption failed: Invalid key or corrupted data');
    }
  }

  /**
   * Encrypt with password (includes salt in output)
   */
  encryptWithPassword(plaintext, password) {
    const { key, salt } = this.deriveKey(password);
    const encrypted = this.encrypt(plaintext, key);
    
    // Prepend salt to encrypted data
    return salt + ':' + encrypted;
  }

  /**
   * Decrypt with password
   */
  decryptWithPassword(encryptedData, password) {
    const [salt, encrypted] = encryptedData.split(':');
    const { key } = this.deriveKey(password, salt);
    return this.decrypt(encrypted, key);
  }

  /**
   * Hash data (for QR codes, passwords, etc.)
   */
  hash(data) {
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  /**
   * Generate secure random token
   */
  generateToken(length = 32) {
    return crypto.randomBytes(length).toString('hex');
  }

  /**
   * Encrypt sensitive fields in an object
   */
  encryptObject(obj, fields, key) {
    const encrypted = { ...obj };
    
    for (const field of fields) {
      if (encrypted[field]) {
        encrypted[field] = this.encrypt(
          JSON.stringify(encrypted[field]),
          key
        );
      }
    }
    
    return encrypted;
  }

  /**
   * Decrypt sensitive fields in an object
   */
  decryptObject(obj, fields, key) {
    const decrypted = { ...obj };
    
    for (const field of fields) {
      if (decrypted[field]) {
        try {
          decrypted[field] = JSON.parse(
            this.decrypt(decrypted[field], key)
          );
        } catch {
          // Field might not be encrypted
        }
      }
    }
    
    return decrypted;
  }
}

export default new EncryptionService();