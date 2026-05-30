import { Component, ItemView, MarkdownRenderer, WorkspaceLeaf } from "obsidian";

import { parseSeeAlso, resolveSeeAlsoEntries, buildTemplateContext } from "../seeAlso/resolve";
import type { TemplateEngine } from "../template/templateEngine";

export interface SeeAlsoViewDeps {
  templateEngine: TemplateEngine;
  getTemplatePath: () => string;
}

const VIEW_TYPE = "see-also-sidebar";

export class SeeAlsoView extends ItemView {
  private notes: string[] = [];
  private renderToken = 0;
  private markdownComponent: Component | null = null;

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
    await this.refresh();
  }

  async onClose(): Promise<void> {
    this.unloadMarkdownComponent();
  }

  update(notes: string[]): void {
    this.notes = notes;
    void this.refresh();
  }

  async refresh(): Promise<void> {
    const token = ++this.renderToken;

    const root = this.containerEl.children[1] as HTMLElement;
    root.empty();
    root.addClass("see-also-root");

    const active = this.app.workspace.getActiveFile();
    if (!active) {
      root.createEl("p", { text: "No active note.", cls: "see-also-empty" });
      return;
    }

    const cache = this.app.metadataCache.getFileCache(active);
    const raw: unknown = cache?.frontmatter?.["see-also"];
    const notes = parseSeeAlso(raw);
    this.notes = notes;

    const templatePath = this.deps.getTemplatePath().trim();

    if (!templatePath) {
      this.renderLegacy(root, notes);
      return;
    }

    this.deps.templateEngine.setTemplatePath(templatePath);

    let templateContent: string;
    try {
      const loaded = await this.deps.templateEngine.loadTemplateContent();
      if (token !== this.renderToken) return;

      if (!loaded) {
        this.renderLegacy(root, notes);
        return;
      }
      templateContent = loaded;
    } catch (err) {
      root.createEl("p", {
        text: `Template error: ${err instanceof Error ? err.message : String(err)}`,
        cls: "see-also-empty",
      });
      this.renderLegacy(root, notes);
      return;
    }

    try {
      const resolved = await resolveSeeAlsoEntries(
        notes,
        active.path,
        this.app.metadataCache
      );
      if (token !== this.renderToken) return;

      const ctx = buildTemplateContext(active, this.app.metadataCache, resolved);
      const renderedMarkdown = this.deps.templateEngine.render(templateContent, ctx as unknown as Record<string, unknown>);

      if (token !== this.renderToken) return;

      this.unloadMarkdownComponent();
      this.markdownComponent = new Component();
      this.addChild(this.markdownComponent);

      await MarkdownRenderer.render(this.app, renderedMarkdown, root, active.path, this.markdownComponent);
    } catch (err) {
      root.createEl("p", {
        text: `Template render failed: ${err instanceof Error ? err.message : String(err)}`,
        cls: "see-also-empty",
      });
      this.renderLegacy(root, notes);
    }
  }

  private unloadMarkdownComponent(): void {
    if (!this.markdownComponent) return;
    this.markdownComponent.unload();
    this.markdownComponent = null;
  }

  private renderLegacy(root: HTMLElement, notes: string[]): void {
    if (notes.length === 0) {
      root.createEl("p", { text: "No related notes.", cls: "see-also-empty" });
      return;
    }

    root.createEl("p", { text: "See also", cls: "see-also-heading" });
    const ul = root.createEl("ul", { cls: "see-also-list" });

    for (const raw of notes) {
      const stripped = raw.replace(/^\[\[|\]\]$/g, "").trim();
      const idx = stripped.indexOf("|");
      const notePath = (idx === -1 ? stripped : stripped.slice(0, idx)).trim();
      const alias = idx === -1 ? null : stripped.slice(idx + 1).trim();
      const displayText = alias && alias.length > 0 ? alias : notePath;

      const li = ul.createEl("li", { cls: "see-also-item" });
      const a = li.createEl("a", {
        text: displayText,
        cls: "internal-link",
        href: notePath,
      });
      a.dataset.href = notePath;

      a.addEventListener("click", (e) => {
        e.preventDefault();
        void this.app.workspace.openLinkText(notePath, "", false);
      });

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

export const SEE_ALSO_VIEW_TYPE = VIEW_TYPE;
