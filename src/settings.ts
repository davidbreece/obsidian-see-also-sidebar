import {
  App,
  FuzzySuggestModal,
  Plugin,
  PluginSettingTab,
  Setting,
  TAbstractFile,
  TFile,
} from "obsidian";

export interface SeeAlsoSettings {
  templatePath: string;
  openInNewTabByDefault: boolean;
}

export const DEFAULT_SETTINGS: SeeAlsoSettings = {
  templatePath: "",
  openInNewTabByDefault: false,
};

class TemplateFileSuggestModal extends FuzzySuggestModal<TFile> {
  private readonly onChoose: (file: TFile) => void;

  constructor(app: App, onChoose: (file: TFile) => void) {
    super(app);
    this.onChoose = onChoose;
    this.setPlaceholder("Search for a Markdown template file");
  }

  getItems(): TFile[] {
    return this.app.vault.getMarkdownFiles();
  }

  getItemText(item: TFile): string {
    return item.path;
  }

  onChooseItem(item: TFile): void {
    this.onChoose(item);
  }
}

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

    new Setting(containerEl).setName("Template").setHeading();

    new Setting(containerEl)
      .setName("Template file")
      .setDesc(
        "Optional. A vault-relative path to a Markdown file that will be rendered with mustache using the see-also context. Leave empty to use the default list view."
      )
      .addText((text) => {
        text
          .setPlaceholder("e.g. Templates/see-also.md")
          .setValue(this.plugin.settings.templatePath)
          .onChange(async (value) => {
            this.plugin.settings.templatePath = value.trim();
            await this.plugin.saveSettings();
          });

        // Show a subtle inline warning if the path doesn't currently resolve.
        const maybeFile: TAbstractFile | null = this.app.vault.getAbstractFileByPath(
          this.plugin.settings.templatePath
        );
        if (this.plugin.settings.templatePath && !(maybeFile instanceof TFile)) {
          text.inputEl.classList.add("is-invalid");
          text.inputEl.setAttribute("aria-invalid", "true");
        }

        return text;
      })
      .addButton((btn) => {
        btn.setButtonText("Browse").onClick(() => {
          new TemplateFileSuggestModal(this.app, (file) => {
            this.plugin.settings.templatePath = file.path;
            void (async () => {
              await this.plugin.saveSettings();
              this.display();
            })();
          }).open();
        });
      })
      .addExtraButton((btn) => {
        btn.setIcon("reset");
        btn.setTooltip("Clear");
        btn.onClick(async () => {
          this.plugin.settings.templatePath = "";
          await this.plugin.saveSettings();
          this.display();
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
  }
}
