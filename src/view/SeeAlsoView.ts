import { ItemView, TFile, WorkspaceLeaf } from "obsidian";
import {
  buildTagDerivedSeeAlsoEntries,
  buildTagDerivedSeeAlsoGroups,
  dedupeSeeAlsoEntries,
  parseSeeAlso,
  resolveSeeAlsoEntries,
  type SeeAlsoResolvedEntry,
  type SeeAlsoSuggestionGroup,
} from "../seeAlso/resolve";

export interface SeeAlsoViewDeps {
  getSidebarHeadingText: () => string;
  getOpenInNewTabByDefault: () => boolean;
  getAutomaticSuggestionsEnabled: () => boolean;
  getGroupAutomaticSuggestionsByTagEnabled: () => boolean;
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
    return this.getResolvedHeadingText();
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

    // Keep a flat list for non-grouped rendering while also supporting grouped automatic suggestions.
    let explicitEntries: SeeAlsoResolvedEntry[] = resolved;
    let resolvedForRendering: SeeAlsoResolvedEntry[] = resolved;
    let automaticGroups: SeeAlsoSuggestionGroup[] | null = null;

    if (this.deps.getAutomaticSuggestionsEnabled()) {
      const markdownFiles = this.app.vault.getMarkdownFiles();

      if (this.deps.getGroupAutomaticSuggestionsByTagEnabled()) {
        // When grouping is enabled, keep explicit entries separate and provide grouped automatic suggestions.
        explicitEntries = dedupeSeeAlsoEntries([...resolved]);
        automaticGroups = buildTagDerivedSeeAlsoGroups(
          active,
          this.app.metadataCache,
          markdownFiles,
          explicitEntries
        );

        const automaticFlat: SeeAlsoResolvedEntry[] = [];
        for (const group of automaticGroups) {
          automaticFlat.push(...group.entries);
        }
        resolvedForRendering = dedupeSeeAlsoEntries([...explicitEntries, ...automaticFlat]);
      } else {
        // Legacy behavior: merge explicit entries and automatic suggestions into one flat list.
        resolvedForRendering = dedupeSeeAlsoEntries([
          ...resolved,
          ...buildTagDerivedSeeAlsoEntries(active, this.app.metadataCache, markdownFiles),
        ]);
      }
    }

    if (token !== this.renderToken) return;

    this.renderManual(root, resolvedForRendering, explicitEntries, automaticGroups);
  }

  private getResolvedHeadingText(): string {
    const raw = this.deps.getSidebarHeadingText();
    const normalized = typeof raw === "string" ? raw.trim() : "";
    return normalized.length > 0 ? normalized : "See also";
  }

  private renderManual(
    root: HTMLElement,
    resolved: SeeAlsoResolvedEntry[],
    explicit: SeeAlsoResolvedEntry[],
    automaticGroups: SeeAlsoSuggestionGroup[] | null
  ): void {
    root.empty();
    root.createEl("h3", { text: this.getResolvedHeadingText() });

    if (automaticGroups && automaticGroups.length > 0) {
      const totalAutomatic = automaticGroups.reduce((sum, g) => sum + g.entries.length, 0);
      const hasExplicit = explicit.length > 0;

      if (!hasExplicit && totalAutomatic === 0) {
        root.createEl("p", {
          text: "No related notes found",
          cls: "see-also-empty",
        });
        return;
      }

      if (hasExplicit) {
        root.createEl("h4", { text: "Custom", cls: "see-also-custom-header" });
        const ul = root.createEl("ul");
        for (const entry of explicit) {
          const li = ul.createEl("li");
          const normalizedTarget = this.getNavigationTarget(entry);
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

      if (automaticGroups.length > 0) {
        for (const group of automaticGroups) {
          root.createEl("h5", { text: group.header, cls: "see-also-group-header" });
          const ul = root.createEl("ul");
          for (const entry of group.entries) {
            const li = ul.createEl("li");
            const normalizedTarget = this.getNavigationTarget(entry);
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
      }

      return;
    }

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
      const normalizedTarget = this.getNavigationTarget(entry);
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

  private getNavigationTarget(entry: SeeAlsoResolvedEntry): string {
    if (entry.path) return entry.path;

    const normalizedLinkpath = this.normalizeLinkTarget(entry.linkpath);
    if (!normalizedLinkpath) return "";

    const sourcePath = this.currentSourcePath ?? this.app.workspace.getActiveFile()?.path ?? "";
    if (!sourcePath) return normalizedLinkpath;

    const resolved = this.resolveExistingTargetFile(normalizedLinkpath, sourcePath);
    return resolved?.path ?? normalizedLinkpath;
  }
}

export const SEE_ALSO_VIEW_TYPE = VIEW_TYPE;
