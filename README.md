<p align="center">
  <img src="https://raw.githubusercontent.com/bitwarden/brand/main/screenshots/apps-combo-logo.png" alt="Bitwarden" />
</p>
<p align="center">
  <a href="https://github.com/bitwarden/clients/actions/workflows/build-browser.yml?query=branch:main" target="_blank"><img src="https://github.com/bitwarden/clients/actions/workflows/build-browser.yml/badge.svg?branch=main" alt="GitHub Workflow browser build on main" /></a>
  <a href="https://github.com/bitwarden/clients/actions/workflows/build-cli.yml?query=branch:main" target="_blank"><img src="https://github.com/bitwarden/clients/actions/workflows/build-cli.yml/badge.svg?branch=main" alt="GitHub Workflow CLI build on main" /></a>
  <a href="https://github.com/bitwarden/clients/actions/workflows/build-desktop.yml?query=branch:main" target="_blank"><img src="https://github.com/bitwarden/clients/actions/workflows/build-desktop.yml/badge.svg?branch=main" alt="GitHub Workflow desktop build on main" /></a>
  <a href="https://github.com/bitwarden/clients/actions/workflows/build-web.yml?query=branch:main" target="_blank"><img src="https://github.com/bitwarden/clients/actions/workflows/build-web.yml/badge.svg?branch=main" alt="GitHub Workflow web build on main" /></a>
</p>

---

# bitwarden-browser-extension — fork of Bitwarden Client Applications

> **Fork notice:** this repository is a fork of [bitwarden/clients](https://github.com/bitwarden/clients)
> (tracked as upstream `origin`/fetch). It exists for the maintainers of
> [Lebenoa](https://github.com/Lebenoa); it is **not** a feature branch destined for an upstream PR.
> The fork delta is intentionally limited to the browser extension (`apps/browser`) and is summarized
> below. Everything else — including all other client apps and shared libraries — is tracked with
> upstream as-is.

## Fork delta: API Key items in the browser extension

First-class **API Key** items in the Bitwarden browser extension, stored as ordinary Secure Notes.

**No backend changes** — items are plain `SecureNote` ciphers, so they sync cleanly with
Bitwarden servers, Vaultwarden, and every official client:

- A Secure Note whose notes contain the marker line `bitwarden-api-key:v1` **and** exactly one
  hidden custom field named `Key` is presented as an **API Key** item:
  - dedicated create/view/edit flow (Vault → Add → API key),
  - key icon + "API key" label in vault lists (incl. trash),
  - masked secret with reveal/copy, optional dashboard URL.
- Classification is presentation-only and computed from the decrypted cipher. Removing the
  marker (in any client) or renaming the field degrades gracefully to the ordinary Secure Note
  presentation — data is never rewritten.
- Security notes: the secret only ever lives in a hidden/password-type field or the reveal
  toggle; no new permissions, no extra network paths, no clipboard reading; crypto and
  transport use the stock `CipherService` paths.

Changes are confined to `apps/browser` (19 files at the initial feature commit, plus the
`CipherListView` classification fix). The 8-step cross-client validation checklist (create,
list presentation, web-vault shape, edit round-trip, marker-removal fallback, misclassification
guard, sync, lock) has been executed against a Vaultwarden instance with synthetic keys.

> **Upstream tracking:** `git fetch origin` pulls upstream `bitwarden/clients`; rebasing `main`
> onto it keeps the fork current. Re-run the browser extension tests and both webpack builds
> after any rebase.

---

# Bitwarden Client Applications

This repository houses all Bitwarden client applications except the mobile applications ([iOS](https://github.com/bitwarden/ios) | [android](https://github.com/bitwarden/android)).

Please refer to the [Clients section](https://contributing.bitwarden.com/getting-started/clients/) of the [Contributing Documentation](https://contributing.bitwarden.com/) for build instructions, recommended tooling, code style tips, and lots of other great information to get you started.

## Related projects:

- [bitwarden/server](https://github.com/bitwarden/server): The core infrastructure backend (API, database, Docker, etc).
- [bitwarden/ios](https://github.com/bitwarden/ios): Bitwarden iOS Password Manager & Authenticator apps.
- [bitwarden/android](https://github.com/bitwarden/android): Bitwarden Android Password Manager & Authenticator apps.
- [bitwarden/directory-connector](https://github.com/bitwarden/directory-connector): A tool for syncing a directory (AD, LDAP, Azure, G Suite, Okta) to an organization.

# We're Hiring!

Interested in contributing in a big way? Consider joining our team! We're hiring for many positions. Please take a look at our [Careers page](https://bitwarden.com/careers/) to see what opportunities are [currently open](https://bitwarden.com/careers/#open-positions) as well as what it's like to work at Bitwarden.

# Contribute

Code contributions are welcome! Please commit any pull requests against the `main` branch. Learn more about how to contribute by reading the [Contributing Guidelines](https://contributing.bitwarden.com/contributing/). Check out the [Contributing Documentation](https://contributing.bitwarden.com/) for how to get started with your first contribution.

Security audits and feedback are welcome. Please open an issue or email us privately if the report is sensitive in nature. You can read our security policy in the [`SECURITY.md`](SECURITY.md) file.
