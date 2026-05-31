# Copilot instructions for See Also Sidebar

Use these rules when changing sidebar rendering, link generation, and click behavior.

## Core safety rules

- Never allow unresolved sidebar clicks to create notes.
- Resolve targets to an existing `TFile` before opening.
- Prefer `metadataCache.getFirstLinkpathDest(...)` plus `leaf.openFile(file)` for plugin-owned sidebar navigation.
- Do not call `workspace.openLinkText` with raw user-facing link text.

## Link rendering rules

- For plugin-owned sidebar links, use a canonical target attribute such as `data-see-also-target`.
- If a link is plugin-owned, strip `href`, `data-href`, and `internal-link` markers to prevent Obsidian default link creation behavior.
- Keep rendering and click ownership in one model. Avoid mixing plugin-owned links with partially native handlers.
- Normalize targets before resolving: decode URI, remove wiki wrappers, remove alias (`|`), remove heading (`#`), remove query (`?`), normalize slashes.

## Event handling rules

- Do not call `preventDefault()` on `mousedown` for link navigation. It can suppress the subsequent `click`.
- If using delegated handlers, only intercept events after confirming the target is plugin-owned and resolvable.
- Use cross-window-safe element checks in Obsidian views. Do not rely only on raw JavaScript `instanceof` when events may come from popout contexts.
- Avoid fragile multi-layer click systems. Prefer one clear event ownership path.

## Template and markdown rules

- Mustache output here is markdown. Do not HTML-escape wikilinks during template render.
- Ensure generated wikilinks remain literal `[[...]]` strings so MarkdownRenderer can resolve correct paths.
- When converting MarkdownRenderer output, preserve a canonical target value and rebind behavior consistently.

## Regression checks after edits

- Clicking any See Also entry must open an existing note or do nothing. It must never create a new blank note.
- Notes with apostrophes, ampersands, spaces, or URI-encoded characters must resolve correctly.
- No first-click no-op behavior.
- `npm run lint` and `npm run build` must pass.

## Plugin ecosystem caution

- Other plugins may react to file creation events. Any accidental blank-note creation can trigger downstream errors.
- Treat accidental note creation as a critical regression.
