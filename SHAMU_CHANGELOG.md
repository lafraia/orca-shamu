# Orca Shamu changelog

Shamu changes are tracked separately from [upstream Orca releases](https://github.com/stablyai/orca/releases). The numeric base always matches the upstream release actually merged into Shamu. The `shamu.N` suffix identifies a Shamu distribution on that base.

## Unreleased

Upstream: `1.4.248`
Upstream commit: `965978bc78bf03a6a43187c1ed28fcffe0e01bb5`

### Upstream integrations

- Merged upstream [v1.4.248](https://github.com/stablyai/orca/releases/tag/v1.4.248) over the previous v1.4.247 base in merge commit `ff194e6730c`. See the [upstream comparison](https://github.com/stablyai/orca/compare/v1.4.247...v1.4.248).
- Track the temporary native autocomplete positioning fix against [upstream issue #38234](https://github.com/stablyai/orca/issues/38234). Removal criteria remain in `UPSTREAM_PATCHES.md`.

### Shamu changes

- Highlight the first typed mention match, omit bots' internal workspaces, and keep suggestions owned by the focused composer and beneath floating chats.
- Show recalled memory as a quiet, collapsed brain row beneath the turn status, separate from the user's message, and link known notification IDs to their original bot communication.
- Identify the macOS menu bar item as Orca Shamu in its menu heading, open action and activity tooltip, including development instances and menu rebuilds.
- Present recalled memory as readable notes with sources, selection reasons, exclusions and the additional context budget. Render saved bot links and legacy bot IDs as named chat references, and guide new memory authoring toward English.
- Link known bot names in durable memory notes, source labels and recalled memory to their permanent chats, closing the memory panel on navigation and preserving the saved text.
- Add a model picker to each bot chat header, sharing the native session catalog, confirmed options and persisted per-session selection without replacing the conversation.
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

The initial Shamu work is currently local on `lafraia/project-channels`. Add the actual merged Shamu PR links here as they become available. Do not treat local commits or preview tags as merged PRs or published releases.

## Local preview history

`1.4.248-shamu.1` through `1.4.248-shamu.11` were local development checkpoints. They have no published GitHub distribution release. Keep those existing tags and commits intact; do not reuse them for a different build. The next distribution on this upstream base must advance beyond revision 11 when explicitly requested. New work stays in **Unreleased** until that request.
