import { ItemView, MarkdownRenderer, TFile, WorkspaceLeaf } from "obsidian";
import {
  buildTagDerivedSeeAlsoEntries,
  buildTemplateContext,
  dedupeSeeAlsoEntries,
  parseSeeAlso,
  resolveSeeAlsoEntries,
  type SeeAlsoResolvedEntry,
} from "../seeAlso/resolve";
import type { TemplateEngine } from "../template/templateEngine";

export interface SeeAlsoViewDeps {
  templateEngine: TemplateEngine;
  getTemplatePath: () => string;
  getOpenInNewTabByDefault: () => boolean;
  getAutomaticSuggestionsEnabled: () => boolean;
}

const VIEW_TYPE = "see-also-sidebar";
const TARGET_ATTR = "data-see-also-target";

export class SeeAlsoView extends ItemView {
  private notes: string[] = [];
  private renderToken = 0;
  private currentSourcePath: string | null = null;
  private delegatedHandlersInstalled = false;

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
    this.installDelegatedHandlers();
    await this.refresh();
  }

  async onClose(): Promise<void> {
    // No-op; kept for lifecycle symmetry.
  }

  private installDelegatedHandlers(): void {
    if (this.delegatedHandlersInstalled) return;
    this.delegatedHandlersInstalled = true;

    const openFromEvent = (event: MouseEvent): void => {
      if (event.type === "auxclick" && event.button !== 1) return;
      if (event.type === "click" && event.button !== 0) return;

      const rawTarget = event.target;
      if (!rawTarget || typeof rawTarget !== "object") return;
      if (!(rawTarget instanceof Element)) return;

      const clickable = rawTarget.closest(`[${TARGET_ATTR}]`);
      if (!(clickable instanceof HTMLElement)) return;
      if (!this.containerEl.contains(clickable)) return;

      const target = clickable.getAttribute(TARGET_ATTR) ?? "";
      if (!target) return;

      event.preventDefault();

      const sourcePath = this.currentSourcePath ?? this.app.workspace.getActiveFile()?.path ?? "";
      if (!sourcePath) return;

      const file = this.resolveExistingTargetFile(target, sourcePath);
      if (!file) return;

      const openInNewTab =
        this.deps.getOpenInNewTabByDefault() ||
        event.ctrlKey ||
        event.metaKey ||
        event.button === 1;

      void (async () => {
        const leaf = this.app.workspace.getLeaf(openInNewTab ? "tab" : false);
        await leaf.openFile(file);
      })();
    };

    this.registerDomEvent(this.containerEl, "click", openFromEvent, {
      capture: true,
      passive: false,
    });
    this.registerDomEvent(this.containerEl, "auxclick", openFromEvent, {
      capture: true,
      passive: false,
    });
  }

  update(notes: string[]): void {
    this.notes = notes;
    void this.refresh();
  }

  async refresh(): Promise<void> {
    const active = this.app.workspace.getActiveFile();
    if (!active) {
      this.currentSourcePath = null;
      this.containerEl.empty();
      return;
    }

    this.currentSourcePath = active.path;

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

    const withAutomaticSuggestions = this.deps.getAutomaticSuggestionsEnabled()
      ? dedupeSeeAlsoEntries([
          ...resolved,
          ...buildTagDerivedSeeAlsoEntries(
            active,
            this.app.metadataCache,
            this.app.vault.getMarkdownFiles()
          ),
        ])
      : resolved;

    if (token !== this.renderToken) return;

    const renderedFromTemplate = await this.renderTemplate(
      root,
      active,
      withAutomaticSuggestions,
      token
    );
    if (token !== this.renderToken) return;
    if (renderedFromTemplate) return;

    this.renderManual(root, withAutomaticSuggestions);
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

    const renderedLinks = root.querySelectorAll("a.internal-link, a[data-href]");
    for (const link of Array.from(renderedLinks)) {
      const rawTarget = link.getAttribute("data-href") ?? link.getAttribute("href") ?? "";
      const normalizedTarget = this.normalizeLinkTarget(rawTarget);
      if (!normalizedTarget) continue;

      const anchor = link.ownerDocument.createElement("a");
      anchor.className = "see-also-link";
      anchor.setAttribute(TARGET_ATTR, normalizedTarget);
      anchor.setAttribute("href", "#");
      anchor.textContent = link.textContent ?? "";
      link.replaceWith(anchor);
    }
    return true;
  }

  private renderManual(
    root: HTMLElement,
    resolved: SeeAlsoResolvedEntry[]
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
      const target = entry.path || entry.linkpath || entry.display;
      const normalizedTarget = this.normalizeLinkTarget(target);
      if (!normalizedTarget) continue;

      li.createEl("a", {
        text: entry.display,
        cls: "see-also-link",
        href: "#",
        attr: {
          [TARGET_ATTR]: normalizedTarget,
          role: "link",
          tabindex: "0",
        },
      });
    }
  }

  private resolveExistingTargetFile(rawTarget: string, sourcePath: string): TFile | null {
    const trimmed = rawTarget.trim();
    if (!trimmed) return null;

    const fileFromLinkpath = this.app.metadataCache.getFirstLinkpathDest(trimmed, sourcePath);
    if (fileFromLinkpath) return fileFromLinkpath;

    const direct = this.app.vault.getAbstractFileByPath(trimmed);
    if (direct instanceof TFile) return direct;

    if (trimmed.toLowerCase().endsWith(".md")) {
      const withoutMd = trimmed.slice(0, -3);
      const noExtResolved = this.app.metadataCache.getFirstLinkpathDest(withoutMd, sourcePath);
      if (noExtResolved) return noExtResolved;
    } else {
      const withMd = `${trimmed}.md`;
      const withMdDirect = this.app.vault.getAbstractFileByPath(withMd);
      if (withMdDirect instanceof TFile) return withMdDirect;
    }

    return null;
  }

  private normalizeLinkTarget(rawTarget: string): string {
    let normalized = rawTarget.trim();
    if (!normalized) return "";

    try {
      normalized = decodeURIComponent(normalized);
    } catch {
      // Ignore decode failures and continue with raw value.
    }

    if (normalized.startsWith("[[") && normalized.endsWith("]]")) {
      normalized = normalized.slice(2, -2);
    }

    const pipeIndex = normalized.indexOf("|");
    if (pipeIndex !== -1) normalized = normalized.slice(0, pipeIndex);

    const hashIndex = normalized.indexOf("#");
    if (hashIndex !== -1) normalized = normalized.slice(0, hashIndex);

    const queryIndex = normalized.indexOf("?");
    if (queryIndex !== -1) normalized = normalized.slice(0, queryIndex);

    normalized = normalized.replace(/^\/+/, "").replace(/\\/g, "/").trim();
    return normalized;
  }
}

export const SEE_ALSO_VIEW_TYPE = VIEW_TYPE;
