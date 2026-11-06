# Temporary upstream fixes

Keep Shamu features separate from temporary fixes to upstream behavior. At each upstream import, check the linked report and run the regression journey before removing a patch.

On `v1.4.251`, PR validation omits the dangling job-timeout check: the release workflow references `.github/scripts/check-pull-request-job-timeouts.mjs`, which is absent from the release's tracked files and history. Existing job timeouts and the required-context ownership check remain. Remove this adjustment when upstream repairs that workflow reference.

Fork bootstrap adaptations keep the test LoC reporter restricted to default-branch scripts and report unavailable comparisons when the old fork base predates a benchmark. They do not run PR code with a write token or substitute current code for an absent benchmark baseline.

The native chat autocomplete positioning workaround for [report #38234](https://github.com/stablyai/orca/issues/38234) was retired when importing `v1.4.250`. `NativeChatPickerListbox.tsx` now shares the upstream positioning implementation from [#38322](https://github.com/stablyai/orca/pull/38322) and the launch submenu support from [#38328](https://github.com/stablyai/orca/pull/38328). The module extraction and Shamu's foreground/background menu layers remain fork features.

The autocomplete unit tests and hidden `shamu-bot-mentions.spec.ts` and `shamu-resource-mentions.spec.ts` journeys passed after the replacement, covering movement, resize, appearance, typed selection and focus changes between bot, workspace and floating chats.

Bot mentions, permanent bot chats, shared primary sessions, the Shamu connection bar, live renderer development and independent version metadata are fork features. An upstream popup fix does not remove those features.

Publish only the sanitized report. The original user screenshot contains private conversations and must not be attached to a public issue.
