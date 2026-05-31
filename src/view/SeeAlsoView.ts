import { ItemView, MarkdownRenderer, TFile, WorkspaceLeaf } from "obsidian";
import {
  buildTemplateContext,
  parseSeeAlso,
  resolveSeeAlsoEntries,
  type SeeAlsoResolvedEntry,
} from "../seeAlso/resolve";
import type { TemplateEngine } from "../template/templateEngine";

export interface SeeAlsoViewDeps {
  templateEngine: TemplateEngine;
  getTemplatePath: () => string;
  getOpenInNewTabByDefault: () => boolean;
}

const VIEW_TYPE = "see-also-sidebar";

export class SeeAlsoView extends ItemView {
  private notes: string[] = [];
  private renderToken = 0;
  private lastMainLeaf: WorkspaceLeaf | null = null;

  constructor(leaf: WorkspaceLeaf, private readonly deps: SeeAlsoViewDeps) {
    super(leaf);
  }

  getViewType(): string {
    return VIEW_TYPE;
  }

  getDisplayText(): string {
    return "See also";
  }

  getIcon(): string {
    return "link";
  }

  async onOpen(): Promise<void> {
    // Watch for active-leaf changes, but only record the leaf if it's in
    // the root split (main editor area) — never a sidebar leaf.
    this.registerEvent(
      this.app.workspace.on("active-leaf-change", (leaf) => {
        if (leaf && this.isInRootSplit(leaf)) {
          this.lastMainLeaf = leaf;
        }
      })
    );
    await this.refresh();
  }

  async onClose(): Promise<void> {
    // No-op for now; kept for lifecycle symmetry.
  }

  update(notes: string[]): void {
    this.notes = notes;
    void this.refresh();
  }

  async refresh(): Promise<void> {
    const active = this.app.workspace.getActiveFile();
    if (!active) {
      this.containerEl.empty();
      return;
    }

    const cache = this.app.metadataCache.getFileCache(active);
    const seeAlsoValue: unknown = cache?.frontmatter?.["see-also"] as unknown;
    const notes = parseSeeAlso(seeAlsoValue);
    this.notes = notes;

    this.renderToken++;
    const token = this.renderToken;

    const root = this.containerEl;
    root.empty();
    root.addClass("see-also-root");

    const resolved = await resolveSeeAlsoEntries(
      notes,
      active.path,
      this.app.metadataCache
    );
    if (token !== this.renderToken) return;

    const renderedFromTemplate = await this.renderTemplate(
      root,
      active,
      resolved,
      token
    );
    if (token !== this.renderToken) return;
    if (renderedFromTemplate) return;

    this.renderManual(root, resolved, active.path);
  }

  // Walk up the parent chain to check if this leaf lives in the root
  // (main editor) split rather than a left/right sidebar split.
  private isInRootSplit(leaf: WorkspaceLeaf): boolean {
    let node: unknown = (leaf as WorkspaceLeaf & { parent?: unknown }).parent;
    while (node) {
      if (node === this.app.workspace.rootSplit) return true;
      if (typeof node !== "object") return false;
      node = (node as { parent?: unknown }).parent ?? null;
    }
    return false;
  }

  // Return the leaf we should navigate into.
  // Priority: new tab (modifier held) → last tracked main leaf → any root
  // leaf → new tab as last resort.
  private getTargetLeaf(newTab: boolean): WorkspaceLeaf {
    if (newTab) {
      return this.app.workspace.getLeaf("tab");
    }

    if (this.lastMainLeaf) {
      return this.lastMainLeaf;
    }
    // Fallback: grab the first leaf iterateRootLeaves finds.
    let fallback: WorkspaceLeaf | null = null;
    this.app.workspace.iterateRootLeaves((leaf) => {
      if (!fallback) fallback = leaf;
    });

    if (fallback) {
      return fallback;
    }

    // Last resort when no root leaf can be found.
    return this.app.workspace.getLeaf(newTab ? "tab" : false);
  }

  private captureMainLeafBeforeClick(): void {
    const candidate = this.app.workspace.getLeaf(false);
    if (candidate === this.leaf) return;
    if (!this.isInRootSplit(candidate)) return;
    this.lastMainLeaf = candidate;
  }

  private bindLinkNavigation(
    anchor: HTMLAnchorElement,
    sourcePath: string,
    getLinkpath: () => string
  ): void {
    // Capture the currently active main-area leaf before this sidebar
    // click shifts focus to the sidebar leaf.
    anchor.addEventListener("mousedown", () => {
      this.captureMainLeafBeforeClick();
    });

    anchor.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      this.captureMainLeafBeforeClick();

      const linkpath = getLinkpath().trim();
      if (!linkpath) return;

      const file = this.app.metadataCache.getFirstLinkpathDest(linkpath, sourcePath);
      if (!file) return;

      const newTab =
        this.deps.getOpenInNewTabByDefault() || event.ctrlKey || event.metaKey;
      const targetLeaf = this.getTargetLeaf(newTab);
      void targetLeaf.openFile(file);
    });
  }

  private normalizeRenderedLinkpath(rawTarget: string | null): string {
    if (!rawTarget) return "";

    const trimmed = rawTarget.trim();
    if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("obsidian://")) {
      return "";
    }

    const hashIndex = trimmed.indexOf("#");
    const base = hashIndex === -1 ? trimmed : trimmed.slice(0, hashIndex);
    return base;
  }

  private wireRenderedTemplateLinks(root: HTMLElement, sourcePath: string): void {
    const links = root.querySelectorAll("a.internal-link");

    for (const node of Array.from(links)) {
      if (!node.instanceOf(HTMLAnchorElement)) continue;
      const link = node;

      link.classList.add("see-also-link");
      this.bindLinkNavigation(link, sourcePath, () => {
        const rawTarget = link.getAttribute("data-href") ?? link.getAttribute("href");
        return this.normalizeRenderedLinkpath(rawTarget);
      });
    }
  }

  private async renderTemplate(
    root: HTMLElement,
    activeFile: TFile,
    resolved: SeeAlsoResolvedEntry[],
    token: number
  ): Promise<boolean> {
    const templatePath = this.deps.getTemplatePath().trim();
    if (!templatePath) return false;

    let template: string | null;
    try {
      template = await this.deps.templateEngine.loadTemplateContent();
    } catch (error) {
      console.error("[see-also-sidebar] Failed to load template", error);
      return false;
    }

    if (!template) return false;
    if (token !== this.renderToken) return true;

    const context = buildTemplateContext(activeFile, this.app.metadataCache, resolved);
    const markdown = this.deps.templateEngine.render(
      template,
      context as unknown as Record<string, unknown>
    );

    root.empty();
    await MarkdownRenderer.render(this.app, markdown, root, activeFile.path, this);
    if (token !== this.renderToken) return true;

    this.wireRenderedTemplateLinks(root, activeFile.path);
    return true;
  }

  private renderManual(
    root: HTMLElement,
    resolved: SeeAlsoResolvedEntry[],
    sourcePath: string
  ): void {

    root.empty();
    root.createEl("h3", { text: "See also" });

    if (resolved.length === 0) {
      root.createEl("p", {
        text: "No related notes found",
        cls: "see-also-empty",
      });
      return;
    }

    const ul = root.createEl("ul");

    for (const entry of resolved) {
      const li = ul.createEl("li");
      const a = li.createEl("a", {
        text: entry.display,
        cls: "see-also-link",
      });

      this.bindLinkNavigation(a, sourcePath, () => entry.linkpath);

      a.setAttribute("role", "button");
      a.setAttribute("tabindex", "0");

      a.addEventListener("keydown", (event: KeyboardEvent) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        a.click();
      });
    }
  }
}

export const SEE_ALSO_VIEW_TYPE = VIEW_TYPE;