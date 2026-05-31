# See Also Sidebar

Display related notes from frontmatter in a dedicated sidebar view.

| Field | Value |
| --- | --- |
| Author | David Breece |
| Version | 1.1.0 |
| Minimum Obsidian version | 1.7.2 |

## Table of contents

- [Overview](#overview)
- [Features](#features)
- [Installation](#installation)
- [Usage (basic)](#usage-basic)
- [Usage (template system)](#usage-template-system)
- [Configuration](#configuration)
- [Examples](#examples)
- [Development](#development)
- [License](#license)

## Overview

See Also Sidebar reads a `see-also` property from the active note frontmatter and renders related notes in a sidebar panel.

It is useful for:

- Linking conceptually related notes without changing your main note body
- Improving navigation between connected notes
- Showing context-specific links for your current working note

## Features

- Sidebar view for related notes
- Configurable template system with Mustache syntax
- Auto-refresh when active note or metadata changes
- Support for multiple `see-also` note formats
- Ribbon icon to toggle/open the sidebar
- Optional default behavior to open related notes in a new tab
- Optional automatic suggestions based on shared tags (off by default)
- Graceful fallback to a default list if no template is configured ✨

## Installation

This plugin is not yet in the Obsidian Community Plugins directory.

### Manual installation

1. Build or obtain plugin release files: `main.js`, `manifest.json`, and `styles.css`.
2. Create this folder in your vault:

```bash
<YourVault>/.obsidian/plugins/see-also-sidebar/
```

1. Copy files into that folder.
2. In Obsidian, go to **Settings -> Community plugins**.
3. Enable **See Also Sidebar**.

## Usage (basic)

Add a `see-also` property to a note frontmatter block.

By default, only explicit `see-also` entries are shown.

### YAML list format (recommended)

```yaml
---
title: My Note
see-also:
  - Note A
  - Note B
  - Concepts/Note C
---
```

### Inline array format

```yaml
---
see-also: [Note A, Note B, Concepts/Note C]
---
```

### Single string

```yaml
---
see-also: Note A
---
```

### With wikilinks

```yaml
---
see-also:
  - "[[Note A]]"
  - "[[Projects/Note B]]"
---
```

### With aliases

```yaml
---
see-also:
  - "[[Long Technical Note|Quick summary]]"
  - "Project/Spec|Spec overview"
---
```

### With headings/subpaths

```yaml
---
see-also:
  - "Architecture#API Layer"
  - "[[Roadmap#Q3 Priorities]]"
  - "[[Research/Model Notes#Benchmarks|Benchmark section]]"
---
```

### Automatic suggestions (shared tags)

If **Automatic suggestions** is enabled in settings, the sidebar also includes notes that share tags with the active note.

Behavior details:

- Explicit `see-also` entries are always included.
- Tag-derived suggestions are appended to the explicit list.
- The active note is never included in automatic suggestions.
- Duplicate notes (for example, when a note is both explicit and tag-derived) are shown only once.

## Usage (template system)

The sidebar can render using a custom Markdown template and Mustache variables.

### Configure template path

1. Open **Settings -> Community plugins -> See Also Sidebar**.
2. In **Template file**, provide a vault-relative path (for example: `Templates/see-also.md`).
3. You can also use **Browse** to pick a Markdown file.
4. Use **Clear** to reset the setting and return to default list rendering.

### Create a template note

Create a note at your configured path (for example, `Templates/see-also.md`) and add template content.

### Available template variables

| Variable | Description |
| --- | --- |
| `{{active.title}}` | Active note title (basename) |
| `{{active.basename}}` | Active note basename |
| `{{active.path}}` | Active note vault path |
| `{{hasSeeAlso}}` | Boolean flag, true when at least one related note exists |
| `{{count}}` | Number of related notes |
| `{{#seeAlso}} ... {{/seeAlso}}` | Loop over related note entries |
| `{{linkpath}}` | Link path portion of each related entry |
| `{{display}}` | Display text (alias if provided, otherwise link text) |
| `{{title}}` | Resolved note basename when file exists |
| `{{exists}}` | Boolean flag indicating whether note resolves in vault |
| `{{wikilink}}` | Prebuilt wikilink for the related entry |

### Example template

```markdown
## See also

{{#hasSeeAlso}}
Found **{{count}}** related note(s) for **{{active.title}}**:

{{#seeAlso}}
- {{wikilink}}{{^exists}} _(missing)_{{/exists}}
{{/seeAlso}}
{{/hasSeeAlso}}

{{^hasSeeAlso}}
No related notes for **{{active.title}}** yet.
{{/hasSeeAlso}}
```

What this does:

- Shows a heading and related-note count
- Renders each item as a wikilink
- Marks unresolved notes as `(missing)`
- Displays a fallback message when there are no related notes 📝

### Fallback behavior

If no template path is configured, the plugin automatically uses the built-in default list view.

## Configuration

Settings location:

- **Settings -> Community plugins -> See Also Sidebar**

### Settings reference

| Setting | Type | Default | What it does |
| --- | --- | --- | --- |
| Template file | String path | Empty (`""`) | Vault-relative path to a Markdown template note used for Mustache-based rendering. When empty, the plugin uses the default built-in list view. |
| Open links in new tab | Boolean | `false` | When enabled, related-note clicks open in a new tab by default. Users can still use Ctrl/Cmd-click or middle-click as usual. |
| Automatic suggestions | Boolean | `false` | When enabled, the sidebar appends notes that share tags with the active note in addition to explicit `see-also` entries. |

### Template file controls

The settings UI for **Template file** includes two convenience controls:

- **Browse**: opens a Markdown file picker and writes the selected file path to `Template file`.
- **Clear**: empties `Template file`, which switches rendering back to the default list view.

## Examples

### Complete example note

```yaml
---
title: Retrieval patterns
tags: [knowledge, architecture]
see-also:
  - "[[Knowledge Graphs]]"
  - "[[Vector Indexing#Trade-offs|Vector trade-offs]]"
  - "Design Notes|Design overview"
---

# Retrieval patterns

Main note content here.
```

### Example template with style variants

```markdown
### Related to {{active.title}}

{{#hasSeeAlso}}
> Jump to connected notes:

{{#seeAlso}}
- ✅ {{wikilink}}
{{/seeAlso}}

_Path: {{active.path}}_
{{/hasSeeAlso}}

{{^hasSeeAlso}}
> Add `see-also` in frontmatter to populate this panel.
{{/hasSeeAlso}}
```

### Screenshot guidance

If you want screenshots in this README, add image files to a folder such as `docs/images/` and include sections like:

- Sidebar with default list rendering
- Sidebar with custom template rendering
- Settings panel with template picker ⚙️

Example markdown image reference:

```markdown
![See Also Sidebar - default list](docs/images/sidebar-default.png)
```

## Development

Build from source:

```bash
npm install
npm run build
npm run lint
```

For watch mode during development:

```bash
npm run dev
```

## License

This project includes a `LICENSE` file at the repository root.
