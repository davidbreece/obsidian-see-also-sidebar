import {
  App,
  Notice,
  Plugin,
  PluginSettingTab,
  Setting,
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
      .setDesc(
        "When enabled, the plugin scans Markdown file paths in your vault to find notes sharing tags with the active note. This is local only and disabled by default."
      )
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
          });
      });

    new Setting(containerEl)
      .setName("Custom group label")
      .setDesc(
        "Label for grouped links that don't match a specific tag. Uses alphanumeric characters only (a-z, 0-9). Maximum 255 characters."
      )
      .addText((text) => {
        text
          .setPlaceholder(DEFAULT_CUSTOM_GROUP_LABEL)
          .setValue(this.plugin.settings.customGroupLabel)
          // Keep input responsive while typing; sanitize on blur.
          .onChange((value) => {
            this.plugin.settings.customGroupLabel = value;
          });

        text.inputEl.addEventListener("blur", () => {
          void (async () => {
            const raw = text.getValue();
            const sanitized = sanitizeCustomGroupLabel(raw);

            if (sanitized !== raw) {
              new Notice(`Custom group label was sanitized to: ${sanitized}`);
            }

            if (this.plugin.settings.customGroupLabel !== sanitized) {
              this.plugin.settings.customGroupLabel = sanitized;
            }

            // Ensure the UI reflects the persisted, sanitized value.
            if (text.getValue() !== sanitized) {
              text.setValue(sanitized);
            }

            await this.plugin.saveSettings();
          })();
        });
      });
  }
}
