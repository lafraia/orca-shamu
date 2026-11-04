# Orca Shamu

Based on the upstream `v1.4.247` release. Shamu is a separate desktop interface connected to the primary Orca through its existing paired runtime control transport. Keep the primary process running; its window can stay hidden or minimized. The primary Orca continues to own the agents, native sessions, execution directories, permission policies and original transcripts. Shamu reads and controls those same session IDs.

## Connect once

1. Keep the installed Orca open. In **Settings → Remote Orca Servers**, create a **New Link** for **This computer**.
2. Open **Orca Shamu.app**, paste that access link into **Primary Orca access link** and connect.
3. Shamu loads the primary Orca's repositories, worktrees, folder workspaces and native Chat tabs, including side chats in the floating workspace. A connection bar provides reconnect and link renewal when contact is lost.
4. Choose **Import interface settings** in that bar to import the primary's fonts, sizes, theme, chat appearance and side panel preferences. The primary settings are read only; Shamu saves the selected appearance fields through its own settings service. Accounts, permissions, trusted directories and environment selection are excluded. Run it again after changing the primary's appearance.

The link must target loopback. The native access-link flow authorizes the client without exposing a LAN service. Credentials stay in Orca's existing runtime environment registry; `shamu-primary.json` contains only the environment ID and pinned public host key. Renewed links must belong to that same primary host. Never paste an access link into logs, issues or source files.

Shamu uses its own bundle ID, Keychain service and application profile. No production profile is copied or opened by a second writer. The client skips local provider account initialization, auth synchronization, quota polling and managed agent hook installation. Its project organization and drafts are local to that interface, while session execution and controls remain on the primary Orca. Closing Shamu leaves the primary sessions intact. If the primary Orca becomes unavailable, reconnect it; Shamu does not substitute local sessions for project participants.

## Use

The top navigation uses **Teams** with a group icon for shared agent conversations. Workspaces retain Orca's existing project terminology.

1. Open **Workspaces**, then right-click a native Chat tab and choose **Use as main team chat…**. Folder workspaces, Git worktrees and floating side chats use the same flow.
2. Choose a team name, agent display name and unique `@handle`.
3. Open **Agents** in the team to add other existing native Chat tabs, rename their team identities or choose the main participant.
4. Unmentioned messages go to the main participant. `@handle` addresses that participant; `@all` explicitly addresses everyone. Only user sends dispatch turns. Agent output never starts a response loop.

Each native session belongs to one project channel. Participants keep separate provider sessions and original directories; their shared conversation supplies bounded context to each explicit send. Busy agents must finish or answer their native permission request before accepting another project message. Native approval and question cards remain actionable in the project.

The main participant's loaded history appears as **Earlier conversation**. **Load earlier conversation** pages older native history without losing its user questions. Other participants' prior history is not imported. New replies enter the shared chat only when the native turn can be attributed to a send from that channel; messages sent directly in the original tab remain there.

**Open chat** returns to the original tab and its execution host. Removing a participant does not stop its process or erase history. Closing a source tab can make it unavailable to the project; the project retains its existing messages. Terminal-backed agents must first use the existing **Continue with Chat Agent** flow.

## Data and recovery

Channels, participants, aliases, delivery identities, history and drafts live in `project-channels.json` in the active desktop profile. Writes are durable, mode `0600`, serialized and checked against a revision. Unreadable or newer files are never reset to an empty project list.

Draft edits are kept in memory and saved outside the keystroke path. A renderer-unload checkpoint protects text typed immediately before reload; it cannot replace a different draft already saved by another window. Message and delivery identities are saved before submission. Reload does not retry a pending or uncertain send.

The desktop owns the project list. Existing native sessions on supported paired runtimes retain their stamped host; this preview does not add channel sharing or a channel interface to mobile/web clients. Those clients fall back to their workspace view. Attachments and project-driven creation of fresh agents remain available through the original Chat tabs rather than the shared composer.

## Build

### Local interface development

Close Shamu, keep the primary Orca running, then run `pnpm dev:shamu` from this checkout. The launcher starts Vite on literal loopback and opens the same installed Shamu executable, profile and saved primary connection. Its connection bar shows **Live reload**. Saving React or CSS files updates that interface without packaging another release. Some module changes can reload the document; saved drafts and native sessions remain in their existing owners.

Quit Shamu to stop this development server. Opening the installed app normally uses its bundled interface again. Changes to main, preload or the native executable still require rebuilding and restarting Shamu. This mode keeps version `1.4.247-shamu.2` and the existing update block. It adds a local Vite process while active.

The live server proves a private per-launch token before its document is loaded. The token stays in process memory/environment, never in the URL or `out/shamu-live.json`; that file records only the launcher PID, local URL and checkout. The usual window IDs, navigation containment, preload, sandbox and context isolation remain in force. The launcher accepts `--app /path/to/Shamu/executable` for another installed bundle location.

### Package the application

Use the pnpm version pinned in `package.json` (this release uses 12.14.0). Install root and `mobile/` dependencies with frozen lockfiles, then run:

```sh
node config/scripts/build-project-channels-mac.mjs
```

The app is generated under `dist/project-channels/mac-arm64/Orca Shamu.app` on Apple Silicon. Nothing is installed over `/Applications/Orca.app`. Its bundle ID is `com.lafraia.orca-shamu` and its default profile is `~/Library/Application Support/Orca Shamu`. The internal executable remains `Orca` for compatibility with the bundled CLI launcher. The launcher uses local ad hoc signing rather than an installed distribution certificate; macOS permissions remain subject to that different signature.

The version remains `1.4.247-shamu.2` and refuses automatic or manual jumps to official releases. Keep this version and updater policy unchanged while applying local interface changes. Independent Shamu versioning and release updates are deferred to a separate future project. This local preview is not a notarized public installer. Like upstream local builds, it omits the multi-platform `orcad-template` used to deploy new remote runtimes. The connection to the existing primary desktop uses upstream's paired control transport.

## Updating the fork

Keep the upstream release tags and the project-channel changes on separate branches. Fetch tags from the SSH `upstream` remote, create an upgrade branch from this feature branch and merge the chosen release tag. Resolve changes in the small integration points (sidebar, tab menu, preload, IPC registration and updater guards), then install the newly pinned dependency versions with frozen lockfiles. Run the channel tests, related integration tests, changed-code quality gate and hidden Electron journeys before rebuilding the app. The preview version follows the merged upstream `package.json` automatically.

Keep the last working app until the new package passes an isolated startup check. Official automatic updates remain disabled in the preview so an upstream installer cannot silently remove the project interface.

## Validation

Targeted tests cover recipients, session isolation, scoped native replies, older history, durable storage, revision conflicts, failed/uncertain delivery and draft recovery. Hidden Electron/CDP journeys use isolated profiles and a synthetic Claude protocol process, covering promotion from both worktrees and folder workspaces, two participants, named routing, draft recovery and reload without duplicate replies. They do not call a paid model or use production conversations.

The two-instance journeys connect through the Shamu UI using a real loopback access link, including a floating side chat. They assert that the original session ID is retained, a message appears in both apps, Stop reaches the primary provider process, reload does not duplicate a reply, the client has no local native ownership and the primary remains the native owner after the client closes. Connection tests cover unreadable bindings, expired links, host-key mismatch, private binding permissions and recovery after a failed hydration. Regression tests cover floating ownership and a binding arriving after an active inventory stream. Appearance tests cover the allowlist, runtime identity checks and unreadable profile state.

Delivery checks also cover a host rejecting a submission after transport acknowledgement, an unknown dispatch result, a late acknowledgement arriving after the journal's refusal and an orphaned send expiring while the reader stays unchanged after reload. The journal remains authoritative; none of these transitions automatically resends the message.
