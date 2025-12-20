/**
 * TadaKey 2FA - Sidebar Webview Provider
 * Handles the UI and communication with the extension
 */

import * as vscode from 'vscode';
import { Security } from './security';
import { VaultData, StoredKey, AppState, FrontendMessage, BackendMessage, KeyType } from './types';

const SYSTEM_KEY_STORAGE = 'tadakey:systemKey';
const VAULT_DATA_STORAGE = 'tadakey:vaultData';

export class SidebarProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'tadakey2fa';

  private _view?: vscode.WebviewView;
  private _systemKey: string | null = null;
  private _vaultData: VaultData | null = null;
  private _isUnlocked: boolean = false;
  private _pendingRecovery: boolean = false;

  constructor(private readonly _extensionUri: vscode.Uri, private readonly _secrets: vscode.SecretStorage) { }

  public async resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): Promise<void> {
    this._view = webviewView;
    webviewView.webview.options = { enableScripts: true, localResourceRoots: [this._extensionUri] };
    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);
    webviewView.webview.onDidReceiveMessage(async (message: FrontendMessage) => {
      await this._handleMessage(message);
    });
    await this._initializeState();
  }

  private async _initializeState(): Promise<void> {
    this._systemKey = await this._secrets.get(SYSTEM_KEY_STORAGE) || null;
    const vaultDataStr = await this._secrets.get(VAULT_DATA_STORAGE);
    if (vaultDataStr) {
      try { this._vaultData = JSON.parse(vaultDataStr); } catch { this._vaultData = null; }
    }
    if (!this._systemKey || !this._vaultData) {
      this._systemKey = Security.generateSystemKey();
      await this._secrets.store(SYSTEM_KEY_STORAGE, this._systemKey);
      await this._sendSetupState();
    } else if (this._isUnlocked) {
      this._sendState('unlocked');
      this._sendKeys();
    } else {
      this._sendState('locked');
    }
  }

  private async _sendSetupState(): Promise<void> {
    const secret = Security.generateTotpSecret();
    const qrCode = await Security.generateQrCode(secret);
    (this as any)._pendingTotpSecret = secret;
    this._sendMessage({ command: 'state', state: 'setup' });
    this._sendMessage({ command: 'qrCode', dataUrl: qrCode });
  }

  private async _handleMessage(message: FrontendMessage): Promise<void> {
    switch (message.command) {
      case 'ready': await this._initializeState(); break;
      case 'setup': await this._handleSetup(message); break;
      case 'unlock': await this._handleUnlock(message); break;
      case 'resetupTotp': await this._handleResetupTotp(message); break;
      case 'getSecurityQuestion': this._handleGetSecurityQuestion(); break;
      case 'add': await this._handleAddKey(message); break;
      case 'view': this._handleViewKey(message.id); break;
      case 'copy': await this._handleCopyKey(message.id); break;
      case 'delete': await this._handleDeleteKey(message.id); break;
      case 'pin': await this._handlePinKey(message.id); break;
      case 'lock': this._handleLock(); break;
    }
  }

  private async _handleSetup(message: { totpCode: string; securityQuestion: string; securityAnswer: string }): Promise<void> {
    const pendingSecret = (this as any)._pendingTotpSecret;
    if (!pendingSecret) { this._sendMessage({ command: 'error', message: 'Configuration error. Please reload.' }); return; }
    if (!Security.validateTotpToken(message.totpCode, pendingSecret)) { this._sendMessage({ command: 'error', message: 'Invalid 2FA code.' }); return; }
    if (!message.securityQuestion.trim() || !message.securityAnswer.trim()) { this._sendMessage({ command: 'error', message: 'Security Q&A required.' }); return; }
    const salt = Security.generateSalt();
    this._vaultData = {
      totpSecret: Security.encrypt(pendingSecret, this._systemKey!),
      securityQuestion: message.securityQuestion.trim(),
      securityAnswerHash: Security.hashSecurityAnswer(message.securityAnswer, salt),
      securitySalt: salt,
      keys: []
    };
    await this._saveVaultData();
    delete (this as any)._pendingTotpSecret;
    this._isUnlocked = true;
    this._sendState('unlocked');
    this._sendKeys();
    this._sendMessage({ command: 'success', message: 'Vault configured!' });
  }

  private async _handleUnlock(message: { method: 'totp' | 'security'; value: string }): Promise<void> {
    if (!this._vaultData || !this._systemKey) { this._sendMessage({ command: 'error', message: 'No vault.' }); return; }
    if (message.method === 'totp') {
      const totpSecret = Security.decrypt(this._vaultData.totpSecret, this._systemKey);
      if (!Security.validateTotpToken(message.value, totpSecret)) { this._sendMessage({ command: 'error', message: 'Invalid 2FA code.' }); return; }
      this._isUnlocked = true;
      this._sendState('unlocked');
      this._sendKeys();
    } else if (message.method === 'security') {
      if (!Security.verifySecurityAnswer(message.value, this._vaultData.securityAnswerHash, this._vaultData.securitySalt)) { this._sendMessage({ command: 'error', message: 'Incorrect answer.' }); return; }
      this._pendingRecovery = true;
      await this._sendResetupTotpState();
    }
  }

  private async _sendResetupTotpState(): Promise<void> {
    const secret = Security.generateTotpSecret();
    const qrCode = await Security.generateQrCode(secret);
    (this as any)._pendingTotpSecret = secret;
    this._sendMessage({ command: 'state', state: 'resetupTotp' });
    this._sendMessage({ command: 'qrCode', dataUrl: qrCode });
  }

  private async _handleResetupTotp(message: { totpCode: string }): Promise<void> {
    const pendingSecret = (this as any)._pendingTotpSecret;
    if (!pendingSecret || !this._pendingRecovery || !this._vaultData) { this._sendMessage({ command: 'error', message: 'Recovery error.' }); return; }
    if (!Security.validateTotpToken(message.totpCode, pendingSecret)) { this._sendMessage({ command: 'error', message: 'Invalid code.' }); return; }
    this._vaultData.totpSecret = Security.encrypt(pendingSecret, this._systemKey!);
    await this._saveVaultData();
    delete (this as any)._pendingTotpSecret;
    this._pendingRecovery = false;
    this._isUnlocked = true;
    this._sendState('unlocked');
    this._sendKeys();
    this._sendMessage({ command: 'success', message: '2FA reconfigured!' });
  }

  private _handleGetSecurityQuestion(): void {
    if (this._vaultData) {
      this._sendMessage({ command: 'securityQuestion', question: this._vaultData.securityQuestion });
      this._sendState('recovery');
    }
  }

  private async _handleAddKey(message: { type: KeyType; name: string; value: string; username?: string }): Promise<void> {
    if (!this._isUnlocked || !this._vaultData || !this._systemKey) { this._sendMessage({ command: 'error', message: 'Locked.' }); return; }
    if (!message.name.trim()) { this._sendMessage({ command: 'error', message: 'Name required.' }); return; }
    if (!message.value.trim()) { this._sendMessage({ command: 'error', message: 'Value required.' }); return; }
    if (message.type === 'login' && !message.username?.trim()) { this._sendMessage({ command: 'error', message: 'Username required.' }); return; }
    const newKey: StoredKey = {
      id: Security.generateId(),
      type: message.type,
      name: message.name.trim(),
      encryptedValue: Security.encrypt(message.value, this._systemKey),
      username: message.type === 'login' ? message.username?.trim() : undefined,
      createdAt: Date.now()
    };
    this._vaultData.keys.push(newKey);
    await this._saveVaultData();
    this._sendKeys();
    this._sendMessage({ command: 'success', message: `"${newKey.name}" saved.` });
  }

  private _handleViewKey(id: string): void {
    if (!this._isUnlocked || !this._vaultData || !this._systemKey) return;
    const key = this._vaultData.keys.find(k => k.id === id);
    if (key) this._sendMessage({ command: 'revealed', id, value: Security.decrypt(key.encryptedValue, this._systemKey) });
  }

  private async _handleCopyKey(id: string): Promise<void> {
    if (!this._isUnlocked || !this._vaultData || !this._systemKey) return;
    const key = this._vaultData.keys.find(k => k.id === id);
    if (key) {
      await vscode.env.clipboard.writeText(Security.decrypt(key.encryptedValue, this._systemKey));
      this._sendMessage({ command: 'copied', id });
      this._sendMessage({ command: 'success', message: 'Copied!' });
    }
  }

  private async _handleDeleteKey(id: string): Promise<void> {
    if (!this._isUnlocked || !this._vaultData) return;
    const i = this._vaultData.keys.findIndex(k => k.id === id);
    if (i !== -1) {
      const name = this._vaultData.keys[i].name;
      this._vaultData.keys.splice(i, 1);
      await this._saveVaultData();
      this._sendKeys();
      this._sendMessage({ command: 'success', message: `"${name}" deleted.` });
    }
  }

  private async _handlePinKey(id: string): Promise<void> {
    if (!this._isUnlocked || !this._vaultData) return;
    const key = this._vaultData.keys.find(k => k.id === id);
    if (key) { key.pinned = !key.pinned; await this._saveVaultData(); this._sendKeys(); }
  }

  private _handleLock(): void {
    this._isUnlocked = false;
    this._pendingRecovery = false;
    delete (this as any)._pendingTotpSecret;
    this._sendState('locked');
  }

  private async _saveVaultData(): Promise<void> {
    if (this._vaultData) await this._secrets.store(VAULT_DATA_STORAGE, JSON.stringify(this._vaultData));
  }

  private _sendState(state: AppState): void { this._sendMessage({ command: 'state', state }); }

  private _sendKeys(): void {
    if (this._vaultData) {
      const keys = this._vaultData.keys.map(k => ({ id: k.id, type: k.type || 'apikey' as KeyType, name: k.name, username: k.username, pinned: k.pinned || false }));
      this._sendMessage({ command: 'keys', keys });
    }
  }

  private _sendMessage(message: BackendMessage): void { this._view?.webview.postMessage(message); }

  private _getHtmlForWebview(_webview: vscode.Webview): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>TadaKey 2FA</title>
  <style>
    :root {
      --vscode-foreground: var(--vscode-editor-foreground, #ccc);
      --vscode-input-background: var(--vscode-input-background, #3c3c3c);
      --vscode-input-foreground: var(--vscode-input-foreground, #ccc);
      --vscode-input-border: var(--vscode-input-border, #3c3c3c);
      --vscode-button-background: var(--vscode-button-background, #0e639c);
      --vscode-button-foreground: var(--vscode-button-foreground, #fff);
      --vscode-button-hoverBackground: var(--vscode-button-hoverBackground, #1177bb);
      --vscode-button-secondaryBackground: var(--vscode-button-secondaryBackground, #3a3d41);
      --vscode-button-secondaryForeground: var(--vscode-button-secondaryForeground, #fff);
      --vscode-list-hoverBackground: var(--vscode-list-hoverBackground, #2a2d2e);
      --vscode-focusBorder: var(--vscode-focusBorder, #007fd4);
      --vscode-errorForeground: var(--vscode-errorForeground, #f48771);
      --vscode-notificationsErrorIcon-foreground: var(--vscode-notificationsErrorIcon-foreground, #f48771);
      --vscode-notificationsInfoIcon-foreground: var(--vscode-notificationsInfoIcon-foreground, #75beff);
      --vscode-testing-iconPassed: var(--vscode-testing-iconPassed, #73c991);
      --vscode-descriptionForeground: var(--vscode-descriptionForeground, #8b8b8b);
      --vscode-panel-border: var(--vscode-panel-border, #2b2b2b);
      --vscode-sideBar-background: var(--vscode-sideBar-background, #252526);
      --vscode-widget-shadow: var(--vscode-widget-shadow, rgba(0,0,0,0.36));
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: var(--vscode-font-family, system-ui); font-size: 13px; background: var(--vscode-sideBar-background); color: var(--vscode-foreground); padding: 12px; }
    h1 { font-size: 1.1rem; margin-bottom: 4px; display: flex; align-items: center; gap: 8px; }
    h2 { font-size: 0.85rem; margin-bottom: 12px; color: var(--vscode-descriptionForeground); font-weight: normal; }
    .section { background: var(--vscode-input-background); border-radius: 6px; padding: 12px; margin-bottom: 12px; border: 1px solid var(--vscode-panel-border); }
    label { display: block; font-size: 0.75rem; color: var(--vscode-descriptionForeground); margin-bottom: 4px; text-transform: uppercase; }
    input, textarea, select { width: 100%; padding: 8px; border: 1px solid var(--vscode-input-border); border-radius: 4px; background: var(--vscode-input-background); color: var(--vscode-input-foreground); font-size: 0.9rem; margin-bottom: 10px; resize: none; }
    input:focus, textarea:focus, select:focus { outline: none; border-color: var(--vscode-focusBorder); }
    button { width: 100%; padding: 8px 12px; border: none; border-radius: 4px; font-size: 0.85rem; font-weight: 500; cursor: pointer; margin-bottom: 6px; display: flex; align-items: center; justify-content: center; gap: 6px; }
    .btn-primary { background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
    .btn-primary:hover { background: var(--vscode-button-hoverBackground); }
    .btn-secondary { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
    .btn-danger { background: var(--vscode-notificationsErrorIcon-foreground); color: white; }
    .btn-success { background: var(--vscode-testing-iconPassed); color: #1e1e1e; }
    .button-row { display: flex; gap: 8px; margin-bottom: 12px; }
    .button-row button { flex: 1; margin: 0; }
    .btn-icon { width: 26px; height: 26px; padding: 4px; background: transparent; margin: 0; border-radius: 4px; display: flex; align-items: center; justify-content: center; }
    .btn-icon:hover { background: var(--vscode-list-hoverBackground); }
    .btn-icon svg { width: 14px; height: 14px; fill: var(--vscode-foreground); }
    .qr-container { text-align: center; padding: 12px; background: white; border-radius: 8px; margin: 12px 0; }
    .qr-container img { max-width: 180px; width: 100%; }
    .key-list { list-style: none; }
    .key-item { display: flex; align-items: center; padding: 8px; background: var(--vscode-input-background); border-radius: 6px; margin-bottom: 6px; border: 1px solid var(--vscode-panel-border); }
    .key-info { flex: 1; min-width: 0; }
    .key-header { display: flex; align-items: center; gap: 6px; }
    .key-type { display: flex; align-items: center; }
    .key-type svg { width: 14px; height: 14px; fill: var(--vscode-foreground); opacity: 0.8; }
    .key-name { font-weight: 500; font-size: 0.85rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .key-username { font-size: 0.7rem; color: var(--vscode-descriptionForeground); }
    .key-value { font-family: monospace; font-size: 0.75rem; color: var(--vscode-descriptionForeground); }
    .key-value.revealed { color: var(--vscode-testing-iconPassed); }
    .key-actions { display: flex; gap: 2px; }
    .pin-star { display: flex; align-items: center; }
    .pin-star svg { width: 12px; height: 12px; fill: #f5c518; }
    .message { padding: 8px; border-radius: 4px; margin-bottom: 10px; font-size: 0.85rem; }
    .message.error { background: rgba(244, 135, 113, 0.15); color: var(--vscode-errorForeground); border: 1px solid var(--vscode-errorForeground); }
    .message.success { background: rgba(115, 201, 145, 0.15); color: var(--vscode-testing-iconPassed); border: 1px solid var(--vscode-testing-iconPassed); }
    .link { color: var(--vscode-notificationsInfoIcon-foreground); cursor: pointer; font-size: 0.85rem; text-decoration: underline; }
    .hidden { display: none !important; }
    .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
    .lock-btn { background: var(--vscode-notificationsErrorIcon-foreground); color: white; padding: 6px 10px; border-radius: 4px; font-size: 0.8rem; width: auto; }
    .lock-btn svg { width: 14px; height: 14px; fill: white; }
    .empty-state { text-align: center; padding: 24px; color: var(--vscode-descriptionForeground); }
    .empty-state svg { width: 40px; height: 40px; margin-bottom: 8px; opacity: 0.5; fill: currentColor; }
    .modal-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.6); display: flex; align-items: center; justify-content: center; z-index: 1000; }
    .modal { background: var(--vscode-sideBar-background); border: 1px solid var(--vscode-panel-border); border-radius: 8px; padding: 16px; max-width: 280px; width: 90%; }
    .modal h3 { font-size: 1rem; margin-bottom: 8px; display: flex; align-items: center; gap: 8px; }
    .modal h3 svg { width: 20px; height: 20px; fill: var(--vscode-notificationsErrorIcon-foreground); }
    .modal p { color: var(--vscode-descriptionForeground); margin-bottom: 16px; font-size: 0.9rem; }
    .modal-actions { display: flex; gap: 8px; }
    .modal-actions button { flex: 1; margin: 0; }
    .type-selector { display: flex; gap: 6px; margin-bottom: 12px; }
    .type-btn { flex: 1; padding: 8px; border: 1px solid var(--vscode-panel-border); border-radius: 6px; background: var(--vscode-input-background); cursor: pointer; text-align: center; font-size: 0.75rem; }
    .type-btn:hover { border-color: var(--vscode-focusBorder); }
    .type-btn.active { border-color: var(--vscode-button-background); background: var(--vscode-button-background); color: white; }
    .type-btn .icon { font-size: 1rem; display: block; margin-bottom: 2px; }
    .search-box { position: relative; margin-bottom: 8px; }
    .search-box input { padding-left: 28px; margin-bottom: 0; }
    .search-box svg { position: absolute; left: 8px; top: 50%; transform: translateY(-50%); width: 14px; height: 14px; fill: var(--vscode-descriptionForeground); }
    .filter-chips { display: flex; gap: 4px; margin-bottom: 10px; flex-wrap: wrap; }
    .filter-chip { padding: 4px 10px; border-radius: 12px; font-size: 0.75rem; cursor: pointer; background: var(--vscode-input-background); border: 1px solid var(--vscode-panel-border); }
    .filter-chip:hover { border-color: var(--vscode-focusBorder); }
    .filter-chip.active { background: var(--vscode-button-background); color: white; border-color: var(--vscode-button-background); }
    .pinned-section { margin-bottom: 8px; }
    .pinned-label { font-size: 0.7rem; color: var(--vscode-descriptionForeground); text-transform: uppercase; margin-bottom: 4px; display: flex; align-items: center; gap: 4px; }
    .pinned-label svg { width: 12px; height: 12px; fill: #f5c518; }
    .divider { border-top: 1px solid var(--vscode-panel-border); margin: 8px 0; }
    .pin-star { color: #f5c518; font-size: 0.8rem; }
  </style>
</head>
<body>
  <div class="container">
    <!-- SETUP -->
    <div id="setup-view" class="hidden">
      <h1><svg viewBox="0 0 16 16" fill="currentColor" width="20" height="20"><path d="M8 1a4 4 0 0 0-4 4v2H3v7h10V7h-1V5a4 4 0 0 0-4-4zm3 6V5a3 3 0 0 0-6 0v2h6zm-7 1v5h8V8H4z"/><path d="M8 10a1 1 0 1 0 0 2 1 1 0 0 0 0-2z"/></svg> TadaKey 2FA</h1>
      <h2>Initial Setup</h2>
      <div class="section">
        <label>Security Question</label>
        <input type="text" id="setup-question" placeholder="E.g., First pet name">
        <label>Answer</label>
        <input type="text" id="setup-answer" placeholder="Your answer">
      </div>
      <div class="section">
        <label>Scan with authenticator</label>
        <div class="qr-container"><img id="setup-qr" src="" alt="QR"></div>
        <label>6-digit code</label>
        <input type="text" id="setup-totp" maxlength="6" placeholder="000000" inputmode="numeric">
      </div>
      <div id="setup-message"></div>
      <button class="btn-primary" id="setup-btn">Activate Vault</button>
    </div>

    <!-- LOCKED -->
    <div id="locked-view" class="hidden">
      <h1><svg viewBox="0 0 16 16" fill="currentColor" width="20" height="20"><path d="M8 1a4 4 0 0 0-4 4v2H3v7h10V7h-1V5a4 4 0 0 0-4-4zm3 6V5a3 3 0 0 0-6 0v2h6zm-7 1v5h8V8H4z"/><path d="M8 10a1 1 0 1 0 0 2 1 1 0 0 0 0-2z"/></svg> TadaKey 2FA</h1>
      <h2>Vault Locked</h2>
      <div class="section">
        <label>2FA Code</label>
        <input type="text" id="unlock-totp" maxlength="6" placeholder="000000" inputmode="numeric">
        <div id="unlock-message"></div>
        <button class="btn-primary" id="unlock-btn">Unlock</button>
      </div>
      <p class="link" id="recovery-link">Lost 2FA? Use security question</p>
    </div>

    <!-- RECOVERY -->
    <div id="recovery-view" class="hidden">
      <h1><svg viewBox="0 0 16 16" fill="currentColor" width="20" height="20"><path d="M8 1a4 4 0 0 0-4 4v2H3v7h10V7h-1V5a4 4 0 0 0-4-4zm3 6V5a3 3 0 0 0-6 0v2h6z"/></svg> Recovery</h1>
      <h2 id="recovery-question">Loading...</h2>
      <div class="section">
        <label>Your Answer</label>
        <input type="text" id="recovery-answer" placeholder="Answer">
        <div id="recovery-message"></div>
        <button class="btn-primary" id="recovery-btn">Verify</button>
        <button class="btn-secondary" id="recovery-back">Back</button>
      </div>
    </div>

    <!-- RESETUP TOTP -->
    <div id="resetup-view" class="hidden">
      <h1><svg viewBox="0 0 16 16" fill="currentColor" width="20" height="20"><path d="M13.9 2.1L13.1 1.3 8 6.4 2.9 1.3 2.1 2.1 7.2 7.2 2.1 12.3 2.9 13.1 8 8 13.1 13.1 13.9 12.3 8.8 7.2z"/></svg> New 2FA</h1>
      <h2>Previous 2FA invalidated</h2>
      <div class="section">
        <label>Scan new QR</label>
        <div class="qr-container"><img id="resetup-qr" src="" alt="QR"></div>
        <label>6-digit code</label>
        <input type="text" id="resetup-totp" maxlength="6" placeholder="000000" inputmode="numeric">
        <div id="resetup-message"></div>
        <button class="btn-primary" id="resetup-btn">Confirm</button>
      </div>
    </div>

    <!-- UNLOCKED -->
    <div id="unlocked-view" class="hidden">
      <div class="header">
        <h1><svg viewBox="0 0 16 16" fill="currentColor" width="20" height="20"><path d="M8 1a4 4 0 0 0-4 4v2H3v7h10V7h-1V5a4 4 0 0 0-4-4zm3 6V5a3 3 0 0 0-6 0v2h6z"/></svg> Vault</h1>
      </div>
      <div class="button-row">
        <button class="btn-success" id="goto-add-btn"><svg viewBox="0 0 16 16" fill="currentColor" width="14" height="14"><path d="M14 7v1H8v6H7V8H1V7h6V1h1v6h6z"/></svg> Add</button>
        <button class="lock-btn" id="panic-btn"><svg viewBox="0 0 16 16" fill="currentColor"><path d="M8 1a4 4 0 0 0-4 4v2H3v7h10V7h-1V5a4 4 0 0 0-4-4zm3 6V5a3 3 0 0 0-6 0v2h6zm-7 1v5h8V8H4z"/><path d="M8 10a1 1 0 1 0 0 2 1 1 0 0 0 0-2z"/></svg> Lock</button>
      </div>
      <div id="unlocked-message"></div>
      <div class="search-box">
        <svg viewBox="0 0 16 16" fill="currentColor"><path d="M15.7 14.3l-4.2-4.2c-.2-.2-.5-.3-.8-.3.8-1 1.3-2.4 1.3-3.8C12 2.7 9.3 0 6 0S0 2.7 0 6s2.7 6 6 6c1.4 0 2.8-.5 3.8-1.3 0 .3.1.6.3.8l4.2 4.2c.2.2.5.3.7.3s.5-.1.7-.3c.4-.4.4-1 0-1.4zM6 10.5c-2.5 0-4.5-2-4.5-4.5s2-4.5 4.5-4.5 4.5 2 4.5 4.5-2 4.5-4.5 4.5z"/></svg>
        <input type="text" id="search-input" placeholder="Search secrets...">
      </div>
      <div class="filter-chips">
        <span class="filter-chip active" data-filter="all">All</span>
        <span class="filter-chip" data-filter="apikey"><svg viewBox="0 0 16 16" fill="currentColor" width="12" height="12"><path fill-rule="evenodd" clip-rule="evenodd" d="M10 2a4 4 0 0 0-3.3 6.3l-5.6 5.6A1.5 1.5 0 0 0 0 15v1h1a1.5 1.5 0 0 0 1.1-2.5l1.6-1.6.9.9H6v-1h1v-1h1l3.3-3.3A4 4 0 1 0 10 2zm0 6a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"/></svg> Keys</span>
        <span class="filter-chip" data-filter="login"><svg viewBox="0 0 16 16" fill="currentColor" width="12" height="12"><path d="M8 1a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM5 10c-1.1 0-2 .9-2 2v2h10v-2c0-1.1-.9-2-2-2H5z"/></svg> Logins</span>
        <span class="filter-chip" data-filter="note"><svg viewBox="0 0 16 16" fill="currentColor" width="12" height="12"><path fill-rule="evenodd" clip-rule="evenodd" d="M2 1h8.5l3.5 3.5V14a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1zm8 1v3h3l-3-3zM3 13V2h6v4h4v7H3zm2-2h6v-1H5v1zm0-2h6V8H5v1zm0-2h4V6H5v1z"/></svg> Notes</span>
      </div>
      <div id="pinned-section" class="pinned-section hidden">
        <div class="pinned-label"><svg viewBox="0 0 16 16" fill="currentColor"><path d="M9.828.722a.5.5 0 0 1 .354.146l4.95 4.95a.5.5 0 0 1 0 .707c-.48.48-1.072.588-1.503.588-.177 0-.335-.018-.46-.039l-3.134 3.134a5.927 5.927 0 0 1 .16 1.013c.046.702-.032 1.687-.72 2.375a.5.5 0 0 1-.707 0l-2.829-2.828-3.182 3.182a.5.5 0 1 1-.707-.707l3.182-3.182L2.4 7.239a.5.5 0 0 1 0-.707c.688-.688 1.673-.767 2.375-.72a5.922 5.922 0 0 1 1.013.16l3.134-3.134a2.67 2.67 0 0 1-.039-.46c0-.43.108-1.022.589-1.503a.5.5 0 0 1 .353-.146z"/></svg> Pinned</div>
        <ul class="key-list" id="pinned-list"></ul>
        <div class="divider"></div>
      </div>
      <ul class="key-list" id="keys-list"></ul>
      <div class="empty-state hidden" id="empty-state">
        <svg viewBox="0 0 16 16" fill="currentColor"><path d="M8 1a4 4 0 0 0-4 4v2H3v7h10V7h-1V5a4 4 0 0 0-4-4zm3 6V5a3 3 0 0 0-6 0v2h6zm-7 1v5h8V8H4z"/><path d="M8 10a1 1 0 1 0 0 2 1 1 0 0 0 0-2z"/></svg>
        <p>Vault empty. Add your first entry.</p>
      </div>
    </div>

    <!-- ADD KEY -->
    <div id="addkey-view" class="hidden">
      <div class="header"><h1><svg viewBox="0 0 16 16" fill="currentColor" width="20" height="20"><path d="M14 7v1H8v6H7V8H1V7h6V1h1v6h6z"/></svg> New Entry</h1></div>
      <div class="type-selector">
        <div class="type-btn active" data-type="apikey"><span class="icon"><svg viewBox="0 0 16 16" fill="currentColor" width="16" height="16"><path fill-rule="evenodd" clip-rule="evenodd" d="M10 2a4 4 0 0 0-3.3 6.3l-5.6 5.6A1.5 1.5 0 0 0 0 15v1h1a1.5 1.5 0 0 0 1.1-2.5l1.6-1.6.9.9H6v-1h1v-1h1l3.3-3.3A4 4 0 1 0 10 2zm0 6a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"/></svg></span>API Key</div>
        <div class="type-btn" data-type="login"><span class="icon"><svg viewBox="0 0 16 16" fill="currentColor" width="16" height="16"><path d="M8 1a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM5 10c-1.1 0-2 .9-2 2v2h10v-2c0-1.1-.9-2-2-2H5z"/></svg></span>Login</div>
        <div class="type-btn" data-type="note"><span class="icon"><svg viewBox="0 0 16 16" fill="currentColor" width="16" height="16"><path fill-rule="evenodd" clip-rule="evenodd" d="M2 1h8.5l3.5 3.5V14a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1zm8 1v3h3l-3-3zM3 13V2h6v4h4v7H3zm2-2h6v-1H5v1zm0-2h6V8H5v1zm0-2h4V6H5v1z"/></svg></span>Note</div>
      </div>
      <div class="section">
        <div id="form-apikey"><label>Name</label><input type="text" id="add-name-apikey" placeholder="E.g., Stripe"><label>Secret</label><input type="text" id="add-value-apikey" placeholder="sk_live_..."></div>
        <div id="form-login" class="hidden"><label>Site</label><input type="text" id="add-name-login" placeholder="E.g., Gmail"><label>Username</label><input type="text" id="add-username-login" placeholder="user@email.com"><label>Password</label><input type="password" id="add-value-login" placeholder="Password"></div>
        <div id="form-note" class="hidden"><label>Title</label><input type="text" id="add-name-note" placeholder="E.g., SSH Key"><label>Content</label><textarea id="add-value-note" rows="5" placeholder="Private keys, JSON..."></textarea></div>
        <div id="addkey-message"></div>
        <button class="btn-primary" id="add-btn"><svg viewBox="0 0 16 16" fill="currentColor" width="14" height="14"><path d="M14 7v1H8v6H7V8H1V7h6V1h1v6h6z"/></svg> Add</button>
        <button class="btn-secondary" id="add-back">Cancel</button>
      </div>
    </div>

    <!-- DELETE MODAL -->
    <div id="delete-modal" class="modal-overlay hidden">
      <div class="modal">
        <h3><svg viewBox="0 0 16 16" fill="currentColor"><path d="M10 3l1 1h3.5l.5 1h-12l.5-1H7l1-1h2zM4.118 6L4 6.059V13l1 1h6l1-1V6.059L11.882 6H4.118zM5 13V6h1v7H5zm3-7h1v7H8V6zm3 0h1v7h-1V6z"/></svg> Delete Entry</h3>
        <p>Delete "<span id="delete-key-name"></span>"?</p>
        <div class="modal-actions"><button class="btn-secondary" id="delete-cancel">Cancel</button><button class="btn-danger" id="delete-confirm">Delete</button></div>
      </div>
    </div>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    const ICONS = {
      eyeOpen: '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M8 3C4.5 3 1.5 5.5 1.5 8S4.5 13 8 13s6.5-2.5 6.5-5S11.5 3 8 3zm0 8.5c-2.3 0-4.3-1.4-5.3-3.5C3.7 5.9 5.7 4.5 8 4.5s4.3 1.4 5.3 3.5c-1 2.1-3 3.5-5.3 3.5z"/><path d="M8 6a2 2 0 1 0 0 4 2 2 0 0 0 0-4z"/></svg>',
      eyeClosed: '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M8.06 2C3 2 0 8 0 8s3 6 8.06 6c1.03 0 1.99-.2 2.9-.55l-1.07-1.07A5.95 5.95 0 0 1 8.06 11C5.23 11 2.76 9 1.62 8c.67-.59 1.64-1.33 2.75-2.02L2.73 4.33A9.76 9.76 0 0 1 8.06 2z"/></svg>',
      copy: '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M4 4l1-1h5.414L14 6.586V14l-1 1H5l-1-1V4zm9 3l-3-3H5v10h8V7z"/><path d="M3 1L2 2v10l1 1V2h6.414l-1-1H3z"/></svg>',
      trash: '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M10 3l1 1h3.5l.5 1h-12l.5-1H7l1-1h2zM4.118 6L4 6.059V13l1 1h6l1-1V6.059L11.882 6H4.118zM5 13V6h1v7H5zm3-7h1v7H8V6zm3 0h1v7h-1V6z"/></svg>',
      check: '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M14.431 3.323l-8.47 10-.79-.036-3.35-4.77.818-.574 2.978 4.24 8.051-9.506.763.646z"/></svg>',
      pin: '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M9.828.722a.5.5 0 0 1 .354.146l4.95 4.95a.5.5 0 0 1 0 .707c-.48.48-1.072.588-1.503.588-.177 0-.335-.018-.46-.039l-3.134 3.134a5.927 5.927 0 0 1 .16 1.013c.046.702-.032 1.687-.72 2.375a.5.5 0 0 1-.707 0l-2.829-2.828-3.182 3.182a.5.5 0 1 1-.707-.707l3.182-3.182L2.4 7.239a.5.5 0 0 1 0-.707c.688-.688 1.673-.767 2.375-.72a5.922 5.922 0 0 1 1.013.16l3.134-3.134a2.67 2.67 0 0 1-.039-.46c0-.43.108-1.022.589-1.503a.5.5 0 0 1 .353-.146z"/></svg>',
      star: '<svg viewBox="0 0 16 16" fill="currentColor"><path fill-rule="evenodd" clip-rule="evenodd" d="M8 .25a.75.75 0 0 1 .673.418l1.882 3.815 4.21.612a.75.75 0 0 1 .416 1.279l-3.046 2.97.719 4.192a.75.75 0 0 1-1.088.791L8 12.347l-3.766 1.98a.75.75 0 0 1-1.088-.79l.72-4.194L.818 6.374a.75.75 0 0 1 .416-1.28l4.21-.611L7.327.668A.75.75 0 0 1 8 .25z"/></svg>',
      keyIcon: '<svg viewBox="0 0 16 16" fill="currentColor"><path fill-rule="evenodd" clip-rule="evenodd" d="M10 2a4 4 0 0 0-3.3 6.3l-5.6 5.6A1.5 1.5 0 0 0 0 15v1h1a1.5 1.5 0 0 0 1.1-2.5l1.6-1.6.9.9H6v-1h1v-1h1l3.3-3.3A4 4 0 1 0 10 2zm0 6a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"/></svg>',
      userIcon: '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M8 1a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM5 10c-1.1 0-2 .9-2 2v2h10v-2c0-1.1-.9-2-2-2H5z"/></svg>',
      noteIcon: '<svg viewBox="0 0 16 16" fill="currentColor"><path fill-rule="evenodd" clip-rule="evenodd" d="M2 1h8.5l3.5 3.5V14a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1zm8 1v3h3l-3-3zM3 13V2h6v4h4v7H3zm2-2h6v-1H5v1zm0-2h6V8H5v1zm0-2h4V6H5v1z"/></svg>'
    };
    const TYPE_ICONS = { apikey: ICONS.keyIcon, login: ICONS.userIcon, note: ICONS.noteIcon };
    const views = { setup: document.getElementById('setup-view'), locked: document.getElementById('locked-view'), recovery: document.getElementById('recovery-view'), resetup: document.getElementById('resetup-view'), unlocked: document.getElementById('unlocked-view'), addkey: document.getElementById('addkey-view') };
    let currentState = 'loading', currentType = 'apikey', currentFilter = 'all', searchQuery = '', allKeys = [];
    let revealedKeys = {}, revealTimers = {}, pendingDeleteId = null, pendingDeleteName = '';

    function showView(name) { Object.values(views).forEach(v => v.classList.add('hidden')); if (views[name]) views[name].classList.remove('hidden'); }
    function showMessage(id, msg, type) { const c = document.getElementById(id); if (c) { c.innerHTML = '<div class="message ' + type + '">' + msg + '</div>'; setTimeout(() => c.innerHTML = '', 5000); } }
    function escapeHtml(t) { const d = document.createElement('div'); d.textContent = t; return d.innerHTML; }
    function setActiveType(type) { currentType = type; document.querySelectorAll('.type-btn').forEach(b => b.classList.toggle('active', b.dataset.type === type)); document.getElementById('form-apikey').classList.toggle('hidden', type !== 'apikey'); document.getElementById('form-login').classList.toggle('hidden', type !== 'login'); document.getElementById('form-note').classList.toggle('hidden', type !== 'note'); }
    function setActiveFilter(filter) { currentFilter = filter; document.querySelectorAll('.filter-chip').forEach(c => c.classList.toggle('active', c.dataset.filter === filter)); renderFilteredKeys(); }

    window.addEventListener('message', e => {
      const m = e.data;
      switch (m.command) {
        case 'state': currentState = m.state; if (m.state === 'setup') showView('setup'); else if (m.state === 'locked') { document.getElementById('unlock-totp').value = ''; showView('locked'); } else if (m.state === 'recovery') showView('recovery'); else if (m.state === 'resetupTotp') showView('resetup'); else if (m.state === 'unlocked') showView('unlocked'); else if (m.state === 'addKey') showView('addkey'); break;
        case 'qrCode': document.getElementById('setup-qr').src = m.dataUrl; document.getElementById('resetup-qr').src = m.dataUrl; break;
        case 'securityQuestion': document.getElementById('recovery-question').textContent = m.question; break;
        case 'keys': allKeys = m.keys; renderFilteredKeys(); break;
        case 'revealed': revealKey(m.id, m.value); break;
        case 'copied': const cb = document.querySelector('[data-copy="' + m.id + '"]'); if (cb) { cb.innerHTML = ICONS.check; setTimeout(() => cb.innerHTML = ICONS.copy, 1500); } break;
        case 'error': const cm = { setup: 'setup-message', locked: 'unlock-message', recovery: 'recovery-message', resetupTotp: 'resetup-message', unlocked: 'unlocked-message', addKey: 'addkey-message' }; showMessage(cm[currentState] || 'unlock-message', m.message, 'error'); break;
        case 'success': if (currentState === 'unlocked') showMessage('unlocked-message', m.message, 'success'); break;
      }
    });

    function renderFilteredKeys() {
      let filtered = allKeys.filter(k => {
        if (currentFilter !== 'all' && k.type !== currentFilter) return false;
        if (searchQuery) { const q = searchQuery.toLowerCase(); return k.name.toLowerCase().includes(q) || (k.username && k.username.toLowerCase().includes(q)); }
        return true;
      });
      const pinned = filtered.filter(k => k.pinned);
      const unpinned = filtered.filter(k => !k.pinned);
      const pinnedSection = document.getElementById('pinned-section');
      const pinnedList = document.getElementById('pinned-list');
      const keysList = document.getElementById('keys-list');
      const empty = document.getElementById('empty-state');
      pinnedSection.classList.toggle('hidden', pinned.length === 0);
      pinnedList.innerHTML = pinned.map(k => renderKeyItem(k)).join('');
      keysList.innerHTML = unpinned.map(k => renderKeyItem(k)).join('');
      empty.classList.toggle('hidden', filtered.length > 0);
    }

    function renderKeyItem(key) {
      const isRevealed = revealedKeys[key.id];
      const icon = TYPE_ICONS[key.type] || ICONS.keyIcon;
      const pinIcon = key.pinned ? ICONS.star : '';
      let sub = key.type === 'login' && key.username ? '<div class="key-username">' + escapeHtml(key.username) + '</div>' : '';
      return '<li class="key-item" data-id="' + key.id + '"><div class="key-info"><div class="key-header"><span class="key-type">' + icon + '</span><span class="key-name">' + escapeHtml(key.name) + '</span>' + (pinIcon ? '<span class="pin-star">' + pinIcon + '</span>' : '') + '</div>' + sub + '<div class="key-value' + (isRevealed ? ' revealed' : '') + '" id="value-' + key.id + '">' + (isRevealed || '•••••••••') + '</div></div><div class="key-actions"><button class="btn-icon" data-pin="' + key.id + '" title="Pin">' + ICONS.pin + '</button><button class="btn-icon" data-toggle="' + key.id + '" title="View">' + (isRevealed ? ICONS.eyeClosed : ICONS.eyeOpen) + '</button><button class="btn-icon" data-copy="' + key.id + '" title="Copy">' + ICONS.copy + '</button><button class="btn-icon" data-delete="' + key.id + '" data-name="' + escapeHtml(key.name) + '" title="Delete">' + ICONS.trash + '</button></div></li>';
    }

    function revealKey(id, value) { revealedKeys[id] = value; const el = document.getElementById('value-' + id); const btn = document.querySelector('[data-toggle="' + id + '"]'); if (el) { el.textContent = value; el.classList.add('revealed'); } if (btn) { btn.innerHTML = ICONS.eyeClosed; } if (revealTimers[id]) clearTimeout(revealTimers[id]); revealTimers[id] = setTimeout(() => hideKey(id), 15000); }
    function hideKey(id) { delete revealedKeys[id]; const el = document.getElementById('value-' + id); const btn = document.querySelector('[data-toggle="' + id + '"]'); if (el) { el.textContent = '•••••••••'; el.classList.remove('revealed'); } if (btn) { btn.innerHTML = ICONS.eyeOpen; } if (revealTimers[id]) { clearTimeout(revealTimers[id]); delete revealTimers[id]; } }
    function toggleKey(id) { if (revealedKeys[id]) hideKey(id); else vscode.postMessage({ command: 'view', id }); }
    function showDeleteModal(id, name) { pendingDeleteId = id; pendingDeleteName = name; document.getElementById('delete-key-name').textContent = name; document.getElementById('delete-modal').classList.remove('hidden'); }
    function hideDeleteModal() { document.getElementById('delete-modal').classList.add('hidden'); pendingDeleteId = null; }
    function clearAddForm() { ['add-name-apikey', 'add-value-apikey', 'add-name-login', 'add-username-login', 'add-value-login', 'add-name-note', 'add-value-note'].forEach(id => document.getElementById(id).value = ''); }

    document.getElementById('setup-btn').addEventListener('click', () => vscode.postMessage({ command: 'setup', totpCode: document.getElementById('setup-totp').value, securityQuestion: document.getElementById('setup-question').value, securityAnswer: document.getElementById('setup-answer').value }));
    document.getElementById('unlock-btn').addEventListener('click', () => vscode.postMessage({ command: 'unlock', method: 'totp', value: document.getElementById('unlock-totp').value }));
    document.getElementById('recovery-link').addEventListener('click', () => vscode.postMessage({ command: 'getSecurityQuestion' }));
    document.getElementById('recovery-btn').addEventListener('click', () => vscode.postMessage({ command: 'unlock', method: 'security', value: document.getElementById('recovery-answer').value }));
    document.getElementById('recovery-back').addEventListener('click', () => showView('locked'));
    document.getElementById('resetup-btn').addEventListener('click', () => vscode.postMessage({ command: 'resetupTotp', totpCode: document.getElementById('resetup-totp').value }));
    document.getElementById('panic-btn').addEventListener('click', () => vscode.postMessage({ command: 'lock' }));
    document.getElementById('goto-add-btn').addEventListener('click', () => { setActiveType('apikey'); showView('addkey'); });
    document.getElementById('add-back').addEventListener('click', () => { clearAddForm(); showView('unlocked'); });
    document.querySelectorAll('.type-btn').forEach(b => b.addEventListener('click', () => setActiveType(b.dataset.type)));
    document.querySelectorAll('.filter-chip').forEach(c => c.addEventListener('click', () => setActiveFilter(c.dataset.filter)));
    document.getElementById('search-input').addEventListener('input', e => { searchQuery = e.target.value; renderFilteredKeys(); });
    document.getElementById('add-btn').addEventListener('click', () => {
      let name, value, username;
      if (currentType === 'apikey') { name = document.getElementById('add-name-apikey').value; value = document.getElementById('add-value-apikey').value; }
      else if (currentType === 'login') { name = document.getElementById('add-name-login').value; username = document.getElementById('add-username-login').value; value = document.getElementById('add-value-login').value; }
      else { name = document.getElementById('add-name-note').value; value = document.getElementById('add-value-note').value; }
      if (name && name.trim() && value && value.trim()) { const msg = { command: 'add', type: currentType, name, value }; if (username) msg.username = username; vscode.postMessage(msg); clearAddForm(); showView('unlocked'); }
      else showMessage('addkey-message', 'Name and value required.', 'error');
    });
    document.addEventListener('click', e => {
      const btn = e.target.closest('button');
      if (!btn) return;
      if (btn.dataset.toggle) toggleKey(btn.dataset.toggle);
      if (btn.dataset.copy) vscode.postMessage({ command: 'copy', id: btn.dataset.copy });
      if (btn.dataset.delete) showDeleteModal(btn.dataset.delete, btn.dataset.name);
      if (btn.dataset.pin) vscode.postMessage({ command: 'pin', id: btn.dataset.pin });
    });
    document.getElementById('delete-cancel').addEventListener('click', hideDeleteModal);
    document.getElementById('delete-confirm').addEventListener('click', () => { if (pendingDeleteId) vscode.postMessage({ command: 'delete', id: pendingDeleteId }); hideDeleteModal(); });
    document.getElementById('delete-modal').addEventListener('click', e => { if (e.target.id === 'delete-modal') hideDeleteModal(); });
    ['setup-totp', 'unlock-totp', 'recovery-answer', 'resetup-totp'].forEach(id => document.getElementById(id).addEventListener('keypress', e => { if (e.key === 'Enter') document.getElementById(id.replace('-totp', '-btn').replace('-answer', '-btn')).click(); }));
    vscode.postMessage({ command: 'ready' });
  </script>
</body>
</html>`;
  }
}
