<p align="center">
  <img src="resources/tadakey2fa-marketplace.png" alt="TadaKey 2FA Logo" width="128">
</p>

<h1 align="center">TadaKey 2FA</h1>

<p align="center">
  <strong>Local digital vault for code editors with two-factor authentication</strong>
</p>

<p align="center">
  <a href="https://github.com/TadashiDevs/tadakey2fa/blob/main/LICENSE">
    <img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License">
  </a>
  <a href="https://github.com/TadashiDevs/tadakey2fa">
    <img src="https://img.shields.io/github/stars/TadashiDevs/tadakey2fa?style=social" alt="Stars">
  </a>
</p>


## Preview

<p align="center">
  <img src="http://raw.githubusercontent.com/TadashiDevs/tadakey2fa/main/resources/tadakey2fa-demostration.gif" alt="TadaKey 2FA Demostration" width="128">
</p>


## Features

- 🔐 **2FA Protected Vault** - TOTP authentication required to unlock
- 🔑 **API Keys** - Store tokens and secrets securely
- 👤 **Logins** - Save site, username, and password combinations
- 📝 **Secure Notes** - Store SSH keys, JSON configs, recovery codes
- 🔍 **Search & Filter** - Quickly find entries by name or username
- ⭐ **Pin Favorites** - Keep frequently used items at the top
- 🎨 **Theme Support** - Adapts to VS Code light/dark themes
- 📋 **One-Click Copy** - Copy secrets to clipboard instantly
- ⏱️ **Auto-Hide** - Revealed secrets hide after 15 seconds

## Installation

1. Open VS Code
2. Go to Extensions (`Ctrl+Shift+X`)
3. Search for "TadaKey 2FA"
4. Click Install

## Getting Started

1. Click the TadaKey icon in the Activity Bar
2. Set up your security question and answer
3. Scan the QR code with your authenticator app (Google Authenticator, Authy, etc.)
4. Enter the 6-digit code to activate your vault
5. Start adding your secrets!

## Security

- **AES-256 Encryption** - All secrets are encrypted locally
- **TOTP Authentication** - Standard 2FA protocol
- **No Cloud Storage** - Everything stays on your machine
- **VS Code SecretStorage** - Uses VS Code's secure storage API

## Entry Types

| Type | Fields | Use Case |
|------|--------|----------|
| 🔑 API Key | Name, Secret | API tokens, environment variables |
| 👤 Login | Site, Username, Password | Website credentials |
| 📝 Note | Title, Content | SSH keys, JSON, multi-line text |

## Recovery

Lost your 2FA device? Use your security question to recover access and set up a new authenticator.

## 💬 Feedback & Support

If you find this extension useful, please consider:

⭐ **Leave a star** - Help others discover this extension!

💬 **Write a review** - Your feedback helps us improve

If you have any theme requests or issues, please [open an issue](https://github.com/TadashiDevs/tadakey2fa/issues/new).


## 📄 License

[MIT](https://github.com/TadashiDevs/tadakey2fa/blob/main/LICENSE) © [TadashiDevs](https://github.com/TadashiDevs)
