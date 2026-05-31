import { Plugin, TFile } from "obsidian";

import { DEFAULT_SETTINGS, type SeeAlsoSettings, SeeAlsoSettingTab } from "./settings";
import { SeeAlsoView, SEE_ALSO_VIEW_TYPE } from "./view/SeeAlsoView";

export default class SeeAlsoPlugin extends Plugin {
  settings: SeeAlsoSettings = DEFAULT_SETTINGS;
  private lastRefreshedActivePath: string | null = null;

  private getOpenInNewTabByDefault(): boolean {
    return this.settings.openInNewTabByDefault === true;
  }

  private getAutomaticSuggestionsEnabled(): boolean {
    return this.settings.automaticSuggestions === true;
  }

  private getGroupAutomaticSuggestionsByTagEnabled(): boolean {
    // This setting is only meaningful when automatic suggestions are enabled.
    return this.getAutomaticSuggestionsEnabled() && this.settings.groupAutomaticSuggestionsByTag === true;
  }

  private parseSettings(data: unknown): Partial<SeeAlsoSettings> {
    if (!data || typeof data !== "object") return {};
    const record = data as Record<string, unknown>;
    const parsed: Partial<SeeAlsoSettings> = {};

    if (typeof record.sidebarHeadingText === "string") {
      parsed.sidebarHeadingText = record.sidebarHeadingText;
    }
    if (typeof record.openInNewTabByDefault === "boolean") {
      parsed.openInNewTabByDefault = record.openInNewTabByDefault;
    }
    if (typeof record.automaticSuggestions === "boolean") {
      parsed.automaticSuggestions = record.automaticSuggestions;
    }
    if (typeof record.groupAutomaticSuggestionsByTag === "boolean") {
      parsed.groupAutomaticSuggestionsByTag = record.groupAutomaticSuggestionsByTag;
    }

    return parsed;
  }

  private getView(): SeeAlsoView | null {
    const [leaf] = this.app.workspace.getLeavesOfType(SEE_ALSO_VIEW_TYPE);
    if (!leaf) return null;
    const view = leaf.view;
    return view instanceof SeeAlsoView ? view : null;
  }

  async onload(): Promise<void> {
    await this.loadSettings();

    this.registerView(SEE_ALSO_VIEW_TYPE, (leaf) =>
      new SeeAlsoView(leaf, {
        getSidebarHeadingText: () => this.settings.sidebarHeadingText,
        getOpenInNewTabByDefault: () => this.getOpenInNewTabByDefault(),
        getAutomaticSuggestionsEnabled: () => this.getAutomaticSuggestionsEnabled(),
        getGroupAutomaticSuggestionsByTagEnabled: () => this.getGroupAutomaticSuggestionsByTagEnabled(),
      })
    );

    this.addSettingTab(new SeeAlsoSettingTab(this.app, this));

    this.addRibbonIcon("link", "See also sidebar", () => {
      void this.activateView();
    });

    // Refresh when the active note actually changes.
    this.registerEvent(
      this.app.workspace.on("active-leaf-change", () => {
        const activePath = this.app.workspace.getActiveFile()?.path ?? null;
        if (activePath === this.lastRefreshedActivePath) return;
        this.lastRefreshedActivePath = activePath;
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
    this.lastRefreshedActivePath = this.app.workspace.getActiveFile()?.path ?? null;
    await this.refresh();
  }

  private async refresh(): Promise<void> {
    const view = this.getView();
    if (!view) return;
    await view.refresh();
  }
}