import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GalleryGrid } from "./components/GalleryGrid";
import { MediaViewer } from "./components/MediaViewer";
import {
  filePathToUrl,
  generateThumbnail,
  pickMediaFolder,
  resolveDisplayImage,
  resolvePlayableVideo,
  scanFolder
} from "./lib/api";
import { applyFilters, mergeLivePhotoItems, sortByMtimeDesc, type FilterType } from "./lib/media-utils";
import type { MediaEntry } from "./lib/types";

const MAX_THUMB_JOBS = 8;
const PRELOAD_RADIUS = 3;
const MAX_PRELOAD_JOBS = 3;

export function App() {
  const [rootPath, setRootPath] = useState<string>("");
  const [allItems, setAllItems] = useState<MediaEntry[]>([]);
  const [filterQuery, setFilterQuery] = useState("");
  const [filterType, setFilterType] = useState<FilterType>("all");

  const [loadingLibrary, setLoadingLibrary] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [thumbnailUrls, setThumbnailUrls] = useState<Map<string, string>>(new Map());
  const [pendingThumbIds, setPendingThumbIds] = useState<Set<string>>(new Set());

  const thumbQueueRef = useRef<MediaEntry[]>([]);
  const queuedThumbIdsRef = useRef<Set<string>>(new Set());
  const loadedThumbIdsRef = useRef<Set<string>>(new Set());
  const activeThumbJobsRef = useRef(0);
  const warmedPreloadKeysRef = useRef<Set<string>>(new Set());

  const [selectedId, setSelectedId] = useState<string | null>(null);

  const mergedItems = useMemo(() => mergeLivePhotoItems(allItems), [allItems]);
  const sortedItems = useMemo(() => sortByMtimeDesc(mergedItems), [mergedItems]);
  const filteredItems = useMemo(
    () => applyFilters(sortedItems, { query: filterQuery, type: filterType }),
    [filterQuery, filterType, sortedItems]
  );

  const selectedIndex = selectedId ? filteredItems.findIndex((item) => item.id === selectedId) : -1;
  const selectedItem = selectedIndex >= 0 ? filteredItems[selectedIndex] : null;

  useEffect(() => {
    if (!selectedItem) {
      return;
    }

    const preloadPhoto = async (item: MediaEntry) => {
      if (item.kind !== "photo") {
        return;
      }
      const key = `photo:${item.path}:${item.size}:${item.mtimeMs}`;
      if (warmedPreloadKeysRef.current.has(key)) {
        return;
      }
      try {
        await resolveDisplayImage(item);
        warmedPreloadKeysRef.current.add(key);
      } catch {
        // Ignore preload errors; interactive open will show explicit error if needed.
      }
    };

    const preloadVideo = async (item: MediaEntry) => {
      const target =
        item.kind === "video"
          ? { path: item.path, extension: item.extension, size: item.size, mtimeMs: item.mtimeMs }
          : item.liveVideo;

      if (!target) {
        return;
      }
      const key = `video:${target.path}:${target.size}:${target.mtimeMs}`;
      if (warmedPreloadKeysRef.current.has(key)) {
        return;
      }

      try {
        await resolvePlayableVideo({
          ...item,
          path: target.path,
          extension: target.extension,
          size: target.size,
          mtimeMs: target.mtimeMs,
          kind: "video"
        });
        warmedPreloadKeysRef.current.add(key);
      } catch {
        // Ignore preload errors; interactive open will show explicit error if needed.
      }
    };

    const preload = async (item: MediaEntry | null | undefined) => {
      if (!item) {
        return;
      }

      await preloadPhoto(item);

      if (selectedItem.kind === "video" && item.kind === "video" && item.id === selectedItem.id) {
        await preloadVideo(item);
      }
    };

    const candidates: MediaEntry[] = [];
    for (let offset = -PRELOAD_RADIUS; offset <= PRELOAD_RADIUS; offset += 1) {
      const index = selectedIndex + offset;
      if (index < 0 || index >= filteredItems.length) {
        continue;
      }
      candidates.push(filteredItems[index]);
    }

    const run = async () => {
      const queue = [...candidates];
      const workers = Array.from({ length: Math.min(MAX_PRELOAD_JOBS, queue.length) }, async () => {
        while (queue.length > 0) {
          const next = queue.shift();
          if (!next) {
            continue;
          }
          await preload(next);
        }
      });
      await Promise.all(workers);
    };

    void run();
  }, [filteredItems, selectedIndex, selectedItem]);

  const pumpThumbnailQueue = useCallback(() => {
    while (activeThumbJobsRef.current < MAX_THUMB_JOBS && thumbQueueRef.current.length > 0) {
      const item = thumbQueueRef.current.shift();
      if (!item) {
        continue;
      }

      activeThumbJobsRef.current += 1;

      void generateThumbnail(item)
        .then((response) => {
          loadedThumbIdsRef.current.add(item.id);
          setThumbnailUrls((previous) => {
            const next = new Map(previous);
            next.set(item.id, filePathToUrl(response.cachePath));
            return next;
          });
        })
        .catch((err) => {
          setError(err instanceof Error ? err.message : String(err));
        })
        .finally(() => {
          activeThumbJobsRef.current = Math.max(0, activeThumbJobsRef.current - 1);
          queuedThumbIdsRef.current.delete(item.id);
          setPendingThumbIds((previous) => {
            const next = new Set(previous);
            next.delete(item.id);
            return next;
          });
          pumpThumbnailQueue();
        });
    }
  }, []);

  const queueThumbnails = useCallback(
    (items: MediaEntry[]) => {
      const toQueue: MediaEntry[] = [];

      for (const item of items) {
        if (loadedThumbIdsRef.current.has(item.id) || queuedThumbIdsRef.current.has(item.id)) {
          continue;
        }
        queuedThumbIdsRef.current.add(item.id);
        toQueue.push(item);
      }

      if (toQueue.length === 0) {
        return;
      }

      thumbQueueRef.current.push(...toQueue);
      setPendingThumbIds((previous) => {
        const next = new Set(previous);
        for (const item of toQueue) {
          next.add(item.id);
        }
        return next;
      });
      pumpThumbnailQueue();
    },
    [pumpThumbnailQueue]
  );

  const openFolder = useCallback(async () => {
    setError(null);
    const folder = await pickMediaFolder();
    if (!folder) {
      return;
    }

    setRootPath(folder);
    setLoadingLibrary(true);
    setSelectedId(null);
    setThumbnailUrls(new Map());
    setPendingThumbIds(new Set());
    loadedThumbIdsRef.current = new Set();
    warmedPreloadKeysRef.current = new Set();
    thumbQueueRef.current = [];
    queuedThumbIdsRef.current = new Set();
    activeThumbJobsRef.current = 0;

    try {
      const result = await scanFolder(folder);
      setAllItems(result.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setAllItems([]);
    } finally {
      setLoadingLibrary(false);
    }
  }, []);

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-left">
          <button className="primary" onClick={() => void openFolder()}>
            Выбрать папку
          </button>
          <span className="path-label">{rootPath || "Папка не выбрана"}</span>
        </div>
        <div className="topbar-right">
          <input
            type="text"
            placeholder="Поиск по имени файла"
            value={filterQuery}
            onChange={(event) => setFilterQuery(event.currentTarget.value)}
          />
          <select
            value={filterType}
            onChange={(event) => setFilterType(event.currentTarget.value as FilterType)}
          >
            <option value="all">Все</option>
            <option value="photo">Фото</option>
            <option value="video">Видео</option>
          </select>
        </div>
      </header>

      <main className="content">
        {error && <div className="error-banner">{error}</div>}

        {loadingLibrary ? (
          <div className="state-screen">Сканирование файлов...</div>
        ) : filteredItems.length === 0 ? (
          <div className="state-screen">Подходящие медиафайлы не найдены.</div>
        ) : (
          <GalleryGrid
            items={filteredItems}
            selectedId={selectedId}
            thumbnailUrls={thumbnailUrls}
            pendingThumbIds={pendingThumbIds}
            onSelect={(item) => setSelectedId(item.id)}
            onVisibleItemsChange={(items) => {
              queueThumbnails(items);
            }}
          />
        )}
      </main>

      {selectedItem && (
        <MediaViewer
          item={selectedItem}
          canPrev={selectedIndex > 0}
          canNext={selectedIndex >= 0 && selectedIndex < filteredItems.length - 1}
          onPrev={() => {
            if (selectedIndex > 0) {
              setSelectedId(filteredItems[selectedIndex - 1].id);
            }
          }}
          onNext={() => {
            if (selectedIndex >= 0 && selectedIndex < filteredItems.length - 1) {
              setSelectedId(filteredItems[selectedIndex + 1].id);
            }
          }}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  );
}
