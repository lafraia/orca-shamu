# Published upstream report

https://github.com/stablyai/orca/issues/38234

Title: **[Bug]: Native chat autocomplete overlaps the floating chat composer and does not follow panel movement**

### Operating system

macOS 26.6.2 (arm64)

### Orca version

1.4.248

### Details

**Short summary:**
The native chat file autocomplete can overlap the composer in a floating chat instead of appearing above it.

**What happened?**
Typing `@` opens the file suggestions over the message input. The empty state, "No matching files", can cover part of the draft. The menu should remain anchored above the composer, fit the available viewport space and follow the floating panel when it moves.

**How can we reproduce it?**

1. Open a native chat in the floating workspace panel.
2. Enter a draft ending with `@` to open file suggestions.
3. Observe the menu relative to the composer.
4. Move or resize the floating panel while the suggestions remain open.

**Anything else that might help:**
The picker implementation in `NativeChatAutocompleteMenus.tsx` is unchanged between `v1.4.247` and `v1.4.248`. It places a fixed element using viewport coordinates, portals it into the nearest chat appearance root, and watches the anchor size and scroll events. A transformed containing block and panel movement without an anchor resize need to be accounted for. The same listbox is also used by slash command suggestions.

This was observed in a local frontend fork. The report concerns the shared upstream picker, independently of the fork's bot features. No private conversation screenshot or log is attached.
