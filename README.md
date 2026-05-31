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
- [Usage](#usage)
- [Configuration](#configuration)
- [Development](#development)
- [License](#license)

## Overview

See Also Sidebar reads a `see-also` property from the active note frontmatter and renders related notes in a sidebar panel.

## Features

- Sidebar view for related notes
- Safe click behavior: resolves to existing files before opening, never creates notes from sidebar clicks
- Support for multiple `see-also` formats
- Ribbon icon to open the sidebar
- Optional default behavior to open related notes in a new tab
- Optional automatic suggestions based on shared tags
- Optional grouped mode for automatic suggestions
- Configurable sidebar heading text

## Installation

This plugin is not yet in the Obsidian Community Plugins directory.

### Manual installation

1. Build or obtain plugin release files: `main.js`, `manifest.json`, and `styles.css`.
2. Create this folder in your vault:

```bash
<YourVault>/.obsidian/plugins/see-also-sidebar/
```

3. Copy files into that folder.
4. In Obsidian, go to **Settings -> Community plugins**.
5. Enable **See Also Sidebar**.

## Usage

Add a `see-also` property to a note frontmatter block.

### YAML list format (recommended)

```yaml
---
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

### With wikilinks, aliases, and headings

```yaml
---
see-also:
  - "[[Note A]]"
  - "[[Long Technical Note|Quick summary]]"
  - "Architecture#API Layer"
---
```

### Automatic suggestions

When **Automatic suggestions** is enabled, notes that share tags with the active note are suggested in addition to explicit `see-also` entries.

Behavior details:

- Explicit `see-also` entries are always included.
- With grouping disabled, automatic suggestions are merged into one flat list.
- With grouping enabled, explicit entries are rendered under **Custom**, and automatic entries are rendered directly under tag headers.
- In grouped mode, there is no intermediate **Suggestions** heading.
- The active note is never included in automatic suggestions.
- Duplicate notes are shown only once.

## Configuration

Settings location:

- **Settings -> Community plugins -> See Also Sidebar**

### Settings reference

| Setting | Type | Default | What it does |
| --- | --- | --- | --- |
| Sidebar heading text | String | `See also` | Text used as the sidebar heading. Empty or whitespace values fall back to `See also`. |
| Open links in new tab | Boolean | `false` | When enabled, related-note clicks open in a new tab by default. Ctrl/Cmd-click and middle-click still open in a new tab. |
| Automatic suggestions | Boolean | `false` | When enabled, the sidebar also includes notes that share tags with the active note. |
| Group automatic suggestions by tag | Boolean | `true` | When enabled (and automatic suggestions is on), grouped mode shows **Custom** followed by tag-based sections. |

## Development

Build from source:

```bash
npm install
npm run lint
npm run build
```

For watch mode:

```bash
npm run dev
```

## License

This project includes a `LICENSE` file at the repository root.
