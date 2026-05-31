import { MetadataCache, TFile } from "obsidian";

export interface SeeAlsoResolvedEntry {
  raw: string;
  linktext: string;
  linkpath: string;
  subpath: string | null;
  display: string;
  exists: boolean;
  path: string | null;
  title: string | null;
  wikilink: string;
  frontmatter: Record<string, unknown> | null;
}

export interface ActiveContext {
  path: string;
  basename: string;
  title: string;
  frontmatter: Record<string, unknown> | null;
}

export interface TemplateContext {
  active: ActiveContext;
  seeAlso: SeeAlsoResolvedEntry[];
  hasSeeAlso: boolean;
  count: number;
}

export function parseSeeAlso(value: unknown): string[] {
  if (value === null || value === undefined) return [];

  if (Array.isArray(value)) {
    const out: string[] = [];
    for (const v of value) {
      if (typeof v === "string") {
        const trimmed = v.trim();
        if (trimmed) out.push(trimmed);
        continue;
      }

      if (typeof v === "number" || typeof v === "boolean") {
        out.push(String(v));
      }
    }
    return out;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? [trimmed] : [];
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return [String(value)];
  }

  return [];
}

function stripWikilinkBrackets(raw: string): string {
  return raw.replace(/^\[\[|\]\]$/g, "").trim();
}

function splitAlias(linkish: string): { linktext: string; alias: string | null } {
  const idx = linkish.indexOf("|");
  if (idx === -1) {
    return { linktext: linkish.trim(), alias: null };
  }

  const linktext = linkish.slice(0, idx).trim();
  const alias = linkish.slice(idx + 1).trim();
  return { linktext, alias: alias || null };
}

function splitSubpath(linktext: string): { linkpath: string; subpath: string | null } {
  const idx = linktext.indexOf("#");
  if (idx === -1) {
    return { linkpath: linktext.trim(), subpath: null };
  }

  const linkpath = linktext.slice(0, idx).trim();
  const subpath = linktext.slice(idx + 1).trim();
  return { linkpath, subpath: subpath || null };
}

function buildWikilink(target: string, subpath: string | null, display: string, hasAlias: boolean): string {
  const targetWithSubpath = subpath ? `${target}#${subpath}` : target;
  if (hasAlias) {
    return `[[${targetWithSubpath}|${display}]]`;
  }
  return `[[${targetWithSubpath}]]`;
}

export async function resolveSeeAlsoEntries(
  entries: string[],
  sourcePath: string,
  metadataCache: MetadataCache
): Promise<SeeAlsoResolvedEntry[]> {
  const out: SeeAlsoResolvedEntry[] = [];

  for (const rawEntry of entries) {
    const stripped = stripWikilinkBrackets(rawEntry);
    const { linktext, alias } = splitAlias(stripped);
    const { linkpath, subpath } = splitSubpath(linktext);

    let display = alias ?? linktext;

    const dest = linkpath ? metadataCache.getFirstLinkpathDest(linkpath, sourcePath) : null;
    const exists = dest instanceof TFile;

    const resolvedPath = exists ? dest.path : null;
    const title = exists ? dest.basename : null;

    let frontmatter: Record<string, unknown> | null = null;
    if (exists) {
      const cache = metadataCache.getFileCache(dest);
      const fm = cache?.frontmatter;
      if (fm && typeof fm === "object") {
        frontmatter = fm;
      }
    }

    // Smart fallback: use title if no explicit alias
    let useDisplayText = alias !== null;
    if (alias === null && typeof frontmatter?.title === "string") {
      display = frontmatter.title;
      useDisplayText = true; // Include display text since we're using title
    }

    const wikilinkTarget = resolvedPath ?? linktext;

    out.push({
      raw: rawEntry,
      linktext,
      linkpath,
      subpath,
      display,
      exists,
      path: resolvedPath,
      title,
      wikilink: buildWikilink(wikilinkTarget, subpath, display, useDisplayText),
      frontmatter,
    });
  }

  return out;
}

export function buildTemplateContext(activeFile: TFile, metadataCache: MetadataCache, seeAlso: SeeAlsoResolvedEntry[]): TemplateContext {
  const activeCache = metadataCache.getFileCache(activeFile);
  const fm = activeCache?.frontmatter;

  const activeFrontmatter = fm && typeof fm === "object" ? fm : null;

  const active: ActiveContext = {
    path: activeFile.path,
    basename: activeFile.basename,
    title: activeFile.basename,
    frontmatter: activeFrontmatter,
  };

  return {
    active,
    seeAlso,
    hasSeeAlso: seeAlso.length > 0,
    count: seeAlso.length,
  };
}
