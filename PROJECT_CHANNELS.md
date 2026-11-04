# Orca Shamu

Based on the upstream `v1.4.248` release. Shamu is a separate desktop interface connected to the primary Orca through its existing paired runtime control transport. Keep the primary process running; its window can stay hidden or minimized. The primary Orca continues to own the agents, native sessions, execution directories, permission policies and original transcripts. Shamu reads and controls those same session IDs.

## Connect once

1. Keep the installed Orca open. In **Settings → Remote Orca Servers**, create a **New Link** for **This computer**.
2. Open **Orca Shamu.app**, paste that access link into **Primary Orca access link** and connect.
3. Shamu loads the primary Orca's repositories, worktrees, folder workspaces and native Chat tabs, including side chats in the floating workspace. A connection bar provides reconnect and link renewal when contact is lost.
4. Choose **Import interface settings** in that bar to import the primary's fonts, sizes, theme, chat appearance and side panel preferences. The primary settings are read only; Shamu saves the selected appearance fields through its own settings service. Accounts, permissions, trusted directories and environment selection are excluded. Run it again after changing the primary's appearance.

The link must target loopback. The native access-link flow authorizes the client without exposing a LAN service. Credentials stay in Orca's existing runtime environment registry; `shamu-primary.json` contains only the environment ID and pinned public host key. Renewed links must belong to that same primary host. Never paste an access link into logs, issues or source files.

Shamu uses its own bundle ID, Keychain service and application profile. No production profile is copied or opened by a second writer. The client skips local provider account initialization, auth synchronization, quota polling and managed agent hook installation. Its project organization and drafts are local to that interface, while session execution and controls remain on the primary Orca. Closing Shamu leaves the primary sessions intact. If the primary Orca becomes unavailable, reconnect it; Shamu does not substitute local sessions for project participants.

## Use

The top navigation uses **Bots** with a bot icon. Bots have a saved name and optional instructions, independent of any existing conversation. Workspaces retain Orca's existing project terminology.

1. Choose **New bot**, enter a name and optional instructions, then **Create bot**. The bot opens its own native Chat immediately, with the standard model, permissions, attachments and history controls. No existing conversation is required. Opening an existing empty bot provisions its chat the same way.
2. Each bot gets a permanent folder workspace in **Bots** on the primary Orca, stored at `~/orca/bots/bot-<stable-id>`. **Workspace** opens its original tab. Returning to a bot reuses the same session, history and native draft.
3. Use the gear on the right to open **Bot settings**, edit its identity and view its **Bot folder**. The folder's `bot.json` records its name and instructions. Generated `AGENTS.md` and `CLAUDE.md` direct the provider to read that configuration. Existing instruction files are never overwritten. The bot inherits the primary's Claude default or uses Codex and retains normal session permission controls.
4. **Conversations** keeps optional links for future bot control. The bot's own chat stays fixed. To retain the existing shared conversation workflow, right-click a native Chat tab and choose **Create bot from chat…**. This preserves its original directory, session and prior history instead of allocating a new chat.

Autonomous control of other conversations and routines are future capabilities. Bot creation opens an idle native session without sending a prompt or starting a paid turn.

For promoted shared conversations, unmentioned messages go to the default participant; `@handle` addresses that participant and `@all` explicitly addresses everyone. Each native session belongs to one project channel. Participants keep separate provider sessions and original directories; their shared conversation supplies bounded context to each explicit send. Busy agents must finish or answer their native permission request before accepting another project message. Native approval and question cards remain actionable in the project.

The main participant's loaded history appears as **Earlier conversation**. **Load earlier conversation** pages older native history without losing its user questions. Other participants' prior history is not imported. New replies enter the shared chat only when the native turn can be attributed to a send from that channel; messages sent directly in the original tab remain there.

**Open chat** returns to the original tab and its execution host. Unlinking a conversation does not stop its process or erase history. Removing the final link keeps the bot and its instructions saved. Closing a source tab can make it unavailable to the project; the project retains its existing messages. Terminal-backed agents must first use the existing **Continue with Chat Agent** flow.

## Data and recovery

Bot identities, permanent workspace/session references, instructions, optional conversation links and promoted shared transcripts live in `project-channels.json` in the active Shamu desktop profile. The permanent bot folder holds configuration and working files. Native messages, provider history and native drafts remain in the primary Orca's existing persistent session storage. Writes are durable, mode `0600`, serialized and checked against a revision. Unreadable or newer files are never reset to an empty project list.

Provisioning records the canonical native create operation and session identity before dispatch. A failed or lost create reply leaves a retryable bot with that same operation; reopening cannot allocate another native session. The permanent conversation and storage path cannot be replaced through the link editor. Removing a bot profile does not remove its folder, native session or history.

Draft edits are kept in memory and saved outside the keystroke path. A renderer-unload checkpoint protects text typed immediately before reload; it cannot replace a different draft already saved by another window. Message and delivery identities are saved before submission. Reload does not retry a pending or uncertain send.

The desktop owns the project list. Existing native sessions on supported paired runtimes retain their stamped host; this preview does not add channel sharing or a channel interface to mobile/web clients. Those clients fall back to their workspace view. Permanent bot chats reuse the full native composer; promoted shared conversations retain their simpler text composer.

## Memory

Normal use opens the packaged Shamu without Vite. Use live reload only while editing the interface. Its server loads source modules on demand instead of prebuilding all desktop and web entries.

Shamu keeps one recent hidden terminal view warm and parks other restorable views sooner. Live agents, PTYs, history and permissions stay on the primary; unrestorable, visible and starting views retain their existing safeguards. A returning view remounts from the same session. Session search, agent state rule updates and hibernation decisions stay on the primary instead of running again in the client.

Both Electron apps still have independent main, renderer and GPU processes. Their remaining memory is not eliminated by sharing agent sessions.

## Build

### Local interface development

Close Shamu, keep the primary Orca running, then run `pnpm dev:shamu` from this checkout. The launcher starts Vite on literal loopback and opens the same installed Shamu executable, profile and saved primary connection. Its connection bar shows **Live reload**. Saving React or CSS files updates that interface without packaging another release. Some module changes can reload the document; saved drafts and native sessions remain in their existing owners.

Quit Shamu to stop this development server. Opening the installed app normally uses its bundled interface again. Changes to main, preload or the native executable still require rebuilding and restarting Shamu. This mode keeps version `1.4.248-shamu.1` and the existing update block. It adds a local Vite process while active.

The live server proves a private per-launch token before its document is loaded. The token stays in process memory/environment, never in the URL or `out/shamu-live.json`; that file records only the launcher PID, local URL and checkout. The usual window IDs, navigation containment, preload, sandbox and context isolation remain in force. The launcher accepts `--app /path/to/Shamu/executable` for another installed bundle location.

### Package the application

Use the pnpm version pinned in `package.json` (this release uses 12.14.0). Install root and `mobile/` dependencies with frozen lockfiles, then run:

```sh
node config/scripts/build-project-channels-mac.mjs
```

The app is generated under `dist/project-channels/mac-arm64/Orca Shamu.app` on Apple Silicon. Nothing is installed over `/Applications/Orca.app`. Its bundle ID is `com.lafraia.orca-shamu` and its default profile is `~/Library/Application Support/Orca Shamu`. The internal executable remains `Orca` for compatibility with the bundled CLI launcher. The launcher uses local ad hoc signing rather than an installed distribution certificate; macOS permissions remain subject to that different signature.

The packaged version is `<upstream>-shamu.<revision>`, currently `1.4.248-shamu.1`. `config/shamu-release.json` records the exact upstream tag and commit, plus the independent Shamu revision. Keep `package.json.version` equal to upstream. After merging an upstream tag, run `pnpm shamu:version sync` to reset the revision to 1. For another Shamu release on the same base, run `pnpm shamu:version bump`. Inspect it with `pnpm shamu:version`. Shamu release tags use `shamu/v<upstream>-shamu.<revision>`. The builder validates this metadata and embeds it in the app. Official automatic and manual updates remain blocked; publishing an independent signed update feed is separate from creating local versioned builds. This local preview is not a notarized public installer. Like upstream local builds, it omits the multi-platform `orcad-template` used to deploy new remote runtimes. The connection to the existing primary desktop uses upstream's paired control transport.

## Updating the fork

Keep the upstream release tags and the project-channel changes on separate branches. Fetch tags from the SSH `upstream` remote, create an upgrade branch from this feature branch and merge the chosen release tag. Resolve changes in the small integration points (sidebar, tab menu, preload, IPC registration and updater guards), then install the newly pinned dependency versions with frozen lockfiles. Run the channel tests, related integration tests, changed-code quality gate and hidden Electron journeys before rebuilding the app. The preview version follows the merged upstream `package.json` automatically.

Keep the last working app until the new package passes an isolated startup check. Official automatic updates remain disabled in the preview so an upstream installer cannot silently remove the project interface.

## Validation

Targeted tests cover recipients, session isolation, scoped native replies, older history, durable storage, revision conflicts, failed/uncertain delivery and draft recovery. Hidden Electron/CDP journeys use isolated profiles and a synthetic Claude protocol process, covering promotion from both worktrees and folder workspaces, two participants, named routing, draft recovery and reload without duplicate replies. They do not call a paid model or use production conversations.

The two-instance journeys connect through the Shamu UI using a real loopback access link, including a floating side chat. They assert that the original session ID is retained, a message appears in both apps, Stop reaches the primary provider process, reload does not duplicate a reply, the client has no local native ownership and the primary remains the native owner after the client closes. Connection tests cover unreadable bindings, expired links, host-key mismatch, private binding permissions and recovery after a failed hydration. Regression tests cover floating ownership and a binding arriving after an active inventory stream. Appearance tests cover the allowlist, runtime identity checks and unreadable profile state.

Delivery checks also cover a host rejecting a submission after transport acknowledgement, an unknown dispatch result, a late acknowledgement arriving after the journal's refusal and an orphaned send expiring while the reader stays unchanged after reload. The journal remains authoritative; none of these transitions automatically resends the message.

## Bot mentions

In any structured native chat in Shamu, type `@` and select a bot from the Bots group. File suggestions remain in the Files group. Selected bot pills retain their stable identity when drafts are saved and restored. A literal pasted mention or an assistant reply does not dispatch anything.

After the source message is accepted, Shamu delivers the explicit mention to each selected bot's own permanent chat, including the source label, session and workspace reference. Replies stay in the bot chat. Busy bots use the native queued-send policy. Delivery identifiers and outcomes are stored privately in the profile's `bot-mentions` directory before sending. Reloading or retrying a notification never automatically resends an ambiguous delivery. The notification offers access to the bot chat, or a retry if the notification request could not complete.

See `UPSTREAM_PATCHES.md` for temporary upstream fixes and their removal criteria.
