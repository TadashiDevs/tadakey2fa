/**
 * TadaKey 2FA - Security Helper Module
 * Handles encryption, TOTP, and security question verification
 */

import * as CryptoJS from 'crypto-js';
import { authenticator } from 'otplib';
import * as QRCode from 'qrcode';

export class Security {
    private static readonly SYSTEM_KEY_LENGTH = 32;
    private static readonly SALT_LENGTH = 16;

    /**
     * Generate a random SystemKey (32 alphanumeric characters)
     * Called once on first run, stored in SecretStorage
     */
    static generateSystemKey(): string {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let result = '';
        const randomValues = new Uint32Array(this.SYSTEM_KEY_LENGTH);
        crypto.getRandomValues(randomValues);
        for (let i = 0; i < this.SYSTEM_KEY_LENGTH; i++) {
            result += chars[randomValues[i] % chars.length];
        }
        return result;
    }

    /**
     * Generate a random salt for security question hashing
     */
    static generateSalt(): string {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let result = '';
        const randomValues = new Uint32Array(this.SALT_LENGTH);
        crypto.getRandomValues(randomValues);
        for (let i = 0; i < this.SALT_LENGTH; i++) {
            result += chars[randomValues[i] % chars.length];
        }
        return result;
    }

    /**
     * Generate a unique ID for stored keys
     */
    static generateId(): string {
        return Date.now().toString(36) + Math.random().toString(36).substring(2, 9);
    }

    // ==================== ENCRYPTION ====================

    /**
     * Encrypt plaintext using AES-256
     */
    static encrypt(plainText: string, key: string): string {
        return CryptoJS.AES.encrypt(plainText, key).toString();
    }

    /**
     * Decrypt ciphertext using AES-256
     */
    static decrypt(cipherText: string, key: string): string {
        const bytes = CryptoJS.AES.decrypt(cipherText, key);
        return bytes.toString(CryptoJS.enc.Utf8);
    }

    // ==================== TOTP ====================

    /**
     * Generate a new TOTP secret (base32 encoded)
     */
    static generateTotpSecret(): string {
        return authenticator.generateSecret();
    }

    /**
     * Generate otpauth:// URI for QR code
     */
    static generateTotpUri(secret: string, accountName: string = 'Developer'): string {
        return authenticator.keyuri(accountName, 'TadaKey 2FA', secret);
    }

    /**
     * Validate a TOTP token against a secret
     * Returns true if the token is valid (within time window)
     */
    static validateTotpToken(token: string, secret: string): boolean {
        try {
            return authenticator.check(token, secret);
        } catch {
            return false;
        }
    }

    /**
     * Generate QR code as base64 data URL
     */
    static async generateQrCode(secret: string): Promise<string> {
        const uri = this.generateTotpUri(secret);
        return await QRCode.toDataURL(uri, {
            errorCorrectionLevel: 'M',
            type: 'image/png',
            width: 256,
            margin: 2,
            color: {
                dark: '#1a1a2e',
                light: '#ffffff'
            }
        });
    }

    // ==================== SECURITY QUESTION ====================

    /**
     * Normalize the security answer (lowercase, trim whitespace)
     */
    static normalizeAnswer(answer: string): string {
        return answer.toLowerCase().trim().replace(/\s+/g, ' ');
    }

    /**
     * Hash the security answer with salt using SHA-256
     */
    static hashSecurityAnswer(answer: string, salt: string): string {
        const normalized = this.normalizeAnswer(answer);
        return CryptoJS.SHA256(salt + normalized).toString();
    }

    /**
     * Verify a security answer against stored hash
     */
    static verifySecurityAnswer(answer: string, storedHash: string, salt: string): boolean {
        const hash = this.hashSecurityAnswer(answer, salt);
        return hash === storedHash;
    }
}
