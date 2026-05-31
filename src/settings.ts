import {
  App,
  Plugin,
  PluginSettingTab,
  Setting,
} from "obsidian";

export interface SeeAlsoSettings {
  sidebarHeadingText: string;
  openInNewTabByDefault: boolean;
  automaticSuggestions: boolean;
  groupAutomaticSuggestionsByTag: boolean;
}

export const DEFAULT_SETTINGS: SeeAlsoSettings = {
  sidebarHeadingText: "See also",
  openInNewTabByDefault: false,
  automaticSuggestions: false,
  groupAutomaticSuggestionsByTag: true,
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
        "When enabled, notes sharing tags with the active note are suggested in addition to explicit see-also notes."
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
  }
}
