use std::path::PathBuf;

use tauri::State;

use crate::{
  dto::{
    DisplayImageRequest, DisplayImageResponse, PlayableVideoRequest, PlayableVideoResponse,
    ScanResult, ThumbRequest, ThumbResponse,
  },
  indexer,
  AppState,
};

#[tauri::command]
pub fn scan_folder(folder_path: String) -> Result<ScanResult, String> {
  let root = PathBuf::from(&folder_path);
  let items = indexer::scan_media(&root).map_err(|err| err.to_user_message())?;

  Ok(ScanResult {
    root_path: folder_path,
    items,
  })
}

#[tauri::command]
pub fn generate_thumbnail(
  request: ThumbRequest,
  state: State<'_, AppState>,
) -> Result<ThumbResponse, String> {
  state
    .thumbnails
    .thumbnail(request)
    .map_err(|err| err.to_user_message())
}

#[tauri::command]
pub fn resolve_display_image(
  request: DisplayImageRequest,
  state: State<'_, AppState>,
) -> Result<DisplayImageResponse, String> {
  state
    .thumbnails
    .display_image(request)
    .map_err(|err| err.to_user_message())
}

#[tauri::command]
pub fn resolve_playable_video(
  request: PlayableVideoRequest,
  state: State<'_, AppState>,
) -> Result<PlayableVideoResponse, String> {
  state
    .thumbnails
    .playable_video(request)
    .map_err(|err| err.to_user_message())
}
