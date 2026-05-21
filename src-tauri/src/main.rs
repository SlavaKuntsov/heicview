mod cache;
mod commands;
mod dto;
mod errors;
mod indexer;
mod thumbnails;

use tauri::Manager;
use thumbnails::ThumbnailService;

pub struct AppState {
  thumbnails: ThumbnailService,
}

fn main() {
  tauri::Builder::default()
    .plugin(tauri_plugin_dialog::init())
    .setup(|app| {
      let cache_root = app
        .path()
        .app_cache_dir()
        .map_err(|err| format!("failed to resolve app cache directory: {err}"))?
        .join("iphone-gallery-viewer");

      let worker_count = std::thread::available_parallelism()
        .map(|parallelism| parallelism.get().min(6).max(2))
        .unwrap_or(2);

      let thumbnails = ThumbnailService::new(cache_root, worker_count)
        .map_err(|err| format!("failed to initialize thumbnail queue: {err}"))?;

      app.manage(AppState { thumbnails });
      Ok(())
    })
    .invoke_handler(tauri::generate_handler![
      commands::scan_folder,
      commands::generate_thumbnail,
      commands::resolve_display_image,
      commands::resolve_playable_video
    ])
    .run(tauri::generate_context!())
    .expect("failed to run tauri application");
}
