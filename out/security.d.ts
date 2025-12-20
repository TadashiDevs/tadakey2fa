/**
 * TadaKey 2FA - Security Helper Module
 * Handles encryption, TOTP, and security question verification
 */
export declare class Security {
    private static readonly SYSTEM_KEY_LENGTH;
    private static readonly SALT_LENGTH;
    /**
     * Generate a random SystemKey (32 alphanumeric characters)
     * Called once on first run, stored in SecretStorage
     */
    static generateSystemKey(): string;
    /**
     * Generate a random salt for security question hashing
     */
    static generateSalt(): string;
    /**
     * Generate a unique ID for stored keys
     */
    static generateId(): string;
    /**
     * Encrypt plaintext using AES-256
     */
    static encrypt(plainText: string, key: string): string;
    /**
     * Decrypt ciphertext using AES-256
     */
    static decrypt(cipherText: string, key: string): string;
    /**
     * Generate a new TOTP secret (base32 encoded)
     */
    static generateTotpSecret(): string;
    /**
     * Generate otpauth:// URI for QR code
     */
    static generateTotpUri(secret: string, accountName?: string): string;
    /**
     * Validate a TOTP token against a secret
     * Returns true if the token is valid (within time window)
     */
    static validateTotpToken(token: string, secret: string): boolean;
    /**
     * Generate QR code as base64 data URL
     */
    static generateQrCode(secret: string): Promise<string>;
    /**
     * Normalize the security answer (lowercase, trim whitespace)
     */
    static normalizeAnswer(answer: string): string;
    /**
     * Hash the security answer with salt using SHA-256
     */
    static hashSecurityAnswer(answer: string, salt: string): string;
    /**
     * Verify a security answer against stored hash
     */
    static verifySecurityAnswer(answer: string, storedHash: string, salt: string): boolean;
}
//# sourceMappingURL=security.d.ts.map