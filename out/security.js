"use strict";
/**
 * TadaKey 2FA - Security Helper Module
 * Handles encryption, TOTP, and security question verification
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.Security = void 0;
const CryptoJS = __importStar(require("crypto-js"));
const otplib_1 = require("otplib");
const QRCode = __importStar(require("qrcode"));
class Security {
    /**
     * Generate a random SystemKey (32 alphanumeric characters)
     * Called once on first run, stored in SecretStorage
     */
    static generateSystemKey() {
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
    static generateSalt() {
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
    static generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substring(2, 9);
    }
    // ==================== ENCRYPTION ====================
    /**
     * Encrypt plaintext using AES-256
     */
    static encrypt(plainText, key) {
        return CryptoJS.AES.encrypt(plainText, key).toString();
    }
    /**
     * Decrypt ciphertext using AES-256
     */
    static decrypt(cipherText, key) {
        const bytes = CryptoJS.AES.decrypt(cipherText, key);
        return bytes.toString(CryptoJS.enc.Utf8);
    }
    // ==================== TOTP ====================
    /**
     * Generate a new TOTP secret (base32 encoded)
     */
    static generateTotpSecret() {
        return otplib_1.authenticator.generateSecret();
    }
    /**
     * Generate otpauth:// URI for QR code
     */
    static generateTotpUri(secret, accountName = 'Developer') {
        return otplib_1.authenticator.keyuri(accountName, 'TadaKey 2FA', secret);
    }
    /**
     * Validate a TOTP token against a secret
     * Returns true if the token is valid (within time window)
     */
    static validateTotpToken(token, secret) {
        try {
            return otplib_1.authenticator.check(token, secret);
        }
        catch {
            return false;
        }
    }
    /**
     * Generate QR code as base64 data URL
     */
    static async generateQrCode(secret) {
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
    static normalizeAnswer(answer) {
        return answer.toLowerCase().trim().replace(/\s+/g, ' ');
    }
    /**
     * Hash the security answer with salt using SHA-256
     */
    static hashSecurityAnswer(answer, salt) {
        const normalized = this.normalizeAnswer(answer);
        return CryptoJS.SHA256(salt + normalized).toString();
    }
    /**
     * Verify a security answer against stored hash
     */
    static verifySecurityAnswer(answer, storedHash, salt) {
        const hash = this.hashSecurityAnswer(answer, salt);
        return hash === storedHash;
    }
}
exports.Security = Security;
Security.SYSTEM_KEY_LENGTH = 32;
Security.SALT_LENGTH = 16;
//# sourceMappingURL=security.js.map