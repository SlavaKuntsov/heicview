export type MediaKind = "photo" | "video";

export interface LiveVideoInfo {
  path: string;
  extension: string;
  size: number;
  mtimeMs: number;
}

export interface MediaEntry {
  id: string;
  path: string;
  fileName: string;
  extension: string;
  kind: MediaKind;
  size: number;
  mtimeMs: number;
  durationMs?: number | null;
  width?: number | null;
  height?: number | null;
  liveVideo?: LiveVideoInfo;
}

export interface ScanResult {
  rootPath: string;
  items: MediaEntry[];
}

export interface ThumbResponse {
  cachePath: string;
  fromCache: boolean;
}

export interface DisplayImageResponse {
  displayPath: string;
  converted: boolean;
}

export interface PlayableVideoResponse {
  videoPath: string;
  transcoded: boolean;
}
