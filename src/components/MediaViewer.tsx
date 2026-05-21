import { useEffect, useMemo, useRef, useState } from "react";
import { filePathToUrl, resolveDisplayImage, resolvePlayableVideo } from "../lib/api";
import type { MediaEntry } from "../lib/types";

type ViewerMode = "photo" | "video";

interface MediaViewerProps {
  item: MediaEntry;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
  canPrev: boolean;
  canNext: boolean;
}

export function MediaViewer({ item, onClose, onPrev, onNext, canPrev, canNext }: MediaViewerProps) {
  const [mode, setMode] = useState<ViewerMode>(item.kind === "video" ? "video" : "photo");

  const [resolvedUrl, setResolvedUrl] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);

  const hasLiveVideo = Boolean(item.liveVideo);
  const isVideoMode = mode === "video";

  useEffect(() => {
    setMode(item.kind === "video" ? "video" : "photo");
  }, [item.id, item.kind]);

  useEffect(() => {
    let disposed = false;

    async function load() {
      setLoading(true);
      setError(null);
      setResolvedUrl("");
      setZoom(1);
      setOffset({ x: 0, y: 0 });
      setCurrentTime(0);
      setDuration(0);

      try {
        if (!isVideoMode) {
          const result = await resolveDisplayImage(item);
          if (!disposed) {
            setResolvedUrl(filePathToUrl(result.displayPath));
          }
          return;
        }

        const target = item.kind === "video" ? item : item.liveVideo;
        if (!target) {
          throw new Error("No video source available for this item");
        }

        const result = await resolvePlayableVideo({
          ...item,
          path: target.path,
          extension: target.extension,
          size: target.size,
          mtimeMs: target.mtimeMs,
          kind: "video"
        });

        if (!disposed) {
          setResolvedUrl(filePathToUrl(result.videoPath));
        }
      } catch (err) {
        if (!disposed) {
          setError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        if (!disposed) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      disposed = true;
    };
  }, [isVideoMode, item]);

  useEffect(() => {
    if (!isVideoMode || !resolvedUrl) {
      return;
    }

    const video = videoRef.current;
    if (!video) {
      return;
    }

    video.currentTime = 0;
    const playPromise = video.play();
    if (playPromise) {
      void playPromise.catch(() => {
        setPlaying(false);
      });
    }
  }, [item.id, isVideoMode, resolvedUrl]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
      if (event.key === "ArrowLeft" && canPrev) {
        event.preventDefault();
        onPrev();
      }
      if (event.key === "ArrowRight" && canNext) {
        event.preventDefault();
        onNext();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [canNext, canPrev, onClose, onNext, onPrev]);

  const zoomLabel = useMemo(() => `${Math.round(zoom * 100)}%`, [zoom]);

  return (
    <div className="viewer-backdrop" role="dialog" aria-modal="true">
      <div className="viewer-toolbar">
        <button onClick={onPrev} disabled={!canPrev}>
          Назад
        </button>
        <button onClick={onNext} disabled={!canNext}>
          Вперед
        </button>
        {hasLiveVideo && (
          <button onClick={() => setMode((value) => (value === "photo" ? "video" : "photo"))}>
            {isVideoMode ? "Фото" : "Live Photo"}
          </button>
        )}
        {!isVideoMode && <span>{zoomLabel}</span>}
        <button onClick={onClose}>Закрыть</button>
      </div>

      <div className="viewer-body">
        {loading && <div className="viewer-status">Загрузка медиа...</div>}
        {error && <div className="viewer-error">{error}</div>}
        <button className="viewer-side-nav viewer-side-nav-left" onClick={onPrev} disabled={!canPrev}>
          ←
        </button>
        <button className="viewer-side-nav viewer-side-nav-right" onClick={onNext} disabled={!canNext}>
          →
        </button>

        {!loading && !error && !isVideoMode && (
          <div
            className="viewer-photo-wrap"
            onWheel={(event) => {
              event.preventDefault();
              const delta = event.deltaY > 0 ? -0.1 : 0.1;
              setZoom((value) => Math.max(0.25, Math.min(5, value + delta)));
            }}
            onMouseDown={(event) => {
              dragStartRef.current = { x: event.clientX - offset.x, y: event.clientY - offset.y };
            }}
            onMouseMove={(event) => {
              if (!dragStartRef.current) {
                return;
              }
              setOffset({
                x: event.clientX - dragStartRef.current.x,
                y: event.clientY - dragStartRef.current.y
              });
            }}
            onMouseUp={() => {
              dragStartRef.current = null;
            }}
            onMouseLeave={() => {
              dragStartRef.current = null;
            }}
          >
            <img
              src={resolvedUrl}
              alt={item.fileName}
              style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})` }}
            />
          </div>
        )}

        {!loading && !error && isVideoMode && (
          <div className="viewer-video-wrap">
            <video
              ref={videoRef}
              src={resolvedUrl}
              onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
              onLoadedMetadata={(event) => setDuration(event.currentTarget.duration || 0)}
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
              onVolumeChange={(event) => setMuted(event.currentTarget.muted)}
            />
            <div className="viewer-video-controls">
              <button
                onClick={() => {
                  const video = videoRef.current;
                  if (!video) {
                    return;
                  }
                  if (video.paused) {
                    void video.play();
                  } else {
                    video.pause();
                  }
                }}
              >
                {playing ? "Пауза" : "Старт"}
              </button>
              <button
                onClick={() => {
                  const video = videoRef.current;
                  if (!video) {
                    return;
                  }
                  video.muted = !video.muted;
                  setMuted(video.muted);
                }}
              >
                {muted ? "Со звуком" : "Без звука"}
              </button>
              <input
                type="range"
                min={0}
                max={duration || 0}
                step={0.1}
                value={currentTime}
                onChange={(event) => {
                  const video = videoRef.current;
                  if (!video) {
                    return;
                  }
                  const nextValue = Number(event.currentTarget.value);
                  video.currentTime = nextValue;
                  setCurrentTime(nextValue);
                }}
              />
              <button
                onClick={() => {
                  const video = videoRef.current;
                  if (!video) {
                    return;
                  }
                  if (document.fullscreenElement) {
                    void document.exitFullscreen();
                  } else {
                    void video.requestFullscreen();
                  }
                }}
              >
                На весь экран
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
