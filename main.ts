import {
  Plugin,
  WorkspaceLeaf,
  ItemView,
  TFile,
} from "obsidian";

const VIEW_TYPE = "see-also-sidebar";

class SeeAlsoView extends ItemView {
  private notes: string[] = [];

  getViewType() { return VIEW_TYPE; }
  getDisplayText() { return "See Also"; }
  getIcon() { return "link"; }

  async onOpen() { this.render(); }

  update(notes: string[]) {
    this.notes = notes;
    this.render();
  }

  private render() {
    const root = this.containerEl.children[1] as HTMLElement;
    root.empty();
    root.addClass("see-also-root");

    if (this.notes.length === 0) {
      root.createEl("p", { text: "No related notes.", cls: "see-also-empty" });
      return;
    }

    root.createEl("p", { text: "See Also", cls: "see-also-heading" });
    const ul = root.createEl("ul", { cls: "see-also-list" });

    for (const raw of this.notes) {
      // Strip [[ ]] brackets if the author used wikilink syntax in frontmatter
      const stripped = raw.replace(/^\[\[|\]\]$/g, "").trim();
      // Support aliased links:  Real Note|Display Name
      const [notePath, alias] = stripped.split("|");
      const displayText = alias ?? notePath;

      const li = ul.createEl("li", { cls: "see-also-item" });
      const a = li.createEl("a", {
        text: displayText,
        cls: "internal-link",
        href: notePath,
      });
      a.dataset.href = notePath;

      // Click: open the note
      a.addEventListener("click", (e) => {
        e.preventDefault();
        this.app.workspace.openLinkText(notePath, "", false);
      });

      // Hover: show Obsidian's native preview popup
      a.addEventListener("mouseover", (e) => {
        this.app.workspace.trigger("hover-link", {
          event: e,
          source: VIEW_TYPE,
          hoverParent: this,
          targetEl: a,
          linktext: notePath,
        });
      });
    }
  }
}

export default class SeeAlsoPlugin extends Plugin {
  private view: SeeAlsoView | null = null;

  async onload() {
    this.registerView(VIEW_TYPE, (leaf) => {
      this.view = new SeeAlsoView(leaf);
      return this.view;
    });

    this.addRibbonIcon("link", "See Also Sidebar", () => this.activateView());

    // Refresh when you switch notes
    this.registerEvent(
      this.app.workspace.on("active-leaf-change", () => this.refresh())
    );

    // Refresh when frontmatter changes in the active file
    this.registerEvent(
      this.app.metadataCache.on("changed", (file: TFile) => {
        if (this.app.workspace.getActiveFile()?.path === file.path) {
          this.refresh();
        }
      })
    );

    this.app.workspace.onLayoutReady(() => this.activateView());
  }

  async activateView() {
    const { workspace } = this.app;
    let [leaf] = workspace.getLeavesOfType(VIEW_TYPE);
    if (!leaf) {
      leaf = workspace.getRightLeaf(false)!;
      await leaf.setViewState({ type: VIEW_TYPE, active: true });
    }
    workspace.revealLeaf(leaf);
    this.refresh();
  }

  private refresh() {
    if (!this.view) return;
    const active = this.app.workspace.getActiveFile();
    if (!active) { this.view.update([]); return; }

    const cache = this.app.metadataCache.getFileCache(active);
    const raw = cache?.frontmatter?.["see-also"];

    let notes: string[] = [];
    if (Array.isArray(raw)) notes = raw.map(String);
    else if (typeof raw === "string" && raw.trim()) notes = [raw];

    this.view.update(notes);
  }

  async onunload() {
    this.app.workspace.detachLeavesOfType(VIEW_TYPE);
  }
}