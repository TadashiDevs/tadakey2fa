# Changelog

All notable changes to this project will be documented in this file.

## [1.0.0] - 2025-12-19

### Added
- **2FA Protected Vault**: Secure local storage with TOTP authentication
- **Three Entry Types**:
  - 🔑 API Keys - Store secrets and tokens
  - 👤 Logins - Store site, username, and password
  - 📝 Notes - Store multi-line text, JSON, SSH keys
- **Security Features**:
  - AES-256 encryption for all stored values
  - TOTP two-factor authentication
  - Security question for account recovery
  - Auto-hide revealed secrets after 15 seconds
- **Search & Filter**: Quick search bar and filter chips (All/Keys/Logins/Notes)
- **Pin/Favorites**: Pin frequently used entries to the top
- **VS Code Theme Support**: UI adapts to light/dark themes
- **Copy to Clipboard**: One-click copy for any secret
- **Delete Confirmation**: Modal dialog to prevent accidental deletion
