import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GalleryGrid } from "./components/GalleryGrid";
import { MediaViewer } from "./components/MediaViewer";
import {
  filePathToUrl,
  generateThumbnail,
  pickMediaFolder,
  resolvePlayableVideo,
  scanFolder
} from "./lib/api";
import { applyFilters, mergeLivePhotoItems, sortByMtimeDesc, type FilterType } from "./lib/media-utils";
import type { MediaEntry } from "./lib/types";

const MAX_THUMB_JOBS = 6;

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
  const activeThumbJobsRef = useRef(0);

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

    const preload = async (item: MediaEntry | null | undefined) => {
      if (!item) {
        return;
      }

      const target =
        item.kind === "video"
          ? { path: item.path, extension: item.extension, size: item.size, mtimeMs: item.mtimeMs }
          : item.liveVideo;

      if (!target) {
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
      } catch {
        // Ignore preload errors; interactive open will show explicit error if needed.
      }
    };

    void preload(selectedItem);
    void preload(selectedIndex > 0 ? filteredItems[selectedIndex - 1] : null);
    void preload(selectedIndex >= 0 ? filteredItems[selectedIndex + 1] : null);
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

  const queueThumbnail = useCallback(
    (item: MediaEntry) => {
      if (thumbnailUrls.has(item.id) || queuedThumbIdsRef.current.has(item.id)) {
        return;
      }

      queuedThumbIdsRef.current.add(item.id);
      thumbQueueRef.current.push(item);
      setPendingThumbIds((previous) => {
        const next = new Set(previous);
        next.add(item.id);
        return next;
      });
      pumpThumbnailQueue();
    },
    [pumpThumbnailQueue, thumbnailUrls]
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
              for (const item of items) {
                queueThumbnail(item);
              }
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
