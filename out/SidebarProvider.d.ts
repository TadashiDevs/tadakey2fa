/**
 * TadaKey 2FA - Sidebar Webview Provider
 * Handles the UI and communication with the extension
 */
import * as vscode from 'vscode';
export declare class SidebarProvider implements vscode.WebviewViewProvider {
    private readonly _extensionUri;
    private readonly _secrets;
    static readonly viewType = "tadakey2fa";
    private _view?;
    private _systemKey;
    private _vaultData;
    private _isUnlocked;
    private _pendingRecovery;
    constructor(_extensionUri: vscode.Uri, _secrets: vscode.SecretStorage);
    resolveWebviewView(webviewView: vscode.WebviewView, _context: vscode.WebviewViewResolveContext, _token: vscode.CancellationToken): Promise<void>;
    private _initializeState;
    private _sendSetupState;
    private _handleMessage;
    private _handleSetup;
    private _handleUnlock;
    private _sendResetupTotpState;
    private _handleResetupTotp;
    private _handleGetSecurityQuestion;
    private _handleAddKey;
    private _handleViewKey;
    private _handleCopyKey;
    private _handleDeleteKey;
    private _handlePinKey;
    private _handleLock;
    private _saveVaultData;
    private _sendState;
    private _sendKeys;
    private _sendMessage;
    private _getHtmlForWebview;
}
//# sourceMappingURL=SidebarProvider.d.ts.map