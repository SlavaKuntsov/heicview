use std::{
  fs,
  path::Path,
};

use image::ImageReader;
use walkdir::WalkDir;

use crate::{
  cache::{fingerprint_hash, metadata_mtime_ms},
  dto::{MediaEntry, MediaKind},
  errors::{AppError, AppResult},
};

const PHOTO_EXTENSIONS: [&str; 5] = ["jpg", "jpeg", "png", "heic", "heif"];
const VIDEO_EXTENSIONS: [&str; 2] = ["mp4", "mov"];

pub fn supported_extensions() -> Vec<&'static str> {
  PHOTO_EXTENSIONS
    .iter()
    .chain(VIDEO_EXTENSIONS.iter())
    .copied()
    .collect()
}

pub fn media_kind_for_extension(extension: &str) -> Option<MediaKind> {
  let ext = extension.to_ascii_lowercase();

  if PHOTO_EXTENSIONS.contains(&ext.as_str()) {
    return Some(MediaKind::Photo);
  }

  if VIDEO_EXTENSIONS.contains(&ext.as_str()) {
    return Some(MediaKind::Video);
  }

  None
}

pub fn is_supported_path(path: &Path) -> bool {
  path
    .extension()
    .and_then(|ext| ext.to_str())
    .and_then(media_kind_for_extension)
    .is_some()
}

pub fn scan_media(root: &Path) -> AppResult<Vec<MediaEntry>> {
  if !root.exists() {
    return Err(AppError::MissingFolder(root.to_path_buf()));
  }

  let mut items = Vec::new();

  for entry in WalkDir::new(root).follow_links(false) {
    let Ok(entry) = entry else {
      continue;
    };

    if !entry.file_type().is_file() {
      continue;
    }

    let path = entry.path();
    let Some(extension) = path.extension().and_then(|ext| ext.to_str()) else {
      continue;
    };

    let Some(kind) = media_kind_for_extension(extension) else {
      continue;
    };

    let Ok(metadata) = fs::metadata(path) else {
      continue;
    };

    let size = metadata.len();
    let mtime_ms = metadata_mtime_ms(&metadata);
    let (width, height) = probe_dimensions(path, &kind, extension);

    let id = fingerprint_hash(path, size, mtime_ms);

    items.push(MediaEntry {
      id,
      path: path.to_string_lossy().to_string(),
      file_name: path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or_default()
        .to_string(),
      extension: extension.to_ascii_lowercase(),
      kind,
      size,
      mtime_ms,
      duration_ms: None,
      width,
      height,
    });
  }

  items.sort_by(|a, b| a.path.cmp(&b.path));
  Ok(items)
}

fn probe_dimensions(path: &Path, kind: &MediaKind, extension: &str) -> (Option<u32>, Option<u32>) {
  match kind {
    MediaKind::Photo => {
      let ext = extension.to_ascii_lowercase();
      if ext == "jpg" || ext == "jpeg" || ext == "png" {
        if let Ok(reader) = ImageReader::open(path) {
          if let Ok(reader) = reader.with_guessed_format() {
            if let Ok(dimensions) = reader.into_dimensions() {
              return (Some(dimensions.0), Some(dimensions.1));
            }
          }
        }
      }
      (None, None)
    }
    MediaKind::Video => (None, None),
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn supports_required_extensions() {
    for ext in ["jpg", "jpeg", "png", "heic", "heif", "mp4", "mov"] {
      assert!(media_kind_for_extension(ext).is_some(), "expected support for {ext}");
    }
  }

  #[test]
  fn filters_unknown_extensions() {
    assert!(media_kind_for_extension("gif").is_none());
    assert!(media_kind_for_extension("txt").is_none());
  }

  #[test]
  fn extension_check_is_case_insensitive() {
    assert_eq!(media_kind_for_extension("HEIC"), Some(MediaKind::Photo));
    assert_eq!(media_kind_for_extension("MoV"), Some(MediaKind::Video));
  }

  #[test]
  fn supported_path_works() {
    assert!(is_supported_path(Path::new("/tmp/img.HEIF")));
    assert!(!is_supported_path(Path::new("/tmp/note.md")));
  }
}
