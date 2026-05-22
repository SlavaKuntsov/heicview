import { useEffect, useMemo, useRef, useState } from "react";
import { relativeDirectoryPath } from "../lib/media-utils";
import type { MediaEntry } from "../lib/types";

interface GalleryGridProps {
  items: MediaEntry[];
  rootPath: string;
  selectedId: string | null;
  thumbnailUrls: Map<string, string>;
  onSelect: (item: MediaEntry) => void;
  onVisibleItemsChange: (items: MediaEntry[]) => void;
}

const CARD_WIDTH = 180;
const CARD_HEIGHT = 186;
const GAP = 12;
const OVERSCAN_ROWS = 3;

export function GalleryGrid({
  items,
  rootPath,
  selectedId,
  thumbnailUrls,
  onSelect,
  onVisibleItemsChange
}: GalleryGridProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const pendingScrollTopRef = useRef(0);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(600);
  const [viewportWidth, setViewportWidth] = useState(1000);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) {
      return;
    }

    const observer = new ResizeObserver(() => {
      setViewportHeight(element.clientHeight);
      setViewportWidth(element.clientWidth);
    });

    observer.observe(element);
    setViewportHeight(element.clientHeight);
    setViewportWidth(element.clientWidth);

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, []);

  const columnCount = Math.max(1, Math.floor((viewportWidth + GAP) / (CARD_WIDTH + GAP)));
  const rowCount = Math.ceil(items.length / columnCount);
  const totalHeight = rowCount * (CARD_HEIGHT + GAP);

  const startRow = Math.max(0, Math.floor(scrollTop / (CARD_HEIGHT + GAP)) - OVERSCAN_ROWS);
  const endRow = Math.min(
    rowCount,
    Math.ceil((scrollTop + viewportHeight) / (CARD_HEIGHT + GAP)) + OVERSCAN_ROWS
  );

  const visibleRange = useMemo(() => {
    const startIndex = startRow * columnCount;
    const endIndex = Math.min(items.length, endRow * columnCount);
    return { startIndex, endIndex };
  }, [columnCount, endRow, items.length, startRow]);

  const visibleItems = useMemo(
    () => items.slice(visibleRange.startIndex, visibleRange.endIndex),
    [items, visibleRange.endIndex, visibleRange.startIndex]
  );

  useEffect(() => {
    onVisibleItemsChange(visibleItems);
  }, [onVisibleItemsChange, visibleItems]);

  return (
    <div
      ref={containerRef}
      className="gallery-grid-scroll"
      onScroll={(event) => {
        pendingScrollTopRef.current = event.currentTarget.scrollTop;
        if (rafRef.current !== null) {
          return;
        }
        rafRef.current = requestAnimationFrame(() => {
          rafRef.current = null;
          setScrollTop(pendingScrollTopRef.current);
        });
      }}
    >
      <div className="gallery-grid-viewport" style={{ height: totalHeight }}>
        {visibleItems.map((item, localIndex) => {
          const index = visibleRange.startIndex + localIndex;
          const row = Math.floor(index / columnCount);
          const column = index % columnCount;
          const top = row * (CARD_HEIGHT + GAP);
          const left = column * (CARD_WIDTH + GAP);
          const thumbSrc = thumbnailUrls.get(item.id);
          const relativePath = relativeDirectoryPath(item.path, rootPath);

          return (
            <button
              type="button"
              key={item.id}
              className={`gallery-card ${selectedId === item.id ? "selected" : ""}`}
              style={{
                width: CARD_WIDTH,
                height: CARD_HEIGHT,
                transform: `translate(${left}px, ${top}px)`
              }}
              onClick={() => onSelect(item)}
              title={item.fileName}
            >
              <div className="gallery-card-thumb">
                {thumbSrc ? (
                  <img src={thumbSrc} alt={item.fileName} loading="lazy" decoding="async" />
                ) : (
                  <div className="gallery-card-placeholder">
                    <span className="thumb-spinner" />
                    <span>Загрузка...</span>
                  </div>
                )}
              </div>
              <div className="gallery-card-meta">
                <span className="gallery-card-name">{item.fileName}</span>
                <span className="gallery-card-path">{relativePath}</span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
