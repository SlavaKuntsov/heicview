import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import type {
  DisplayImageResponse,
  MediaEntry,
  PlayableVideoResponse,
  ScanResult,
  ThumbResponse
} from "./types";

export async function pickMediaFolder(): Promise<string | null> {
  const selected = await open({
    directory: true,
    multiple: false,
    title: "Choose iPhone media folder"
  });

  if (!selected || Array.isArray(selected)) {
    return null;
  }

  return selected;
}

export async function scanFolder(folderPath: string): Promise<ScanResult> {
  return invoke<ScanResult>("scan_folder", { folderPath });
}

export async function generateThumbnail(item: MediaEntry): Promise<ThumbResponse> {
  return invoke<ThumbResponse>("generate_thumbnail", {
    request: {
      path: item.path,
      kind: item.kind,
      size: item.size,
      mtimeMs: item.mtimeMs,
      extension: item.extension
    }
  });
}

export async function resolveDisplayImage(item: MediaEntry): Promise<DisplayImageResponse> {
  return invoke<DisplayImageResponse>("resolve_display_image", {
    request: {
      path: item.path,
      size: item.size,
      mtimeMs: item.mtimeMs,
      extension: item.extension
    }
  });
}

export async function resolvePlayableVideo(item: MediaEntry): Promise<PlayableVideoResponse> {
  return invoke<PlayableVideoResponse>("resolve_playable_video", {
    request: {
      path: item.path,
      size: item.size,
      mtimeMs: item.mtimeMs,
      extension: item.extension
    }
  });
}

export function filePathToUrl(filePath: string): string {
  return convertFileSrc(filePath);
}
