import type { MediaEntry, MediaKind } from "./types";

export type FilterType = "all" | MediaKind;
export type SortType = "name" | "path";

export interface FilterState {
  query: string;
  type: FilterType;
}

const LIVE_PHOTO_EXTENSIONS = new Set(["heic", "heif"]);
const SORT_COLLATOR = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: "base"
});

export function mergeLivePhotoItems(items: MediaEntry[]): MediaEntry[] {
  const byPairKey = new Map<string, MediaEntry>();

  for (const item of items) {
    const pairKey = createPairKey(item.path, item.fileName);
    if (pairKey) {
      byPairKey.set(pairKey, item);
    }
  }

  const consumedIds = new Set<string>();
  const merged: MediaEntry[] = [];

  for (const item of items) {
    if (consumedIds.has(item.id)) {
      continue;
    }

    const ext = item.extension.toLowerCase();
    const pairKey = createPairKey(item.path, item.fileName);

    if (item.kind === "photo" && LIVE_PHOTO_EXTENSIONS.has(ext) && pairKey) {
      const peer = byPairKey.get(pairKey);
      if (peer && peer.kind === "video" && peer.extension.toLowerCase() === "mov") {
        consumedIds.add(peer.id);
        merged.push({
          ...item,
          liveVideo: {
            path: peer.path,
            extension: peer.extension,
            size: peer.size,
            mtimeMs: peer.mtimeMs
          }
        });
        continue;
      }
    }

    merged.push(item);
  }

  return merged;
}

export function applyFilters(items: MediaEntry[], filter: FilterState): MediaEntry[] {
  const query = filter.query.trim().toLowerCase();

  return items.filter((item) => {
    if (filter.type !== "all" && item.kind !== filter.type) {
      return false;
    }

    if (!query) {
      return true;
    }

    return item.fileName.toLowerCase().includes(query);
  });
}

export function sortByType(items: MediaEntry[], sortType: SortType): MediaEntry[] {
  if (sortType === "path") {
    return sortByPath(items);
  }

  return sortByName(items);
}

export function sortByName(items: MediaEntry[]): MediaEntry[] {
  return [...items].sort((a, b) => {
    const byName = SORT_COLLATOR.compare(a.fileName, b.fileName);
    if (byName !== 0) {
      return byName;
    }

    return SORT_COLLATOR.compare(normalizePath(a.path), normalizePath(b.path));
  });
}

export function sortByPath(items: MediaEntry[]): MediaEntry[] {
  return [...items].sort((a, b) => {
    const byPath = SORT_COLLATOR.compare(normalizePath(a.path), normalizePath(b.path));
    if (byPath !== 0) {
      return byPath;
    }

    return SORT_COLLATOR.compare(a.fileName, b.fileName);
  });
}

export function relativeDirectoryPath(itemPath: string, rootPath: string): string {
  const normalizedItemPath = normalizePath(itemPath);
  const normalizedRootPath = trimTrailingSlash(normalizePath(rootPath));
  const fileSeparatorIndex = normalizedItemPath.lastIndexOf("/");
  const directory = fileSeparatorIndex >= 0 ? normalizedItemPath.slice(0, fileSeparatorIndex) : "";

  if (!normalizedRootPath) {
    return directory;
  }

  if (directory === normalizedRootPath) {
    return ".";
  }

  const prefix = `${normalizedRootPath}/`;
  if (directory.startsWith(prefix)) {
    return directory.slice(prefix.length);
  }

  return directory;
}

function createPairKey(path: string, fileName: string): string | null {
  const normalizedPath = normalizePath(path);
  const slashIndex = normalizedPath.lastIndexOf("/");
  const directory = slashIndex >= 0 ? normalizedPath.slice(0, slashIndex) : "";
  const dotIndex = fileName.lastIndexOf(".");
  if (dotIndex <= 0) {
    return null;
  }

  const stem = fileName.slice(0, dotIndex).toLowerCase();
  return `${directory}::${stem}`;
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/");
}

function trimTrailingSlash(path: string): string {
  if (path.endsWith("/")) {
    return path.slice(0, -1);
  }

  return path;
}
