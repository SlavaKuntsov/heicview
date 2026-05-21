use std::{
  fs,
  path::{Path, PathBuf},
  time::UNIX_EPOCH,
};

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use crate::errors::AppResult;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct CacheFingerprint {
  pub size: u64,
  pub mtime_ms: i64,
  pub key_hash: String,
}

impl CacheFingerprint {
  pub fn from_source(path: &Path, size: u64, mtime_ms: i64) -> Self {
    Self {
      size,
      mtime_ms,
      key_hash: fingerprint_hash(path, size, mtime_ms),
    }
  }
}

pub fn metadata_mtime_ms(metadata: &fs::Metadata) -> i64 {
  metadata
    .modified()
    .ok()
    .and_then(|mtime| mtime.duration_since(UNIX_EPOCH).ok())
    .map(|duration| duration.as_millis() as i64)
    .unwrap_or_default()
}

pub fn fingerprint_hash(path: &Path, size: u64, mtime_ms: i64) -> String {
  let mut hasher = Sha256::new();
  hasher.update(path.to_string_lossy().as_bytes());
  hasher.update(size.to_le_bytes());
  hasher.update(mtime_ms.to_le_bytes());
  hex::encode(hasher.finalize())
}

pub fn cache_key(path: &Path, size: u64, mtime_ms: i64, variant: &str) -> String {
  let mut hasher = Sha256::new();
  hasher.update(path.to_string_lossy().as_bytes());
  hasher.update(size.to_le_bytes());
  hasher.update(mtime_ms.to_le_bytes());
  hasher.update(variant.as_bytes());
  hex::encode(hasher.finalize())
}

pub fn ensure_cache_dir(path: &Path) -> AppResult<()> {
  if !path.exists() {
    fs::create_dir_all(path)?;
  }
  Ok(())
}

pub fn sidecar_path(output_path: &Path) -> PathBuf {
  let mut new_path = output_path.to_path_buf();
  let file_name = output_path
    .file_name()
    .and_then(|name| name.to_str())
    .unwrap_or("cache-item");
  new_path.set_file_name(format!("{file_name}.json"));
  new_path
}

pub fn write_sidecar(output_path: &Path, fingerprint: &CacheFingerprint) -> AppResult<()> {
  let sidecar = sidecar_path(output_path);
  let content = serde_json::to_vec(fingerprint)
    .map_err(|err| std::io::Error::other(format!("failed to serialize fingerprint: {err}")))?;
  fs::write(sidecar, content)?;
  Ok(())
}

pub fn is_cache_valid(output_path: &Path, expected: &CacheFingerprint) -> bool {
  if !output_path.exists() {
    return false;
  }

  let sidecar = sidecar_path(output_path);
  let Ok(content) = fs::read(sidecar) else {
    return false;
  };

  let Ok(found) = serde_json::from_slice::<CacheFingerprint>(&content) else {
    return false;
  };

  found == *expected
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn cache_key_changes_when_mtime_changes() {
    let path = Path::new("/tmp/a.heic");
    let old_key = cache_key(path, 1024, 1000, "thumb");
    let new_key = cache_key(path, 1024, 1001, "thumb");

    assert_ne!(old_key, new_key);
  }

  #[test]
  fn cache_key_changes_when_size_changes() {
    let path = Path::new("/tmp/a.heic");
    let old_key = cache_key(path, 1024, 1000, "thumb");
    let new_key = cache_key(path, 2048, 1000, "thumb");

    assert_ne!(old_key, new_key);
  }
}
