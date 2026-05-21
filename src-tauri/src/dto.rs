use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum MediaKind {
  Photo,
  Video,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaEntry {
  pub id: String,
  pub path: String,
  pub file_name: String,
  pub extension: String,
  pub kind: MediaKind,
  pub size: u64,
  pub mtime_ms: i64,
  pub duration_ms: Option<u64>,
  pub width: Option<u32>,
  pub height: Option<u32>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanResult {
  pub root_path: String,
  pub items: Vec<MediaEntry>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThumbRequest {
  pub path: String,
  pub kind: MediaKind,
  pub size: u64,
  pub mtime_ms: i64,
  pub extension: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ThumbResponse {
  pub cache_path: String,
  pub from_cache: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DisplayImageRequest {
  pub path: String,
  pub size: u64,
  pub mtime_ms: i64,
  pub extension: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DisplayImageResponse {
  pub display_path: String,
  pub converted: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlayableVideoRequest {
  pub path: String,
  pub size: u64,
  pub mtime_ms: i64,
  pub extension: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlayableVideoResponse {
  pub video_path: String,
  pub transcoded: bool,
}
