/**
 * TadaKey 2FA - Type Definitions
 */
export type KeyType = 'apikey' | 'login' | 'note';
export interface VaultData {
    totpSecret: string;
    securityQuestion: string;
    securityAnswerHash: string;
    securitySalt: string;
    keys: StoredKey[];
}
export interface StoredKey {
    id: string;
    type: KeyType;
    name: string;
    encryptedValue: string;
    username?: string;
    pinned?: boolean;
    createdAt: number;
}
export type AppState = 'setup' | 'locked' | 'recovery' | 'resetupTotp' | 'unlocked' | 'addKey';
export type FrontendMessage = {
    command: 'ready';
} | {
    command: 'setup';
    totpCode: string;
    securityQuestion: string;
    securityAnswer: string;
} | {
    command: 'unlock';
    method: 'totp' | 'security';
    value: string;
} | {
    command: 'resetupTotp';
    totpCode: string;
} | {
    command: 'getSecurityQuestion';
} | {
    command: 'add';
    type: KeyType;
    name: string;
    value: string;
    username?: string;
} | {
    command: 'view';
    id: string;
} | {
    command: 'copy';
    id: string;
} | {
    command: 'delete';
    id: string;
} | {
    command: 'pin';
    id: string;
} | {
    command: 'lock';
};
export type BackendMessage = {
    command: 'state';
    state: AppState;
    data?: unknown;
} | {
    command: 'securityQuestion';
    question: string;
} | {
    command: 'qrCode';
    dataUrl: string;
} | {
    command: 'keys';
    keys: {
        id: string;
        type: KeyType;
        name: string;
        username?: string;
        pinned?: boolean;
    }[];
} | {
    command: 'revealed';
    id: string;
    value: string;
} | {
    command: 'copied';
    id: string;
} | {
    command: 'error';
    message: string;
} | {
    command: 'success';
    message: string;
};
//# sourceMappingURL=types.d.ts.map