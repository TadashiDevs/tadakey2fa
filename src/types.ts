/**
 * TadaKey 2FA - Type Definitions
 */

// Key types
export type KeyType = 'apikey' | 'login' | 'note';

// Vault data stored in SecretStorage (encrypted)
export interface VaultData {
    totpSecret: string; // Encrypted with SystemKey
    securityQuestion: string; // Plain text (the question itself)
    securityAnswerHash: string; // SHA-256 of normalized answer
    securitySalt: string; // Unique salt for this user
    keys: StoredKey[];
}

// Individual key stored in vault
export interface StoredKey {
    id: string;
    type: KeyType;
    name: string;
    // For apikey: encryptedValue contains the secret
    // For login: encryptedValue contains JSON {username, password} where password is encrypted
    // For note: encryptedValue contains the note content
    encryptedValue: string;
    // For login type only - stored as plain text for searchability
    username?: string;
    // Pinned/Favorite items appear at top
    pinned?: boolean;
    createdAt: number;
}

// Application state
export type AppState = 'setup' | 'locked' | 'recovery' | 'resetupTotp' | 'unlocked' | 'addKey';

// Messages from Frontend to Backend
export type FrontendMessage =
    | { command: 'ready' }
    | { command: 'setup'; totpCode: string; securityQuestion: string; securityAnswer: string }
    | { command: 'unlock'; method: 'totp' | 'security'; value: string }
    | { command: 'resetupTotp'; totpCode: string }
    | { command: 'getSecurityQuestion' }
    | { command: 'add'; type: KeyType; name: string; value: string; username?: string }
    | { command: 'view'; id: string }
    | { command: 'copy'; id: string }
    | { command: 'delete'; id: string }
    | { command: 'pin'; id: string }
    | { command: 'lock' };

// Messages from Backend to Frontend
export type BackendMessage =
    | { command: 'state'; state: AppState; data?: unknown }
    | { command: 'securityQuestion'; question: string }
    | { command: 'qrCode'; dataUrl: string }
    | { command: 'keys'; keys: { id: string; type: KeyType; name: string; username?: string; pinned?: boolean }[] }
    | { command: 'revealed'; id: string; value: string }
    | { command: 'copied'; id: string }
    | { command: 'error'; message: string }
    | { command: 'success'; message: string };

