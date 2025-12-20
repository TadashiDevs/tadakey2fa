/**
 * TadaKey 2FA - VS Code Extension
 * Local secure vault with TOTP two-factor authentication
 */

import * as vscode from 'vscode';
import { SidebarProvider } from './SidebarProvider';

export function activate(context: vscode.ExtensionContext) {
    console.log('TadaKey 2FA is now active!');

    // Initialize SecretStorage and register Sidebar Provider
    const sidebarProvider = new SidebarProvider(context.extensionUri, context.secrets);

    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(SidebarProvider.viewType, sidebarProvider, {
            webviewOptions: {
                retainContextWhenHidden: true
            }
        })
    );
}

export function deactivate() {
    console.log('TadaKey 2FA has been deactivated.');
}
