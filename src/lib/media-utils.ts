import type { MediaEntry, MediaKind } from "./types";

export type FilterType = "all" | MediaKind;

export interface FilterState {
  query: string;
  type: FilterType;
}

const LIVE_PHOTO_EXTENSIONS = new Set(["heic", "heif"]);

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

export function sortByMtimeDesc(items: MediaEntry[]): MediaEntry[] {
  return [...items].sort((a, b) => {
    if (b.mtimeMs !== a.mtimeMs) {
      return b.mtimeMs - a.mtimeMs;
    }

    return a.fileName.localeCompare(b.fileName);
  });
}

function createPairKey(path: string, fileName: string): string | null {
  const slashIndex = path.lastIndexOf("/");
  const directory = slashIndex >= 0 ? path.slice(0, slashIndex) : "";
  const dotIndex = fileName.lastIndexOf(".");
  if (dotIndex <= 0) {
    return null;
  }

  const stem = fileName.slice(0, dotIndex).toLowerCase();
  return `${directory}::${stem}`;
}
