# Orca Shamu

Based on the upstream `v1.4.251` release. Shamu is a separate desktop interface connected to the primary Orca through its existing paired runtime control transport. Keep the primary process running; its window can stay hidden or minimized. The primary Orca continues to own the agents, native sessions, execution directories, permission policies and original transcripts. Shamu reads and controls those same session IDs.

## Connect once

1. Keep the installed Orca open. In **Settings → Remote Orca Servers**, create a **New Link** for **This computer**.
2. Open **Orca Shamu.app**, paste that access link into **Primary Orca access link** and connect.
3. Shamu loads the primary Orca's repositories, worktrees, folder workspaces and native Chat tabs, including side chats in the floating workspace. The statusbar shows the primary connection and opens the Shamu settings.
4. Choose **Import interface settings** under **Settings → Orca Shamu** to import the primary's fonts, sizes, theme, chat appearance and side panel preferences. The primary settings are read only; Shamu saves the selected appearance fields through its own settings service. Accounts, permissions, trusted directories and environment selection are excluded. Run it again after changing the primary's appearance.

The link must target loopback. The native access-link flow authorizes the client without exposing a LAN service. Credentials stay in Orca's existing runtime environment registry; `shamu-primary.json` contains only the environment ID and pinned public host key. Renewed links must belong to that same primary host. Never paste an access link into logs, issues or source files.

Shamu uses its own bundle ID, Keychain service and application profile. No production profile is copied or opened by a second writer. The client skips local provider account initialization, auth synchronization, quota polling and managed agent hook installation. Its project organization and drafts are local to that interface, while session execution and controls remain on the primary Orca. Closing Shamu leaves the primary sessions intact. If the primary Orca becomes unavailable, reconnect it; Shamu does not substitute local sessions for project participants.

## Use

The main sidebar shows a collapsible **Bots** entry above **Projects**, with a bot icon and a **New bot** action. Bots and projects share the same navigation. Bots have a saved name and optional instructions, independent of any existing conversation. Workspaces retain Orca's existing project terminology.

1. Choose **New bot**, enter a name and optional instructions, choose a color or upload an image, then **Create bot**. The bot opens its own native Chat immediately, with the standard model, permissions, attachments and history controls. No existing conversation is required. Opening an existing empty bot provisions its chat the same way.
2. Each bot gets a permanent folder workspace in **Bots** on the primary Orca, stored at `~/orca/bots/bot-<stable-id>`. **Workspace** opens its original tab. Returning to a bot reuses the same session, history and native draft.
3. Use the gear on the right to open **Bot settings**, edit its identity and view its **Bot folder**. The folder's `bot.json` records its name and instructions. Generated `AGENTS.md` and `CLAUDE.md` direct the provider to read that configuration. Existing instruction files are never overwritten. The bot inherits the primary's Claude default or uses Codex and retains normal session permission controls.
4. Each bot exposes one permanent native conversation. **Memory** replaces the old Conversations action. Right-click a native Chat tab and choose **Create bot from chat…** to promote that same session, retaining its original workspace and prior history. Its bot folder holds identity and memory without moving the source workspace or creating a second session. Existing shared conversations with several participants retain their stored history; the bot editor no longer adds participants.

Bot creation opens an idle native session without sending a prompt or starting a paid turn. A bot can create another bot when the user asks it to, using its generated `BOT_TOOLS.md` guide and the local Shamu CLI. Its creation request cites a real user item in its own chat. Retrying the same request preserves the child bot ID and native session. Bot controls retain the existing provider permissions.

Use the sidebar bot actions or its context menu to **Pin bot** or **Move to section**. Pinned bots appear first with larger avatars and names. Their action and context menus omit **Move to section** while pinned. Sections can be named by project, client or responsibility and collapsed independently. A pin retains the bot's saved section, so unpinning returns it there. Pins and sections survive application restart and do not move workspaces or native conversations.

For promoted shared conversations, unmentioned messages go to the default participant; `@handle` addresses that participant and `@all` explicitly addresses everyone. Each native session belongs to one project channel. Participants keep separate provider sessions and original directories; their shared conversation supplies bounded context to each explicit send. Busy agents must finish or answer their native permission request before accepting another project message. Native approval and question cards remain actionable in the project.

The main participant's loaded history appears as **Earlier conversation**. **Load earlier conversation** pages older native history without losing its user questions. Other participants' prior history is not imported. New replies enter the shared chat only when the native turn can be attributed to a send from that channel; messages sent directly in the original tab remain there.

**Open chat** returns to the original tab and its execution host. Unlinking a conversation does not stop its process or erase history. Removing the final link keeps the bot and its instructions saved. Closing a source tab can make it unavailable to the project; the project retains its existing messages. Terminal-backed agents must first use the existing **Continue with Chat Agent** flow.

## Linked projects

Bot settings can link projects, folder workspaces or groups already registered in the primary Orca, including unrelated filesystem folders. Links retain the server, execution host, target kind and catalog identity; they do not move projects or replace the bot’s permanent folder, session, history or draft. A project may be linked to several bots. Unlinking removes only that association.

Each explicit Shamu send resolves links from the current primary catalog, using current names and paths. Linked groups follow current logical membership and registered physical descendants on their owning host. Linked folder workspaces include registered descendants of that folder. Bot-owned folders are excluded from the project picker. Missing or foreign-server links remain saved and are reported as unavailable, without substituting another project. A bounded inventory accompanies the existing bot context for chat, CLI sends, bot consultations and routines. The provider is instructed to read project instructions and route work through the owning Orca host, retaining the existing session permissions. Links do not index file contents or grant filesystem access. Add new directories through Projects using Orca’s existing admission and discovery flow.

## Data and recovery

Bot identities, permanent workspace/session references, instructions, optional conversation links and promoted shared transcripts live in `project-channels.json` in the active Shamu desktop profile. The permanent bot folder holds configuration and working files. Native messages, provider history and native drafts remain in the primary Orca's existing persistent session storage. Writes are durable, mode `0600`, serialized and checked against a revision. Unreadable or newer files are never reset to an empty project list.

Provisioning records the canonical native create operation and session identity before dispatch. A failed or lost create reply leaves a retryable bot with that same operation; reopening cannot allocate another native session. The permanent conversation and storage path cannot be replaced through the link editor. Removing a bot profile does not remove its folder, native session or history.

Draft edits are kept in memory and saved outside the keystroke path. A renderer-unload checkpoint protects text typed immediately before reload; it cannot replace a different draft already saved by another window. Message and delivery identities are saved before submission. Reload does not retry a pending or uncertain send.

The desktop owns the project list. Existing native sessions on supported paired runtimes retain their stamped host; this preview does not add channel sharing or a channel interface to mobile/web clients. Those clients fall back to their workspace view. Permanent bot chats reuse the full native composer; promoted shared conversations retain their simpler text composer.

## Bot identity and durable memory

**Bot settings** offers seven stable identity colors, a PNG/JPEG/WebP/GIF image upload and an animated bot icon toggle. Uploads are center-cropped and resized to a 160 px PNG, with a 5 MB input limit and a 180000 character stored-image limit. Animated uploads use the first frame. Identity appears in the sidebar, bot header and the global `@` suggestions. The built-in icon greets on entry and hover; it has no idle timer or permanent animation loop, and system reduced motion disables it.

Each permanent bot folder contains `memory.json` and `BOT_MEMORY.md`. Memory entries distinguish facts, task state and summaries, and include a stable topic/scope, timestamps and source references. Corrections archive previous entries with a replacement reference; retrieval excludes archived values. **Memory** lets the user add, edit, archive and inspect earlier versions. Stale writes fail with a reload action instead of replacing notes written by the agent. Invalid files are preserved and reported.

On explicit native messages and bot mention deliveries in Shamu, the main process recalls matching notes, pinned facts, task state and recent summaries within 12000 additional characters. This is a bounded textual retrieval budget, not a provider token limit. The normal native provider owns the recent context, original journal and compaction. Relevant memory is sent as a separate marked context block, shown through a collapsed **Bot memory read** brain row beneath the turn status, outside the person's message. Known bot and notification IDs in its notes become named references to their original chats or communication; saved memory stays unchanged. Other bot memories and unrelated sessions are excluded. Previously wrapped messages are unwrapped before recall to avoid nested context on resubmission.

The provider reads the memory guide and maintains grounded notes after meaningful work and before compaction through its normal filesystem tools and existing permissions. **Review with bot** prepares a request in the same native composer, preserving any current draft; the user sends it normally. Shamu does not fabricate a summary, run a second summarizer model, reset a conversation or automatically resubmit a turn. Agent-authored memory still needs factual review. Earlier details remain available through Orca's existing conversation search and source references; no new database table or embedding service is introduced.

This follows the previously discussed separation of persistent history, task state, summaries and durable memory. References: [Grok Bot identity and memory](https://docs.x.ai/grok-bot/bots), [OpenBot persistent agents](https://github.com/nightly-labs/openbot), [OpenClaw memory](https://docs.openclaw.ai/concepts/memory), [OpenClaw compaction](https://docs.openclaw.ai/concepts/compaction). This is an independent implementation within Orca's existing providers.

## Vault

**Vault**, beside Memory, manages encrypted credentials for each bot. Create a master password, add a password or token, and explicitly enable that bot to request use when needed. Vault unlocks automatically through the OS keychain when the Shamu window opens. Closing or hiding that window revokes access even while the primary Orca remains running; the header shows its lock state and pending approvals. Each requested command requires review in Vault and a native confirmation. The agent receives references and exit codes rather than credentials or program output. Copying a password requires master-password verification. See [Shamu Vault](SHAMU_VAULT.md) for storage, device binding, security boundaries and research.

## Runtime memory

Normal use opens the packaged Shamu without Vite. Use live reload only while editing the interface. Its server loads source modules on demand instead of prebuilding all desktop and web entries.

Shamu keeps one recent hidden terminal view warm and parks other restorable views sooner. Live agents, PTYs, history and permissions stay on the primary; unrestorable, visible and starting views retain their existing safeguards. A returning view remounts from the same session. Session search, agent state rule updates and hibernation decisions stay on the primary instead of running again in the client.

Both Electron apps still have independent main, renderer and GPU processes. Their remaining memory is not eliminated by sharing agent sessions.

## Build

### Local interface development

Close Shamu, keep the primary Orca running, then run `pnpm dev:shamu` from this checkout. The launcher starts Vite on literal loopback and opens the same installed Shamu executable, profile and saved primary connection. Its statusbar shows **Live reload**. Saving React or CSS files updates that interface without packaging another release. Some module changes can reload the document; saved drafts and native sessions remain in their existing owners.

Quit Shamu to stop this development server. Opening the installed app normally uses its bundled interface again. Changes to main, preload or the native executable still require rebuilding and restarting Shamu. This mode keeps the installed application's version and update block. It adds a local Vite process while active.

The live server proves a private per-launch token before its document is loaded. The token stays in process memory/environment, never in the URL or `out/shamu-live.json`; that file records only the launcher PID, local URL and checkout. The usual window IDs, navigation containment, preload, sandbox and context isolation remain in force. The launcher accepts `--app /path/to/Shamu/executable` for another installed bundle location.

### Package the application

Use the pnpm version pinned in `package.json` (this release uses 12.14.0). Install root and `mobile/` dependencies with frozen lockfiles, then run:

```sh
node config/scripts/build-project-channels-mac.mjs
```

The app is generated under `dist/project-channels/mac-arm64/Orca Shamu.app` on Apple Silicon. Nothing is installed over `/Applications/Orca.app`. Its bundle ID is `com.lafraia.orca-shamu` and its default profile is `~/Library/Application Support/Orca Shamu`. The internal executable remains `Orca` for compatibility with the bundled CLI launcher. The launcher uses local ad hoc signing rather than an installed distribution certificate; macOS permissions remain subject to that different signature.

The development version is `1.4.251-shamu.1`, using the `<upstream>-shamu.<revision>` format. Installed local builds are independent of this source checkout. `config/shamu-release.json` records the exact upstream tag and commit plus the Shamu revision. Keep `package.json.version` equal to upstream. Local builds and ordinary PRs do not bump this revision or create release tags. Accumulate changes in `SHAMU_CHANGELOG.md` under **Unreleased** and follow `SHAMU_RELEASES.md` only after an explicit request to close a distribution. A plain `pnpm shamu:version bump` is refused; closing a version requires the explicit `--close-release` flag and reviewed release notes. `pnpm shamu:check` verifies the merged upstream pin and changelog. The historical preview tags remain local development checkpoints, not published distributions.

About continues showing the upstream version and Shamu revision separately, for example `Version 1.4.251 (Shamu 1)`. The builder validates and embeds the metadata. Official automatic and manual updates remain blocked; publishing an independent update feed is separate from creating local versioned builds. This local preview is not a notarized public installer. Like upstream local builds, it omits the multi-platform `orcad-template` used to deploy new remote runtimes. The connection to the existing primary desktop uses upstream's paired control transport.

## Updating the fork

The canonical repository is `lafraia/orca-shamu`, retaining its GitHub fork relationship to `stablyai/orca`. Use the SSH `origin` remote for Shamu and the SSH `upstream` remote for Orca. Write Shamu commits in English and merge through protected `main` PRs.

Keep upstream release tags and Shamu changes separate. Fetch tags from `upstream`, create an integration branch and merge the chosen release tag. Run `pnpm shamu:version sync` after resolving the merge; it verifies ancestry and package version, pins the exact commit and records the upstream integration in Unreleased. Add the integration PR link. Review `UPSTREAM_PATCHES.md` and any imported publishing workflows. Run the affected tests and hidden Electron journeys before merging. An upstream import does not close or publish a Shamu distribution.

Keep the last working app until the new package passes an isolated startup check. Official automatic updates remain disabled in the preview so an upstream installer cannot silently remove the project interface.

## Validation

Targeted tests cover recipients, session isolation, scoped native replies, older history, durable storage, revision conflicts, failed/uncertain delivery and draft recovery. Hidden Electron/CDP journeys use isolated profiles and a synthetic Claude protocol process, covering promotion from both worktrees and folder workspaces, two participants, named routing, draft recovery and reload without duplicate replies. They do not call a paid model or use production conversations.

The two-instance journeys connect through the Shamu UI using a real loopback access link, including a floating side chat. They assert that the original session ID is retained, a message appears in both apps, Stop reaches the primary provider process, reload does not duplicate a reply, the client has no local native ownership and the primary remains the native owner after the client closes. Connection tests cover unreadable bindings, expired links, host-key mismatch, private binding permissions and recovery after a failed hydration. Regression tests cover floating ownership and a binding arriving after an active inventory stream. Appearance tests cover the allowlist, runtime identity checks and unreadable profile state.

Delivery checks also cover a host rejecting a submission after transport acknowledgement, an unknown dispatch result, a late acknowledgement arriving after the journal's refusal and an orphaned send expiring while the reader stays unchanged after reload. The journal remains authoritative; none of these transitions automatically resends the message.

## Memory references

Known bot names in memory notes and source labels use the same reference pills as chat mentions, including names written without `@`. Clicking a name opens that bot's permanent chat and closes the memory sheet or internal conversation overlay. The saved memory text stays literal. Ambiguous and unknown names, emails, paths and identifiers remain plain. Memory editors and in-flight writes hold these navigation controls until Save or Cancel, preserving unfinished edits. Recalled notes expose the same references.

## Bot model selection

Each permanent bot chat exposes its native model picker only in the composer footer. The control uses the same host session, model catalogue and option writer as workspace chats. A selection changes that conversation's model without replacing its session, history, bot identity or composer draft. Reopening the bot reads the recorded session options from the owning Orca. Loading, unavailable models, pending writes and refusals use the existing native picker behavior. This control offers models of the bot's current agent.

## Bot mentions

In any structured native chat in Shamu, type `@` and select a bot from the Bots group. File suggestions remain in the Files group. Selected bot pills retain their stable identity when drafts are saved and restored. A literal pasted mention or an assistant reply does not dispatch anything.

Typing a mention query highlights its first match for Enter or Tab; a bare `@` remains unselected. Bots' internal home workspaces are omitted from the resource results. Suggestions belong to the focused composer, close when focus moves to another chat, and stay beneath an overlapping floating chat. The same behavior applies to bot, workspace and side chats.

The same picker groups workspaces, projects and issues alongside bots and files. It opens without a selected suggestion in Shamu; pointer movement and arrow keys share one selection, and Enter inserts only an explicitly selected item. Workspace and project references retain their host and directory, while issue references retain their original URL. Their pills survive draft restoration and remain clickable in the transcript. Selecting a workspace or project named like a bot never notifies that bot. Only the paired runtime's proven catalogue is offered. Linked and cached issues appear immediately; longer queries use the existing task-source search with debounce, cancellation, bounded concurrency, partial-result handling and retry.

Sent native messages display recognized `@Bot name` references with the same pill as the composer, including existing history. Clicking a reference opens that bot's permanent chat and closes an overlaid floating workspace so the destination is visible. Rendering or opening a reference does not send a message or notification. Names resolve against the current bot list; ambiguous names, code, email addresses and existing Markdown links remain unchanged. Copying a message keeps its original text.

After the source message is accepted, Shamu delivers the explicit mention to each selected bot's own permanent chat, including the source label, session and workspace reference. Replies stay in the bot chat. Busy bots use the native queued-send policy. Delivery identifiers and outcomes are stored privately in the profile's `bot-mentions` directory before sending. Reloading or retrying a notification never automatically resends an ambiguous delivery. The notification offers access to the bot chat, or a retry if the notification request could not complete.

Each notification now captures up to 20 recent user and assistant messages within a 24,000 character serialized-message budget. Tool logs, reasoning, subagent messages and injected bot memory are excluded. Long excerpts are marked truncated. The notification UUID lets its recipient read this captured context and page earlier source history through the bot context command. A source reference cannot read messages newer than its captured boundary or be used by another recipient. Attachment references keep their original primary paths. Quoted source context does not authorize unrelated actions.

## Internal bot communication

Native chats show a compact communication row using the subagent activity style, with the bot identity and observed delivery or reply state. Selecting it opens a separate read-only conversation between those participants. The view contains the original communication and the matching root assistant replies in both directions. The person's own messages and direct replies stay in the main chat. Injected delivery instructions, source snapshots, memory and tool activity do not become conversation bubbles.

The view reads existing `bot-mentions` receipts and original primary journals; it creates no provider sessions and sends no prompts. Older receipts remain readable without rewriting them. New agent-origin messages retain the author and authorized source-item reference. Native operation IDs, provider adoption and queue handoffs determine which turn belongs to a communication. If a person steered that same turn, the shared answer stays in the main chat; the internal view offers the original chat instead of guessing who it answered. Actionable approvals remain accessible in the main chat.

Native agent mail between a bot and a workspace uses the same separate view. Incoming rows say `Message from bot <name>` using the bot's permanent home session on the paired environment, rather than the provider's generic chat name. Only native sender metadata identifies an agent; text pasted by a person, foreign dispatch senders and ambiguous multi-sender notices retain their original presentation. While open, the view reads both participants' existing root journals to show reverse exchanges and matching replies. Header names link to the permanent bot chat or the available original workspace tab. Reading never consumes orchestration mail or sends a provider prompt.

Queued communication keeps the native send and cancel controls, with a compact identity row in place of the injected payload. The thread shows the latest 20 communications with an action to load earlier exchanges. Opening an older exchange can automatically page three earlier history windows, then offers manual paging. Read subscriptions are shared with the native ChatUI and exist only while the thread is open; observing internal replies does not mark the other bot's whole conversation read. Participant names open their bot chat, and an available external origin opens its original native tab. Closing the thread preserves the main chat draft.

## Bot groups

Each regular group header has a three-dot menu to rename it or move it up or down. The ungrouped Bots header is also editable. Pinned bots remain in their own area at the top. Group order is stored separately from bot order in the optional `sectionOrder` field, so existing profiles retain their current ordering until it changes. Renaming updates every matching bot in one serialized save, including the remembered section of pinned bots. Duplicate names are refused without merging groups or altering chats. Group edits share the existing roster command transport and require user provenance when invoked by an agent.

## Unread bot messages

Each bot shows a small static unread dot using the shared light/dark unread color. Pinned bots use the same dot. Navigation tabs and section headers do not show notification indicators, including when a section is collapsed. The unread count remains available in each bot's accessible description without adding numbers to the visible interface.

Only root assistant messages with visible text or images count. User requests, tool logs, reasoning and subagent messages do not. Stable journal item IDs prevent streamed revisions or reload from counting the same message twice. Reading a bot chat or its original native workspace tab retires only the journal cursor actually observed. A hidden, unfocused or away window does not mark a bot read; an overlaid floating chat or bot settings/memory/routine sheet also keeps the underlying bot pending.

Read cursors live privately in `bot-read-state.json`, independently of conversation history and bot metadata. Existing bots start at activation time; their old history is not relabeled unread. Bots created afterward count their first reply. Read receipts and unread replies survive restarting Shamu. A long backlog pages incrementally; a temporary **+** means the displayed number is a lower bound while counting continues. The original transcript remains on the primary Orca.

The monitor reuses the existing host status and completion streams, including a completion while background work keeps a bot busy. It reads journal pages only for relevant changes, reconnect or outstanding pagination, caches unchanged heads and avoids per-token refreshes. Idle bots do not acquire another transcript reader, start an agent or poll continuously. Errors retain the last known counts and retry with a delay.

## Bot routines and controls

Open **Routines** in the bot header to add work for that same permanent conversation. Choose hourly, daily, weekdays, weekly, an interval, a single date, a named event or a supported custom cron/RRULE calendar. Calendar routines use an explicit IANA time zone, including daylight-saving transitions. The panel supports edit, pause, resume, run now, archive and recent run history. A paused routine can still be run explicitly. Existing provider approval requests remain in the bot chat.

The scheduler runs locally every 15 seconds while Shamu and the primary Orca are running and the computer is awake. Minimize the window to keep it available. Quitting Shamu or sleeping the computer suspends scheduling. After downtime, at most the latest eligible occurrence runs within its configured catch-up window. Expired one-time work is recorded as missed. A pending or uncertain execution prevents another occurrence of that same routine from accumulating. Native completion is read from the primary journal, including older pages for long turns.

Definitions live in the private `bot-routines.json`; private receipts live in `bot-routine-runs`. Each receipt is recorded before dispatch with a stable native operation ID. A restart recovers prepared scheduled work, while an issued delivery whose result was lost is marked unconfirmed and never resent automatically. Review its bot chat before choosing **Allow next run**. Receipt history is retained on disk; the panel loads the latest 100 applicable runs and omits stored prompts from its history payload.

Bots can use the same controls through the bundled `orca bots` commands documented in their own `BOT_TOOLS.md`. `list`, `context`, `create`, `organize`, `mention` and `routines` target an explicitly selected local Shamu profile, ignoring ambient primary or remote CLI selection. Bot creation and agent mutations require the actor bot and a source user item; routines remain owned by that bot. A configured local integration can call `routine.trigger` with a named event and a stable event ID. Repeating the same event returns its existing receipt; changing its payload under that ID is refused. No public webhook, cloud execution or external messaging integration is added.

The local runtime RPC is authenticated through the existing CLI transport and refuses paired/mobile callers. Bot metadata updates notify Shamu's sidebar without discarding local drafts. Hidden paired Electron journeys exercise the real CLI, user-request provenance, idempotent child creation, pins, sections, manual/event routines, journal completion and restart without duplicate paid turns using a synthetic provider.

See `UPSTREAM_PATCHES.md` for upstream fix reviews, retired workarounds and regression coverage.

## External CLI prompts

Bot-to-bot questions use the coordinator's own voice and the separate `bots ask` / `bots ask-result` workflow. Selecting another bot in a bot chat no longer forwards the user's message automatically. See [Bot consultations](SHAMU_BOT_CONSULTATIONS.md) for the researched pattern, commands, attribution and delivery boundaries.

Grokbot and other local integrations can address a bot's permanent native chat with the CLI bundled in the updated Shamu build. Select Shamu's local user-data directory explicitly; its authenticated connection forwards the prompt to the primary Orca. Use a unique name or the stable bot ID returned by `bots list`.

```bash
orca bots send --profile-dir "/path/to/Orca Shamu" \
  --bot "Researcher" --sender "Grokbot" \
  --request-id 36d3520e-8a10-49cc-92dd-ce1dcfd9d54d \
  --text-file prompt.txt --json

orca bots result --profile-dir "/path/to/Orca Shamu" \
  --request-id 36d3520e-8a10-49cc-92dd-ce1dcfd9d54d --json
```

`--text` accepts a direct prompt; UTF-8 `--text-file` preserves multiline input. The same commands accept `--input-file` with `{"action":"send","requestId":"UUID","bot":"NAME_OR_ID","sender":"Grokbot","text":"Prompt"}` or `{"action":"result","requestId":"UUID"}`. Reuse the UUID after a timeout or lost connection. The same ID with changed input is refused; uncertain issued requests are inspected rather than sent again. Names shared by several bots require an ID.

`delivery` describes the saved dispatch receipt; `state` describes observed execution. Busy bots use the native queue. The chat shows **Received from CLI**, the display sender and the received prompt, followed by the bot's normal reply. Queued cards retain their origin. Editing a queued prompt keeps the resulting text visible instead of hiding it behind the original receipt. Origin labels are caller-supplied metadata. Existing bot permissions and Vault approvals continue to apply.

`result` returns only the requested turn's root assistant text, with a truncation flag when the native bounded output buffer applies. A pending, returned, unavailable or uncertain request does not borrow another turn's answer. Receipts are written before dispatch to private `bot-cli-requests` sidecars and survive Shamu restarts. The CLI uses the existing authenticated local transport; scripts can invoke it on the Shamu host through their existing authenticated execution channel. Shamu and the primary Orca must be running and connected.

## Bot appearance

Bot settings offer a live SVG preview with circle, star, cloud and squircle bodies, three expressions, foreground color and an animation switch. Idle avatars blink; work and pending-input states have distinct motion. The surrounding surface keeps its existing color. Motion respects the system's reduced-motion preference and pauses when the avatar is offscreen. Photos can be uploaded or dropped on the preview, are normalized locally and display in a circle. Returning to the animated avatar retains its saved appearance.

Geometry is adapted from [Bloub](https://github.com/jeremy-prt/bloub) at `b4bb3c1b5f93c7b87a2e8d620f667c4093d97749`. It runs locally with the app. Its MIT notice lives in `resources/licenses/bloub.txt` and is copied into packaged resources on every platform.

## Bot sidebar

The Bots entry contains an indented Pinned section and indented named sections, with bot rows nested beneath each section. Bots without a section appear under General. The sidebar lists all bots without a separate search field. It keeps group counts hidden and reveals action menus on hover, keyboard focus or touch devices. Drag a group header above or below another group, drag bots to reorder them, or drop a bot on a group header to append it even while that group is collapsed. Pinned bots keep their dedicated top section and can be reordered or moved into another section. Alt+Up and Alt+Down reorder the focused bot or group; menus retain group movement and bot section choices. Order and membership are saved atomically against the current roster, preserving conversation identities and drafts. Invalid or changed destinations leave the saved roster intact and report an error.

Bot rows read the same primary status stream as native workspaces and reuse their spinner and attention glyphs. A pending approval or question shows the attention icon; background monitoring and finished outcomes retain the workspace presentation. A disconnected stream shows unverified status rather than claiming that cached work is still running. Unread dots remain a separate per-bot indication.

## Shamu settings and connection status

The primary connection lives in the existing statusbar. Press it to open Settings → Orca Shamu. The Shamu section is local to this desktop interface and is absent from the official Orca and paired web clients. It contains interface preference import, reconnect and access-link renewal. Import runs only on request; it copies the existing interface preference allowlist, including fonts, without changing the primary Orca. Access-link renewal retains the pinned primary and uses the existing connection form.

The connected client adds no extra titlebar. The upstream titlebar keeps window dragging and traffic-light spacing. Floating panels and their buttons explicitly opt out of native Electron dragging because their header already uses pointer-based dragging.

## Message preview expansion

Bot exchange cards and native agent-message cards share an intrinsic grid expansion. Their bodies follow the current bounded preview as asynchronous text or media arrives, rather than keeping the loading placeholder’s measured height. A message preview uses a compact placeholder; the full conversation keeps its own multi-message skeleton. Opening and closing use the theme motion tokens and respect reduced motion.
