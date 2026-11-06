# Shamu Vault

Vault is beside Memory in each bot conversation. It stores passwords and API tokens locally in the Shamu profile, outside bot workspaces and memory. Credentials belong to a bot and agent use is off by default. The UI supports creating, replacing, generating and deleting credentials, copying after master-password verification and changing the master password.

Create a master password of at least 15 characters. Use a long unique passphrase and retain it in a trusted password manager. There is no reset or recovery key. Losing the password or the device's OS keychain makes this Vault unrecoverable. This version has no portable export or remote-host synchronization.

## Protection

The design follows Falconfolio's authenticated encryption, wrapped data key, main-process session gate and cancellation generations. Its financial data and key files are never read or imported.

- A random 256-bit data key seals the index and each credential with AES-256-GCM. Every seal uses a fresh 96-bit nonce and a 128-bit authentication tag. Authenticated data binds the profile, Vault ID, record ID, owning bot and credential generation. Usernames, sites, titles, grants and variable names are inside the encrypted index. Opaque IDs, entry count, ciphertext sizes, KDF salt and format metadata remain visible on disk.
- A master-password key, derived with Node's asynchronous scrypt (N=131072, r=8, p=1, 16-byte random salt, 256 MiB memory ceiling), wraps the data key. The password is normalized to NFC. Electron's existing guarded OS SecretStore then seals that wrapped key. Both protections are required, with no raw-key file or plaintext fallback. The KDF parameters are fixed and validated before derivation.
- Linux `basic_text`, unavailable OS encryption and reported protection gaps disable the Vault. This reuses upstream's SecretStore capability checks rather than weakening existing credential behavior. The current Electron 43 API is synchronous at the OS boundary; upgrading the host's shared SecretStore to the newer asynchronous API is a separate upstream concern.
- `shamu-vault/vault.json` is the only persisted Vault file. Durable atomic writes reuse Orca's secure-file implementation. POSIX uses a 0700 directory and 0600 file; Windows uses the existing restricted-file ACL implementation. Reads reject symbolic links, nonregular files, multiple hard links, unsafe ownership/permissions, oversized data and unreadable or damaged envelopes. A failed read never initializes or replaces existing data.
- The key and metadata exist only in main-process memory while unlocked. Passwords remain individually encrypted until used. Explicit lock, five minutes without human Vault activity, system idle, screen lock, sleep, shutdown, window hide/minimize/close, renderer reload/crash and quit invalidate the session. Pending authentication and approval cannot publish a key or execute after that invalidation. Agents do not renew the timeout.
- Closing the panel clears its forms and metadata. An unlocked session remains available for up to five minutes so an agent can request use after the owner returns to chat. Use **Lock Vault** to end it immediately. Closing during an operation cancels that session.
- Copying requires the master password again and happens in the main process. Only the chosen value enters the OS clipboard. It is cleared on lock or after 30 seconds if unchanged. Clipboard managers can retain history. The API never returns a stored credential to the renderer, CLI, model, memory or conversation journal.

## Agent access

The owner enables **Allow this bot to request use** on an individual credential and chooses its environment variable. The local authenticated `orca bots vault` command can list granted references, request a command and inspect its result. It cannot create, unlock, copy, reveal, remove or approve credentials. Paired-device RPC callers are rejected. The desktop IPC accepts only the trusted main renderer's main frame.

A run requires an existing bot, a user-source item from its conversation, a request UUID, a granted credential, an absolute executable path and bounded arguments. The pending request is bound to the unlocked session and Vault revision, expires after two minutes, and displays the executable, every argument and working directory in Vault. Approval then opens a native confirmation that discloses the recipient program and environment variable. The default is Cancel. A request is consumed before awaiting confirmation, preventing duplicate approval. After confirmation the service revalidates the session, revision, grant and executable/directory identity.

The process receives one credential in an environment variable, with a minimal inherited environment, no implicit shell, discarded stdout/stderr and a 30 second timeout. The caller receives state and exit code only. A UUID cannot be reused with a changed payload. Pending requests, completed results and command arguments are bounded and stay in main-process memory. Lock clears them and requests termination of running commands. No credential is copied to a remote Orca host or a mobile client.

## Threat boundary and limits

This protects stored data from disclosure by copying the profile alone and detects authenticated-record tampering. It does not make an unlocked or compromised computer safe. OS encryption has different guarantees across platforms. A process that can inspect Orca memory, control the user account, change the application or capture input may obtain credentials. JavaScript strings and clipboard history cannot be reliably wiped. Buffers holding keys, KDF inputs and plaintext are cleared where possible; this is best effort, not secure-memory isolation.

An approved executable receives the real credential. It and its descendants can save or transmit it, including through encodings. Discarding output prevents accidental transcript disclosure; it does not sandbox that executable or promise containment of a deliberately malicious approved command. File identity checks reduce replacement mistakes but do not defeat hostile same-user filesystem races. Use trusted binaries and narrow-scope tokens. Termination is best effort and cannot revoke a credential already handed to a program.

Whole-file rollback to an older authentic revision is not detected across restarts. Vault is not a versioned backup system and cannot recover a deleted file. Portable backups, hardware-bound per-use keys, native secure-memory handling and remote secret brokers require further design before adding those capabilities.

## Research

- [Electron safeStorage](https://www.electronjs.org/docs/latest/api/safe-storage): platform guarantees, weak Linux backend and API lifecycle.
- [OWASP Cryptographic Storage](https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html): authenticated encryption and random keys/nonces.
- [OWASP Password Storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html#scrypt): scrypt parameters when Argon2id is unavailable. Node's built-in scrypt avoids adding a native dependency; this is a derived key, not storage of the master password.
- [Node crypto](https://nodejs.org/api/crypto.html#cryptoscryptpassword-salt-keylen-options-callback): asynchronous derivation, memory limits, random generation and authenticated cipher APIs.
- [OWASP AI Agent Security](https://cheatsheetseries.owasp.org/cheatsheets/AI_Agent_Security_Cheat_Sheet.html): independent authorization, exact-action approval, least privilege and exclusion of secrets from model memory.

## Validation

The local checks cover encryption at rest, wrong passwords, altered and swapped records, profile/bot isolation, weak OS storage, cancelled authentication and approvals, permission changes, stale revisions, source admission and remote/subframe rejection. A real subprocess verifies that an approved credential reaches only its environment, with its output discarded. The hidden paired-Electron scenario exercises management, reauthentication, lock, persistence, deletion and the actual `bots vault` CLI against a disposable profile. Its OS encryption provider and clipboard are isolated test replacements; no production Vault, system clipboard or real credential is used.

Main, renderer and CLI typechecks, scoped lint and 29 focused unit/regression checks pass. The broader E2E TypeScript project retains 47 existing errors in cloud dependencies, mobile stubs and unrelated specs; the Vault spec has no reported error. UI screenshots cover light and dark mode. The available test runtime is Electron 43.8.4; the imported upstream declares 43.8.6, which still needs dependency synchronization before distribution. This feature does not install, reload or publish an application.
