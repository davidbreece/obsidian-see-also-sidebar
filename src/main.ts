import { Plugin, TAbstractFile, TFile } from "obsidian";

import { DEFAULT_SETTINGS, type SeeAlsoSettings, SeeAlsoSettingTab } from "./settings";
import { TemplateEngine } from "./template/templateEngine";
import { SeeAlsoView, SEE_ALSO_VIEW_TYPE } from "./view/SeeAlsoView";

export default class SeeAlsoPlugin extends Plugin {
  settings: SeeAlsoSettings = DEFAULT_SETTINGS;
  private templateEngine!: TemplateEngine;

  private parseSettings(data: unknown): Partial<SeeAlsoSettings> {
    if (!data || typeof data !== "object") return {};
    const record = data as Record<string, unknown>;

    const templatePath = typeof record.templatePath === "string" ? record.templatePath : undefined;

    return {
      templatePath,
    };
  }

  private getView(): SeeAlsoView | null {
    const [leaf] = this.app.workspace.getLeavesOfType(SEE_ALSO_VIEW_TYPE);
    if (!leaf) return null;
    const view = leaf.view;
    return view instanceof SeeAlsoView ? view : null;
  }

  async onload(): Promise<void> {
    await this.loadSettings();
    this.templateEngine = new TemplateEngine(this.app.vault);
    this.templateEngine.setTemplatePath(this.settings.templatePath);

    this.registerView(SEE_ALSO_VIEW_TYPE, (leaf) =>
      new SeeAlsoView(leaf, {
        templateEngine: this.templateEngine,
        getTemplatePath: () => this.settings.templatePath,
      })
    );

    this.addSettingTab(new SeeAlsoSettingTab(this.app, this));

    this.addRibbonIcon("link", "See also sidebar", () => {
      void this.activateView();
    });

    // Refresh when you switch notes
    this.registerEvent(
      this.app.workspace.on("active-leaf-change", () => {
        void this.refresh();
      })
    );

    // Refresh when frontmatter changes in the active file
    this.registerEvent(
      this.app.metadataCache.on("changed", (file: TFile) => {
        if (this.app.workspace.getActiveFile()?.path === file.path) {
          void this.refresh();
        }
      })
    );

    // Invalidate template cache if the template file changes.
    this.registerEvent(
      this.app.vault.on("modify", (file: TAbstractFile) => {
        if (file instanceof TFile && file.path === this.settings.templatePath) {
          this.templateEngine.invalidate();
          void this.refresh();
        }
      })
    );

    this.registerEvent(
      this.app.vault.on("rename", (_file: TAbstractFile, oldPath: string) => {
        if (oldPath === this.settings.templatePath) {
          this.templateEngine.invalidate();
          void this.refresh();
        }
      })
    );

    this.registerEvent(
      this.app.vault.on("delete", (file: TAbstractFile) => {
        if (file.path === this.settings.templatePath) {
          this.templateEngine.invalidate();
          void this.refresh();
        }
      })
    );

    this.app.workspace.onLayoutReady(() => {
      void this.activateView();
    });
  }

  async loadSettings(): Promise<void> {
    const data: unknown = await this.loadData();
    this.settings = Object.assign({}, DEFAULT_SETTINGS, this.parseSettings(data));
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
    this.templateEngine?.setTemplatePath(this.settings.templatePath);
    void this.refresh();
  }

  async activateView(): Promise<void> {
    const { workspace } = this.app;
    let [leaf] = workspace.getLeavesOfType(SEE_ALSO_VIEW_TYPE);
    if (!leaf) {
      leaf = workspace.getRightLeaf(false)!;
      await leaf.setViewState({ type: SEE_ALSO_VIEW_TYPE, active: true });
    }
    await workspace.revealLeaf(leaf);
    await this.refresh();
  }

  private async refresh(): Promise<void> {
    const view = this.getView();
    if (!view) return;
    await view.refresh();
  }
}