# Project channels preview

Based on the upstream `v1.4.247` release. This desktop preview adds a project conversation over existing native Chat sessions. It does not move their execution directories, clone their processes, change their permission policies or replace their original transcripts.

## Use

1. Open **Workspaces**, then right-click a native Chat tab and choose **Use as main project chat…**. Folder workspaces and Git worktrees use the same flow.
2. Choose a project name, agent display name and unique `@handle`.
3. Open **Agents** in the project to add other existing native Chat tabs, rename their project identities or choose the main participant.
4. Unmentioned messages go to the main participant. `@handle` addresses that participant; `@all` explicitly addresses everyone. Only user sends dispatch turns. Agent output never starts a response loop.

Each native session belongs to one project channel. Participants keep separate provider sessions and original directories; their shared conversation supplies bounded context to each explicit send. Busy agents must finish or answer their native permission request before accepting another project message. Native approval and question cards remain actionable in the project.

The main participant's loaded history appears as **Earlier conversation**. **Load earlier conversation** pages older native history without losing its user questions. Other participants' prior history is not imported. New replies enter the shared chat only when the native turn can be attributed to a send from that channel; messages sent directly in the original tab remain there.

**Open chat** returns to the original tab and its execution host. Removing a participant does not stop its process or erase history. Closing a source tab can make it unavailable to the project; the project retains its existing messages. Terminal-backed agents must first use the existing **Continue with Chat Agent** flow.

## Data and recovery

Channels, participants, aliases, delivery identities, history and drafts live in `project-channels.json` in the active desktop profile. Writes are durable, mode `0600`, serialized and checked against a revision. Unreadable or newer files are never reset to an empty project list.

Draft edits are kept in memory and saved outside the keystroke path. A renderer-unload checkpoint protects text typed immediately before reload; it cannot replace a different draft already saved by another window. Message and delivery identities are saved before submission. Reload does not retry a pending or uncertain send.

The desktop owns the project list. Existing native sessions on supported paired runtimes retain their stamped host; this preview does not add channel sharing or a channel interface to mobile/web clients. Those clients fall back to their workspace view. Attachments and project-driven creation of fresh agents remain available through the original Chat tabs rather than the shared composer.

## Build and switching applications

Use the pnpm version pinned in `package.json` (this release uses 12.14.0). Install root and `mobile/` dependencies with frozen lockfiles, then run:

```sh
node config/scripts/build-project-channels-mac.mjs
```

The app is generated under `dist/project-channels/mac-arm64/Orca.app` on Apple Silicon. Nothing is installed over `/Applications/Orca.app`. The preview keeps the upstream bundle identifier, keychain service name and profile so existing workspace sessions remain available. The launcher uses local ad hoc signing rather than an installed distribution certificate; macOS permissions remain subject to that different signature. Quit the installed Orca before opening the preview; both applications intentionally share the single-instance lock. Reopening the installed app returns to the upstream UI. The additional channel file remains intact.

The preview version carries a `projects.1` suffix and refuses automatic or manual jumps to official releases. Future upstream upgrades are integrated into the fork source, tested and rebuilt. This local preview is not a notarized public installer. Like upstream local builds, it omits the multi-platform `orcad-template` used to deploy new remote runtimes; existing runtime connections are unchanged.

## Updating the fork

Keep the upstream release tags and the project-channel changes on separate branches. Fetch tags from the SSH `upstream` remote, create an upgrade branch from this feature branch and merge the chosen release tag. Resolve changes in the small integration points (sidebar, tab menu, preload, IPC registration and updater guards), then install the newly pinned dependency versions with frozen lockfiles. Run the channel tests, related integration tests, changed-code quality gate and hidden Electron journeys before rebuilding the app. The preview version follows the merged upstream `package.json` automatically.

Keep the last working app until the new package passes an isolated startup check. Official automatic updates remain disabled in the preview so an upstream installer cannot silently remove the project interface.

## Validation

Targeted tests cover recipients, session isolation, scoped native replies, older history, durable storage, revision conflicts, failed/uncertain delivery and draft recovery. Hidden Electron/CDP journeys use isolated profiles and a synthetic Claude protocol process, covering promotion from both worktrees and folder workspaces, two participants, named routing, draft recovery and reload without duplicate replies. They do not call a paid model or use production conversations.

Delivery checks also cover a host rejecting a submission after transport acknowledgement, an unknown dispatch result, a late acknowledgement arriving after the journal's refusal and an orphaned send expiring while the reader stays unchanged after reload. The journal remains authoritative; none of these transitions automatically resends the message.
