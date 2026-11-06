# Shamu delivery and distributions

## Repository and commits

- Canonical repository: [lafraia/orca-shamu](https://github.com/lafraia/orca-shamu), a GitHub fork of [stablyai/orca](https://github.com/stablyai/orca).
- Use SSH for Git. `origin` is the Shamu fork; `upstream` remains the original Orca repository. Existing local checkout paths do not need to change.
- Write every Shamu commit subject and body in English. Do not rewrite upstream history or existing signed preview tags.
- Changes enter protected `main` through PRs, including changes by administrators. Force pushes and deletion of `main` are blocked. No external approving reviewer is required; the PR requirement still applies.

## Continuous development

Merge multiple feature and fix PRs before cutting a distribution. Each PR updates **Unreleased** in `SHAMU_CHANGELOG.md`, links its actual PR and states the user-visible change. A merge or successful CI run does not authorize a release. Local builds do not advance the distribution revision and do not create tags or GitHub releases.

`config/shamu-release.json` pins the exact upstream tag/commit and a separate Shamu revision. Keep `package.json.version` equal to upstream. For example, a future `1.4.248-shamu.12` distribution means upstream `v1.4.248` plus Shamu revision 12. About continues showing the upstream version and Shamu revision separately.

The existing revisions 1 through 11 are local preview history. No GitHub release exists for them. Do not publish them retroactively or move their signed tags. The prepared revision 11 app remains a local preview and is not repackaged by this policy change.

Run `pnpm shamu:check` to verify that metadata, merged upstream history and the Unreleased changelog agree. `pnpm shamu:version` shows the current version without changing it.

## Upstream imports

1. Fetch the chosen release tag from the SSH `upstream` remote. Create an integration branch from Shamu's current base and merge that exact release tag.
2. Resolve conflicts and keep `package.json.version` equal to the chosen upstream release. Do not copy upstream version numbers without merging their code.
3. Run `pnpm shamu:version sync`. It refuses unmerged or mismatched upstream tags, updates the upstream pin and records the integration in Unreleased. A new upstream base starts its own Shamu revision sequence at 1; this does not close a distribution or create a tag.
4. Review `UPSTREAM_PATCHES.md`, rerun its regression checks and remove temporary patches only when the upstream fix is proven. Review newly imported workflows before merging so no upstream publisher becomes active in this fork.
5. Add the actual integration PR link to the changelog and merge through the protected PR flow. Keep upstream release notes separate from Shamu's notes.

## Close a distribution only when requested

Only begin these steps after Daniel explicitly asks to close a version. Publishing and installing the desktop app remain separate permissions.

1. Select the merged Shamu commit to distribute. Reconcile all included feature/fix PR links and upstream integration notes in Unreleased. Complete the checks appropriate to those changes.
2. Run `pnpm shamu:version bump --close-release`. The explicit flag closes Unreleased into the next Shamu revision and starts a fresh Unreleased section. A plain `bump` is refused. The command creates no Git tag, build, upload or GitHub release.
3. Review the version and closed changelog entry in a release preparation PR. Merge it through the protected `main` flow. Do not bypass protection to update version files.
4. On the reviewed merged commit, run `pnpm shamu:check` and `pnpm shamu:release-notes`. The notes command refuses a version without a matching closed changelog entry. Build and validate the intended distribution artifacts separately. Keep the artifact manifest and its exact Git commit with the release.
5. Create a signed `shamu/v<upstream>-shamu.<revision>` tag on that reviewed commit. Push only that specific authorized tag, never all local preview tags. Use `gh release create --verify-tag --notes-file <reviewed-notes-file> --repo lafraia/orca-shamu` with the reviewed tag and artifacts only when publishing that distribution is authorized by the explicit release request.
6. Verify the published tag, upstream base, notes and assets. Do not install or reload the running app unless the user has also requested that action.

## Publishing automation

Upstream release cutting, macOS release builds, mobile publishing and Homebrew publishing workflows are disabled in this fork's GitHub settings. Validation workflows remain enabled. Do not re-enable upstream distribution jobs to publish Shamu. Any future Shamu publisher must be manually invoked, must verify a closed matching changelog entry and must never run on schedules, ordinary PRs or `main` merges. Official Orca update feeds remain blocked in Shamu until an independently authorized update project provides a separate feed.
