import Mustache from "mustache";
import { TFile, Vault } from "obsidian";

export class TemplateEngine {
  private templatePath: string = "";

  private cachedPath: string | null = null;
  private cachedMtime: number | null = null;
  private cachedContent: string | null = null;

  constructor(private readonly vault: Vault) {}

  setTemplatePath(path: string): void {
    const normalized = path.trim();
    if (normalized === this.templatePath) return;
    this.templatePath = normalized;
    this.invalidate();
  }

  getTemplatePath(): string {
    return this.templatePath;
  }

  invalidate(): void {
    this.cachedPath = null;
    this.cachedMtime = null;
    this.cachedContent = null;
  }

  async loadTemplateContent(): Promise<string | null> {
    const path = this.templatePath.trim();
    if (!path) return null;

    const abstract = this.vault.getAbstractFileByPath(path);
    if (!(abstract instanceof TFile)) {
      throw new Error(`Template file not found: ${path}`);
    }

    const mtime = abstract.stat.mtime;

    if (this.cachedPath === path && this.cachedMtime === mtime && this.cachedContent !== null) {
      return this.cachedContent;
    }

    const content = await this.vault.cachedRead(abstract);
    this.cachedPath = path;
    this.cachedMtime = mtime;
    this.cachedContent = content;
    return content;
  }

  render(template: string, context: Record<string, unknown>): string {
    const originalEscape = Mustache.escape;
    // Template output is markdown, so escaping here corrupts wikilinks like [[...]].
    Mustache.escape = (value: string): string => value;
    try {
      return Mustache.render(template, context);
    } finally {
      Mustache.escape = originalEscape;
    }
  }
}
