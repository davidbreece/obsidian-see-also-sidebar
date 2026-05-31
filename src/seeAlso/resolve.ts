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

export interface SeeAlsoSuggestionGroup {
  header: string; // Display name (e.g., "Bread")
  tagKey: string; // Full tag path for reference
  entries: SeeAlsoResolvedEntry[];
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

function normalizeTag(tag: string): string {
  // Returns an empty string when input is only whitespace and/or '#' markers.
  const normalized = tag.trim().replace(/^#+/, "").toLowerCase();
  return normalized;
}

function parseFrontmatterTagsValue(value: unknown): string[] {
  if (typeof value === "string") {
    return value
      .split(",")
      .map((part) => part.trim())
      .filter((part) => part.length > 0);
  }

  if (Array.isArray(value)) {
    return value
      .filter((part): part is string => typeof part === "string")
      .map((part) => part.trim())
      .filter((part) => part.length > 0);
  }

  return [];
}

function getNormalizedTagsForFile(file: TFile, metadataCache: MetadataCache): Set<string> {
  const normalized = new Set<string>();
  const cache = metadataCache.getFileCache(file);

  for (const tagEntry of cache?.tags ?? []) {
    const tag = normalizeTag(tagEntry.tag);
    if (tag) normalized.add(tag);
  }

  const frontmatterTags = parseFrontmatterTagsValue(cache?.frontmatter?.tags);
  for (const tag of frontmatterTags) {
    const normalizedTag = normalizeTag(tag);
    if (normalizedTag) normalized.add(normalizedTag);
  }

  return normalized;
}

function hasAnySharedTags(left: Set<string>, right: Set<string>): boolean {
  if (left.size === 0 || right.size === 0) return false;

  const [small, large] = left.size <= right.size ? [left, right] : [right, left];
  for (const value of small) {
    if (large.has(value)) return true;
  }
  return false;
}

export function getSharedTags(left: readonly string[], right: readonly string[]): string[] {
  if (left.length === 0 || right.length === 0) return [];

  // Compare normalized tags so callers can pass raw tag strings (e.g. "#Food/Recipes").
  const leftSet = new Set<string>();
  for (const tag of left) {
    const normalized = normalizeTag(tag);
    if (normalized) leftSet.add(normalized);
  }

  const out = new Set<string>();
  for (const tag of right) {
    const normalized = normalizeTag(tag);
    if (normalized && leftSet.has(normalized)) out.add(normalized);
  }

  return Array.from(out);
}

function countTagSegments(tag: string): number {
  // Treat tags as slash-delimited paths; ignore empty segments caused by "//" or leading/trailing slashes.
  return tag
    .split("/")
    .map((part) => part.trim())
    .filter((part) => part.length > 0).length;
}

export function selectMostSpecificTag(tags: readonly string[]): string | null {
  if (tags.length === 0) return null;

  // Chooses the tag with most segments; ties keep the first occurrence.
  let best: string | null = null;
  let bestSegments = -1;

  for (const rawTag of tags) {
    const normalized = normalizeTag(rawTag).replace(/^\/+|\/+$/g, "");
    if (!normalized) continue;

    const segments = countTagSegments(normalized);
    if (segments > bestSegments) {
      best = normalized;
      bestSegments = segments;
    }
  }

  return best;
}

export function tagToDisplayHeader(tag: string): string {
  const normalized = normalizeTag(tag).replace(/^\/+|\/+$/g, "");
  if (!normalized) return "";

  const parts = normalized
    .split("/")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  if (parts.length === 0) return "";

  const last = parts[parts.length - 1];
  if (last === undefined) return "";
  // Always title-cases the last segment, so acronyms become "Api"/"Sql".
  return last.charAt(0).toUpperCase() + last.slice(1).toLowerCase();
}

export function buildTagDerivedSeeAlsoEntries(
  activeFile: TFile,
  metadataCache: MetadataCache,
  markdownFiles: TFile[]
): SeeAlsoResolvedEntry[] {
  const activeTags = getNormalizedTagsForFile(activeFile, metadataCache);
  if (activeTags.size === 0) return [];

  const out: SeeAlsoResolvedEntry[] = [];

  for (const candidate of markdownFiles) {
    if (candidate.path === activeFile.path) continue;

    const candidateTags = getNormalizedTagsForFile(candidate, metadataCache);
    if (!hasAnySharedTags(activeTags, candidateTags)) continue;

    const cache = metadataCache.getFileCache(candidate);
    const fm = cache?.frontmatter;
    const frontmatter = fm && typeof fm === "object" ? fm : null;

    const titleFromFrontmatter = typeof frontmatter?.title === "string" ? frontmatter.title.trim() : "";
    const display = titleFromFrontmatter || candidate.basename;
    const useAlias = display !== candidate.basename;

    out.push({
      raw: candidate.path,
      linktext: candidate.path,
      linkpath: candidate.path,
      subpath: null,
      display,
      exists: true,
      path: candidate.path,
      title: candidate.basename,
      wikilink: useAlias ? `[[${candidate.path}|${display}]]` : `[[${candidate.path}]]`,
      frontmatter,
    });
  }

  out.sort((a, b) => {
    const titleCompare = a.display.localeCompare(b.display, undefined, { sensitivity: "base" });
    if (titleCompare !== 0) return titleCompare;
    return (a.path ?? a.linkpath).localeCompare(b.path ?? b.linkpath, undefined, {
      sensitivity: "base",
    });
  });

  return out;
}

function entryToDedupeKey(entry: SeeAlsoResolvedEntry): string {
  // Match the existing semantics of dedupeSeeAlsoEntries so explicit entries can be
  // excluded from automatic suggestions using the same key logic.
  return entry.path
    ? `path:${entry.path.toLowerCase()}`
    : `link:${entry.linkpath.toLowerCase()}#${(entry.subpath ?? "").toLowerCase()}`;
}

function compareSeeAlsoEntries(a: SeeAlsoResolvedEntry, b: SeeAlsoResolvedEntry): number {
  const titleCompare = a.display.localeCompare(b.display, undefined, { sensitivity: "base" });
  if (titleCompare !== 0) return titleCompare;
  return (a.path ?? a.linkpath).localeCompare(b.path ?? b.linkpath, undefined, {
    sensitivity: "base",
  });
}

export function buildTagDerivedSeeAlsoGroups(
  activeFile: TFile,
  metadataCache: MetadataCache,
  markdownFiles: TFile[],
  explicitEntries: readonly SeeAlsoResolvedEntry[]
): SeeAlsoSuggestionGroup[] {
  const activeTags = getNormalizedTagsForFile(activeFile, metadataCache);
  if (activeTags.size === 0) return [];

  const activeTagList = Array.from(activeTags);

  const explicitKeys = new Set<string>();
  for (const entry of explicitEntries) {
    explicitKeys.add(entryToDedupeKey(entry));
  }

  const groupsByTagKey = new Map<string, SeeAlsoSuggestionGroup>();

  for (const candidate of markdownFiles) {
    if (candidate.path === activeFile.path) continue;

    const candidateTags = getNormalizedTagsForFile(candidate, metadataCache);
    if (!hasAnySharedTags(activeTags, candidateTags)) continue;

    const sharedTags = getSharedTags(activeTagList, Array.from(candidateTags));
    if (sharedTags.length === 0) continue;

    const mostSpecific = selectMostSpecificTag(sharedTags);
    if (!mostSpecific) continue;

    const header = tagToDisplayHeader(mostSpecific);
    if (!header) continue;

    const cache = metadataCache.getFileCache(candidate);
    const fm = cache?.frontmatter;
    const frontmatter = fm && typeof fm === "object" ? fm : null;

    const titleFromFrontmatter = typeof frontmatter?.title === "string" ? frontmatter.title.trim() : "";
    const display = titleFromFrontmatter || candidate.basename;
    const useAlias = display !== candidate.basename;

    const entry: SeeAlsoResolvedEntry = {
      raw: candidate.path,
      linktext: candidate.path,
      linkpath: candidate.path,
      subpath: null,
      display,
      exists: true,
      path: candidate.path,
      title: candidate.basename,
      wikilink: useAlias ? `[[${candidate.path}|${display}]]` : `[[${candidate.path}]]`,
      frontmatter,
    };

    if (explicitKeys.has(entryToDedupeKey(entry))) continue;

    const group = groupsByTagKey.get(mostSpecific);
    if (group) {
      group.entries.push(entry);
      continue;
    }

    groupsByTagKey.set(mostSpecific, {
      header,
      tagKey: mostSpecific,
      entries: [entry],
    });
  }

  const groups = Array.from(groupsByTagKey.values()).filter((g) => g.entries.length > 0);
  for (const group of groups) {
    group.entries.sort(compareSeeAlsoEntries);
  }

  groups.sort((a, b) => {
    const headerCompare = a.header.localeCompare(b.header, undefined, { sensitivity: "base" });
    if (headerCompare !== 0) return headerCompare;
    return a.tagKey.localeCompare(b.tagKey, undefined, { sensitivity: "base" });
  });

  return groups;
}

export function dedupeSeeAlsoEntries(entries: SeeAlsoResolvedEntry[]): SeeAlsoResolvedEntry[] {
  const seen = new Set<string>();
  const out: SeeAlsoResolvedEntry[] = [];

  for (const entry of entries) {
    const key = entryToDedupeKey(entry);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(entry);
  }

  return out;
}
