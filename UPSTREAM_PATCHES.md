# Temporary upstream fixes

Keep Shamu features separate from temporary fixes to upstream behavior. At each upstream import, check the linked report and run the regression journey before removing a patch.

No temporary upstream patch remains active on `v1.4.250`.

The native chat autocomplete positioning workaround for [report #38234](https://github.com/stablyai/orca/issues/38234) was retired when importing this release. `NativeChatPickerListbox.tsx` now shares the upstream positioning implementation from [#38322](https://github.com/stablyai/orca/pull/38322) and the launch submenu support from [#38328](https://github.com/stablyai/orca/pull/38328). The module extraction and Shamu's foreground/background menu layers remain fork features.

The autocomplete unit tests and hidden `shamu-bot-mentions.spec.ts` and `shamu-resource-mentions.spec.ts` journeys passed after the replacement, covering movement, resize, appearance, typed selection and focus changes between bot, workspace and floating chats.

Bot mentions, permanent bot chats, shared primary sessions, the Shamu connection bar, live renderer development and independent version metadata are fork features. An upstream popup fix does not remove those features.

Publish only the sanitized report. The original user screenshot contains private conversations and must not be attached to a public issue.
