import {
  App,
  Notice,
  Plugin,
  PluginSettingTab,
} from "obsidian";

const DEFAULT_CUSTOM_GROUP_LABEL = "Custom";

export function sanitizeCustomGroupLabel(raw: unknown): string {
  const input = typeof raw === "string" ? raw : "";

  // Spec:
  // 1) Trim whitespace
  // 2) Remove all non-alphanumeric (A-Z, a-z, 0-9)
  // 3) Truncate to 255 chars
  // 4) Fall back to DEFAULT_CUSTOM_GROUP_LABEL if empty
  let value = input.trim();
  value = value.replace(/[^A-Za-z0-9]/g, "");
  if (value.length > 255) value = value.slice(0, 255);
  return value.length > 0 ? value : DEFAULT_CUSTOM_GROUP_LABEL;
}

export interface SeeAlsoSettings {
  sidebarHeadingText: string;
  openInNewTabByDefault: boolean;
  automaticSuggestions: boolean;
  groupAutomaticSuggestionsByTag: boolean;
  customGroupLabel: string;
}

export const DEFAULT_SETTINGS: SeeAlsoSettings = {
  sidebarHeadingText: "See also",
  openInNewTabByDefault: false,
  automaticSuggestions: false,
  groupAutomaticSuggestionsByTag: true,
  customGroupLabel: DEFAULT_CUSTOM_GROUP_LABEL,
};

export class SeeAlsoSettingTab extends PluginSettingTab {
  private readonly plugin: Plugin & {
    settings: SeeAlsoSettings;
    saveSettings: () => Promise<void>;
  };

  constructor(app: App, plugin: Plugin & { settings: SeeAlsoSettings; saveSettings: () => Promise<void> }) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    // Intentionally empty. Obsidian 1.13.0+ uses getSettingDefinitions() instead.
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getSettingDefinitions(): any[] {
    const textControl = {
      type: "text",
      key: "sidebarHeadingText",
      placeholder: "See also",
    };
    const toggleOpenNewTab = {
      type: "toggle",
      key: "openInNewTabByDefault",
    };
    const toggleAutoSuggestions = {
      type: "toggle",
      key: "automaticSuggestions",
    };
    const toggleGroupBytag = {
      type: "toggle",
      key: "groupAutomaticSuggestionsByTag",
    };
    const customLabelControl = {
      type: "text",
      key: "customGroupLabel",
      placeholder: DEFAULT_CUSTOM_GROUP_LABEL,
      validate: (value: string) => {
        const sanitized = sanitizeCustomGroupLabel(value);
        if (sanitized !== value) {
          new Notice(`Custom group label was sanitized to: ${sanitized}`);
          this.plugin.settings.customGroupLabel = sanitized;
          void this.plugin.saveSettings();
          return `Sanitized to: ${sanitized}`;
        }
        return undefined;
      },
    };

    return [
      {
        name: "Sidebar heading text",
        desc: "Text shown above related notes in the sidebar.",
        control: textControl,
      },
      {
        name: "Open links in new tab",
        desc: "When enabled, clicking a related note opens it in a new tab by default.",
        control: toggleOpenNewTab,
      },
      {
        name: "Automatic suggestions",
        desc: "When enabled, the plugin scans Markdown file paths in your vault to find notes sharing tags with the active note. This is local only and disabled by default.",
        control: toggleAutoSuggestions,
      },
      {
        name: "Group automatic suggestions by tag",
        desc: "When enabled, automatic suggestions can be grouped by their shared tag.",
        control: toggleGroupBytag,
      },
      {
        name: "Custom group label",
        desc: "Label for grouped links that don't match a specific tag. Uses alphanumeric characters only (a-z, 0-9). Maximum 255 characters.",
        control: customLabelControl,
      },
    ] as any[]; // eslint-disable-line @typescript-eslint/no-explicit-any
  }
}
