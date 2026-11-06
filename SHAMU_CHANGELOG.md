# Orca Shamu changelog

Shamu changes are tracked separately from [upstream Orca releases](https://github.com/stablyai/orca/releases). The numeric base always matches the upstream release actually merged into Shamu. The `shamu.N` suffix identifies a Shamu distribution on that base.

## Unreleased

Upstream: `1.4.251`
Upstream commit: `a162e08b29b2883b02d8a0dfcc99e26c80b2cfe7`

### Upstream integrations

- Merged upstream [v1.4.251](https://github.com/stablyai/orca/releases/tag/v1.4.251) at `a162e08b29b2883b02d8a0dfcc99e26c80b2cfe7` in merge `4d41b43d6ee`, adapting Shamu to the reorganized scripts and native chat link context while preserving bot consultations and navigation. See [the upstream comparison](https://github.com/stablyai/orca/compare/v1.4.250...v1.4.251). The new base starts at Shamu revision 1 and remains Unreleased.

- Merged upstream [v1.4.250](https://github.com/stablyai/orca/releases/tag/v1.4.250) at `b98a0fba16561fadc06868fe3e8710781d705efd` in local merge `29e4a5b9c34`, adapting Shamu imports to the reorganized modules. See [the upstream comparison](https://github.com/stablyai/orca/compare/v1.4.248...v1.4.250). The new base starts at Shamu revision 1 and remains Unreleased.

- Merged upstream [v1.4.248](https://github.com/stablyai/orca/releases/tag/v1.4.248) over the previous v1.4.247 base in merge commit `ff194e6730c`. See the [upstream comparison](https://github.com/stablyai/orca/compare/v1.4.247...v1.4.248).
- Retire the temporary autocomplete positioning workaround after validating the fixes included in `v1.4.250`. Keep Shamu menu selection, focus ownership and floating chat layers. The regression evidence and upstream references are recorded in `UPSTREAM_PATCHES.md`. Imported publishing workflows retain their disabled fork settings; this import adds no new workflow files.

### Shamu changes

- Complete bot provisioning when a successful host reply omits its optional tab ID, retaining the persisted tab identity.
- Read project-channel agent controllers through stable callbacks that follow committed state, avoiding speculative render-time ref mutations.
- Invalidate Vault operations when panel visibility commits, keeping render work free of ref mutations and preventing late results after closure.
- Scope bot navigation and prompt preparation to the Shamu client, preserve upstream composer drafts without the optional bot bridge, and register bot CLI dispatch and host ownership. Align startup and release fixtures with the current APIs and test runner.
- Keep shared bot communication and routine sorting compatible with mobile Hermes, include Shamu dependencies in native composite typechecks and restore the fingerprint job's checkout before action cleanup.
- Repair the upstream CI workflow's dangling timeout-check reference and support the first fork sync when trusted default-branch reporting tools or benchmark baselines do not yet exist. Keep unavailable benchmark comparisons explicit.
- Adapt Shamu to the upstream validation rules: declare the bot and Vault interface copy in the English and Portuguese catalogs, regenerate the bundled skill catalog, preserve typed bot references and prevent synchronous Windows Vault permission rewrites while retaining fail-closed access checks.
- Clarify the bot-pair conversation with a fixed participant capsule, named message bubbles and avatars beside each message, while preserving chronology, attachments and original-chat navigation.
- Integrate consulted chats into the originating answer with grouped bot avatars, clickable exchanges and native reply, queue and human-input status, without marking those peer chats as read.
- Keep successful bot mentions quiet by removing their sending and confirmation toasts, while retaining delivery warnings and retryable errors.
- Return the responding bot's canonical name and chat reference with consultation results, and bundle an on-demand reply skill for concise source attribution, evidence and qualified estimates across configured providers.
- Keep bot-chat mentions with the coordinator, add attributed first-person peer consultations through `bots ask` and `bots ask-result`, and read the requested native turn's result without forwarding the user's message or copying source history into the peer prompt.
- Place unread dots on the lower-right corner of bot avatars, including pinned bots, and define their blue theme color. Remove idle/completed status dots so only new unread content lights the dot. Keep working, waiting and outcome glyphs distinct.
- Accept external prompts through `bots send` and read their own replies through `bots result`, with stable request IDs, explicit profile selection, native queueing and persistent Received from CLI cards that retain the original prompt.
- Replace the robot icon and tinted tile with a Bloub-inspired colored SVG avatar, shape and expression settings, motion tied to live bot activity, and circular photo uploads. Ship the adapted geometry's MIT attribution with the app.
- Keep bot and group action menus quiet until hover or keyboard focus, remove group counts, and persist drag or keyboard reordering of groups and bots. Reuse workspace activity and attention icons from each bot's live primary session, including when its chat is closed.
- Unlock Vault through the OS keychain when the Shamu window opens and revoke keys and pending uses when it closes or hides, independently of the primary Orca. Keep legacy Vault enrollment behind one verified master-password unlock.
- Add an encrypted Vault beside Memory with a master password, OS keychain protection, per-bot credentials, guarded clipboard access and one-command approvals that keep credential values out of agent responses. See `SHAMU_VAULT.md` for security boundaries and research.
- Highlight the first typed mention match, omit bots' internal workspaces, and keep suggestions owned by the focused composer and beneath floating chats.
- Show recalled memory as a quiet, collapsed brain row beneath the turn status, separate from the user's message, and link known notification IDs to their original bot communication.
- Identify the macOS menu bar item as Orca Shamu in its menu heading, open action and activity tooltip, including development instances and menu rebuilds.
- Present recalled memory as readable notes with sources, selection reasons, exclusions and the additional context budget. Render saved bot links and legacy bot IDs as named chat references, and guide new memory authoring toward English.
- Link known bot names in durable memory notes, source labels and recalled memory to their permanent chats, closing the memory panel on navigation and preserving the saved text.
- Keep bot model selection only in the composer footer, using the native session catalog, confirmed options and persisted per-session selection without replacing the conversation.
- Extend `@` suggestions with host-qualified workspace, project and issue references, persistent clickable pills and task-source issue search; leave bare `@` queries unselected and unify pointer and keyboard highlighting.
- Identify the independent open source fork, its maintainer and canonical repository in Shamu settings, with upstream credit, MIT license links and a qualified warranty and liability notice.
- Keep the Shamu titlebar, accessible app name and window title branded as `Orca Shamu`, distinct from the primary Orca.
- Share the primary Orca's live sessions through a paired local frontend, preserving native session identity and independent interface preferences.
- Add permanent bot chats, bot identities and avatars, memory controls, routines, authorized bot creation and contextual mentions.
- Keep bot mentions recognizable and clickable in the composer and transcript.
- Show internal bot communication as compact native activity rows with a separate read-only conversation view.
- Identify native messages from a bot by its saved name in workspace chats and open the separate bot/workspace exchange, with links to both original conversations.
- Organize bots with prominent pinned entries, editable group names and persistent group order.
- Use small static unread dots on individual bots without repeating notifications on group headers or navigation tabs.
- Move Shamu settings into their own Settings section and connection status into the statusbar; preserve native window dragging.
- Keep official updates disabled and provide opt-in local frontend development without replacing the primary session owner.
- Preserve the fork relationship under `lafraia/orca-shamu`, protect `main`, require English commit messages and close distributions only on explicit request.

### Pull requests

- [#3](https://github.com/lafraia/orca-shamu/pull/3): import the unmodified stable Orca v1.4.251 source.
- [#2](https://github.com/lafraia/orca-shamu/pull/2): integrate Shamu's bots, memory, Vault and conversation features on that base.

Local preview tags are development checkpoints, not published distributions.

## Local preview history

`1.4.248-shamu.1` through `1.4.248-shamu.11` were local development checkpoints. They have no published GitHub distribution release. Keep those existing tags and commits intact; do not reuse them for a different build. Those revisions belong to the previous `v1.4.248` base. The imported `v1.4.250` base starts its own revision sequence at 1. New work stays in **Unreleased** until a distribution is explicitly requested.
