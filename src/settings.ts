import {
  App,
  Notice,
  Plugin,
  PluginSettingTab,
  Setting,
} from "obsidian";

const DEFAULT_CUSTOM_GROUP_LABEL = "Custom";

export type SeeAlsoListPosition = "above" | "below" | "hidden";

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
  customLinksPosition: SeeAlsoListPosition;
  customGroupLabel: string;
}

type DeclarativeControl =
  | {
      type: "text";
      key: keyof SeeAlsoSettings;
      placeholder?: string;
      validate?: (value: string) => string | undefined;
    }
  | {
      type: "toggle";
      key: keyof SeeAlsoSettings;
    }
  | {
      type: "dropdown";
      key: keyof SeeAlsoSettings;
      options: Record<string, string>;
      defaultValue?: string;
    };

interface DeclarativeSettingDefinition {
  name: string;
  desc?: string;
  visible?: boolean | (() => boolean);
  control: DeclarativeControl;
}

export const DEFAULT_SETTINGS: SeeAlsoSettings = {
  sidebarHeadingText: "See also",
  openInNewTabByDefault: false,
  automaticSuggestions: false,
  groupAutomaticSuggestionsByTag: true,
  customLinksPosition: "above",
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
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName("Sidebar heading text")
      .setDesc("Text shown above related notes in the sidebar.")
      .addText((text) => {
        text
          .setPlaceholder("See also")
          .setValue(this.plugin.settings.sidebarHeadingText)
          .onChange(async (value) => {
            this.plugin.settings.sidebarHeadingText = value;
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName("Open links in new tab")
      .setDesc("When enabled, clicking a related note opens it in a new tab by default.")
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.settings.openInNewTabByDefault)
          .onChange(async (value) => {
            this.plugin.settings.openInNewTabByDefault = value;
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName("Automatic suggestions")
      .setDesc("When enabled, the plugin scans Markdown file paths in your vault to find notes sharing tags with the active note. This is local only and disabled by default.")
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.settings.automaticSuggestions)
          .onChange(async (value) => {
            this.plugin.settings.automaticSuggestions = value;
            await this.plugin.saveSettings();
            this.display();
          });
      });

    new Setting(containerEl)
      .setName("Group automatic suggestions by tag")
      .setDesc("When enabled, automatic suggestions can be grouped by their shared tag.")
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.settings.groupAutomaticSuggestionsByTag)
          .setDisabled(!this.plugin.settings.automaticSuggestions)
          .onChange(async (value) => {
            this.plugin.settings.groupAutomaticSuggestionsByTag = value;
            await this.plugin.saveSettings();
            this.display();
          });
      });

    if (this.shouldShowCustomLinksPosition()) {
      new Setting(containerEl)
        .setName("Custom links position")
        .setDesc("Choose where custom links appear relative to automatic suggestions: above, below, or hidden.")
        .addDropdown((dropdown) => {
          dropdown
            .addOption("above", "Above automatic suggestions")
            .addOption("below", "Below automatic suggestions")
            .addOption("hidden", "Hidden")
            .setValue(this.plugin.settings.customLinksPosition)
            .onChange(async (value) => {
              if (value === "above" || value === "below" || value === "hidden") {
                this.plugin.settings.customLinksPosition = value;
                await this.plugin.saveSettings();
              }
            });
        });
    }

    new Setting(containerEl)
      .setName("Custom group label")
      .setDesc("Label for grouped links that don't match a specific tag. Uses alphanumeric characters only (a-z, 0-9). Maximum 255 characters.")
      .addText((text) => {
        text
          .setPlaceholder(DEFAULT_CUSTOM_GROUP_LABEL)
          .setValue(this.plugin.settings.customGroupLabel)
          .onChange(async (value) => {
            const sanitized = sanitizeCustomGroupLabel(value);
            this.plugin.settings.customGroupLabel = sanitized;
            if (sanitized !== value) {
              new Notice(`Custom group label was sanitized to: ${sanitized}`);
              text.setValue(sanitized);
            }
            await this.plugin.saveSettings();
          });
      });
  }

  getSettingDefinitions(): DeclarativeSettingDefinition[] {
    try {
      return this.buildSettingDefinitions();
    } catch (error) {
      console.error("[see-also-sidebar] Failed to build declarative settings definitions", error);
      return [];
    }
  }

  private shouldShowCustomLinksPosition(): boolean {
    return this.plugin.settings.automaticSuggestions === true && this.plugin.settings.groupAutomaticSuggestionsByTag === true;
  }

  private buildSettingDefinitions(): DeclarativeSettingDefinition[] {
    const textControl: DeclarativeControl = {
      type: "text",
      key: "sidebarHeadingText",
      placeholder: "See also",
    };
    const toggleOpenNewTab: DeclarativeControl = {
      type: "toggle",
      key: "openInNewTabByDefault",
    };
    const toggleAutoSuggestions: DeclarativeControl = {
      type: "toggle",
      key: "automaticSuggestions",
    };
    const toggleGroupBytag: DeclarativeControl = {
      type: "toggle",
      key: "groupAutomaticSuggestionsByTag",
    };
    const customLinksPositionControl: DeclarativeControl = {
      type: "dropdown",
      key: "customLinksPosition",
      defaultValue: "above",
      options: {
        above: "Above automatic suggestions",
        below: "Below automatic suggestions",
        hidden: "Hidden",
      },
    };
    const customLabelControl: DeclarativeControl = {
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
        name: "Custom links position",
        desc: "Choose where custom links appear relative to automatic suggestions: above, below, or hidden.",
        visible: () => this.shouldShowCustomLinksPosition(),
        control: customLinksPositionControl,
      },
      {
        name: "Custom group label",
        desc: "Label for grouped links that don't match a specific tag. Uses alphanumeric characters only (a-z, 0-9). Maximum 255 characters.",
        control: customLabelControl,
      },
    ];
  }
}
