use std::{
  fs,
  io::BufWriter,
  path::{Path, PathBuf},
  process::Command,
  sync::Arc,
  thread,
};

use crossbeam_channel::{unbounded, Receiver, Sender};
use image::{codecs::jpeg::JpegEncoder, imageops::FilterType, ImageReader};

use crate::{
  cache::{cache_key, ensure_cache_dir, is_cache_valid, write_sidecar, CacheFingerprint},
  dto::{
    DisplayImageRequest, DisplayImageResponse, MediaKind, PlayableVideoRequest, PlayableVideoResponse,
    ThumbRequest, ThumbResponse,
  },
  errors::{AppError, AppResult},
};

#[derive(Clone)]
pub struct ThumbnailService {
  sender: Sender<WorkItem>,
}

#[derive(Debug)]
enum Task {
  Thumb(ThumbRequest),
  DisplayImage(DisplayImageRequest),
  PlayableVideo(PlayableVideoRequest),
}

#[derive(Debug)]
enum WorkerResponse {
  Thumb(ThumbResponse),
  DisplayImage(DisplayImageResponse),
  PlayableVideo(PlayableVideoResponse),
}

struct WorkItem {
  task: Task,
  response: Sender<Result<WorkerResponse, String>>,
}

impl ThumbnailService {
  pub fn new(cache_root: PathBuf, workers: usize) -> AppResult<Self> {
    ensure_cache_dir(&cache_root)?;

    let thumbs_dir = cache_root.join("thumbs");
    let display_dir = cache_root.join("display");
    let video_dir = cache_root.join("video");

    ensure_cache_dir(&thumbs_dir)?;
    ensure_cache_dir(&display_dir)?;
    ensure_cache_dir(&video_dir)?;

    let worker_count = workers.max(1);
    let (sender, receiver) = unbounded::<WorkItem>();
    let shared_cache = Arc::new(CacheDirectories {
      thumbs_dir,
      display_dir,
      video_dir,
    });

    for _ in 0..worker_count {
      let rx = receiver.clone();
      let cache_dirs = Arc::clone(&shared_cache);
      thread::spawn(move || worker_loop(rx, cache_dirs));
    }

    Ok(Self { sender })
  }

  pub fn thumbnail(&self, request: ThumbRequest) -> AppResult<ThumbResponse> {
    let response = self.request(Task::Thumb(request))?;
    match response {
      WorkerResponse::Thumb(value) => Ok(value),
      _ => Err(AppError::InvalidInput("worker response mismatch".to_string())),
    }
  }

  pub fn display_image(&self, request: DisplayImageRequest) -> AppResult<DisplayImageResponse> {
    let response = self.request(Task::DisplayImage(request))?;
    match response {
      WorkerResponse::DisplayImage(value) => Ok(value),
      _ => Err(AppError::InvalidInput("worker response mismatch".to_string())),
    }
  }

  pub fn playable_video(&self, request: PlayableVideoRequest) -> AppResult<PlayableVideoResponse> {
    let response = self.request(Task::PlayableVideo(request))?;
    match response {
      WorkerResponse::PlayableVideo(value) => Ok(value),
      _ => Err(AppError::InvalidInput("worker response mismatch".to_string())),
    }
  }

  fn request(&self, task: Task) -> AppResult<WorkerResponse> {
    let (tx, rx) = unbounded();
    self
      .sender
      .send(WorkItem { task, response: tx })
      .map_err(|err| AppError::ExternalCommand(format!("failed to schedule thumbnail task: {err}")))?;

    let result = rx
      .recv()
      .map_err(|err| AppError::ExternalCommand(format!("failed to receive worker result: {err}")))?;

    result.map_err(AppError::ExternalCommand)
  }
}

struct CacheDirectories {
  thumbs_dir: PathBuf,
  display_dir: PathBuf,
  video_dir: PathBuf,
}

fn worker_loop(receiver: Receiver<WorkItem>, cache_dirs: Arc<CacheDirectories>) {
  while let Ok(item) = receiver.recv() {
    let result = handle_task(item.task, &cache_dirs).map_err(|err| err.to_user_message());
    let _ = item.response.send(result);
  }
}

fn handle_task(task: Task, cache_dirs: &CacheDirectories) -> AppResult<WorkerResponse> {
  match task {
    Task::Thumb(request) => build_thumbnail(request, cache_dirs).map(WorkerResponse::Thumb),
    Task::DisplayImage(request) => {
      build_display_image(request, cache_dirs).map(WorkerResponse::DisplayImage)
    }
    Task::PlayableVideo(request) => {
      build_playable_video(request, cache_dirs).map(WorkerResponse::PlayableVideo)
    }
  }
}

fn build_thumbnail(request: ThumbRequest, cache_dirs: &CacheDirectories) -> AppResult<ThumbResponse> {
  let source = PathBuf::from(&request.path);
  if !source.exists() {
    return Err(AppError::MissingFolder(source));
  }

  let key = cache_key(&source, request.size, request.mtime_ms, "thumb");
  let output = cache_dirs.thumbs_dir.join(format!("{key}.jpg"));
  let fingerprint = CacheFingerprint::from_source(&source, request.size, request.mtime_ms);

  if is_cache_valid(&output, &fingerprint) {
    return Ok(ThumbResponse {
      cache_path: output.to_string_lossy().to_string(),
      from_cache: true,
    });
  }

  if matches!(request.kind, MediaKind::Photo) {
    generate_photo_thumbnail(&source, &request.extension, &output)?;
  } else {
    generate_video_thumbnail(&source, &output)?;
  }

  write_sidecar(&output, &fingerprint)?;

  Ok(ThumbResponse {
    cache_path: output.to_string_lossy().to_string(),
    from_cache: false,
  })
}

fn build_display_image(
  request: DisplayImageRequest,
  cache_dirs: &CacheDirectories,
) -> AppResult<DisplayImageResponse> {
  let source = PathBuf::from(&request.path);
  if !source.exists() {
    return Err(AppError::MissingFolder(source));
  }

  let is_heic = matches!(request.extension.to_ascii_lowercase().as_str(), "heic" | "heif");
  if !is_heic {
    return Ok(DisplayImageResponse {
      display_path: source.to_string_lossy().to_string(),
      converted: false,
    });
  }

  let key = cache_key(&source, request.size, request.mtime_ms, "display");
  let output = cache_dirs.display_dir.join(format!("{key}.jpg"));
  let fingerprint = CacheFingerprint::from_source(&source, request.size, request.mtime_ms);

  if is_cache_valid(&output, &fingerprint) {
    return Ok(DisplayImageResponse {
      display_path: output.to_string_lossy().to_string(),
      converted: true,
    });
  }

  convert_heif_to_jpeg(&source, &output)?;
  write_sidecar(&output, &fingerprint)?;

  Ok(DisplayImageResponse {
    display_path: output.to_string_lossy().to_string(),
    converted: true,
  })
}

fn build_playable_video(
  request: PlayableVideoRequest,
  cache_dirs: &CacheDirectories,
) -> AppResult<PlayableVideoResponse> {
  let source = PathBuf::from(&request.path);
  if !source.exists() {
    return Err(AppError::MissingFolder(source));
  }

  let ext = request.extension.to_ascii_lowercase();
  if ext == "mp4" {
    return Ok(PlayableVideoResponse {
      video_path: source.to_string_lossy().to_string(),
      transcoded: false,
    });
  }

  let key = cache_key(&source, request.size, request.mtime_ms, "playable-video");
  let output = cache_dirs.video_dir.join(format!("{key}.mp4"));
  let fingerprint = CacheFingerprint::from_source(&source, request.size, request.mtime_ms);

  if is_cache_valid(&output, &fingerprint) {
    return Ok(PlayableVideoResponse {
      video_path: output.to_string_lossy().to_string(),
      transcoded: true,
    });
  }

  transcode_video_to_h264(&source, &output)?;
  write_sidecar(&output, &fingerprint)?;

  Ok(PlayableVideoResponse {
    video_path: output.to_string_lossy().to_string(),
    transcoded: true,
  })
}

fn generate_photo_thumbnail(source: &Path, extension: &str, output: &Path) -> AppResult<()> {
  let ext = extension.to_ascii_lowercase();
  if ext == "jpg" || ext == "jpeg" || ext == "png" {
    return native_photo_thumbnail(source, output);
  }

  if ext == "heic" || ext == "heif" {
    if let Ok(()) = ffmpeg_photo_thumbnail(source, output) {
      return Ok(());
    }

    let temp = output.with_extension("tmp.jpg");
    convert_heif_to_jpeg(source, &temp)?;
    ffmpeg_photo_thumbnail(&temp, output)?;
    let _ = fs::remove_file(temp);
    return Ok(());
  }

  ffmpeg_photo_thumbnail(source, output)
}

fn native_photo_thumbnail(source: &Path, output: &Path) -> AppResult<()> {
  let reader = ImageReader::open(source)
    .map_err(|err| AppError::ExternalCommand(format!("failed to open image: {err}")))?;
  let reader = reader
    .with_guessed_format()
    .map_err(|err| AppError::ExternalCommand(format!("failed to detect image format: {err}")))?;
  let image = reader
    .decode()
    .map_err(|err| AppError::ExternalCommand(format!("failed to decode image: {err}")))?;

  let thumbnail = image.resize(400, 400, FilterType::Triangle).to_rgb8();

  let file = fs::File::create(output)
    .map_err(|err| AppError::ExternalCommand(format!("failed to create thumbnail file: {err}")))?;
  let writer = BufWriter::new(file);
  let mut encoder = JpegEncoder::new_with_quality(writer, 82);
  encoder
    .encode_image(&thumbnail)
    .map_err(|err| AppError::ExternalCommand(format!("failed to encode jpeg thumbnail: {err}")))?;

  Ok(())
}

fn generate_video_thumbnail(source: &Path, output: &Path) -> AppResult<()> {
  run_command(
    "ffmpeg",
    &[
      "-y",
      "-hide_banner",
      "-loglevel",
      "error",
      "-ss",
      "00:00:01",
      "-i",
      &source.to_string_lossy(),
      "-threads",
      "1",
      "-frames:v",
      "1",
      "-vf",
      "scale=400:-2:force_original_aspect_ratio=decrease",
      &output.to_string_lossy(),
    ],
  )
}

fn ffmpeg_photo_thumbnail(source: &Path, output: &Path) -> AppResult<()> {
  run_command(
    "ffmpeg",
    &[
      "-y",
      "-hide_banner",
      "-loglevel",
      "error",
      "-i",
      &source.to_string_lossy(),
      "-threads",
      "1",
      "-frames:v",
      "1",
      "-vf",
      "scale=400:-2:force_original_aspect_ratio=decrease",
      &output.to_string_lossy(),
    ],
  )
}

fn convert_heif_to_jpeg(source: &Path, output: &Path) -> AppResult<()> {
  if run_command(
    "heif-convert",
    &[&source.to_string_lossy(), &output.to_string_lossy()],
  )
  .is_ok()
  {
    return Ok(());
  }

  run_command(
    "ffmpeg",
    &[
      "-y",
      "-hide_banner",
      "-loglevel",
      "error",
      "-i",
      &source.to_string_lossy(),
      "-frames:v",
      "1",
      &output.to_string_lossy(),
    ],
  )
}

fn transcode_video_to_h264(source: &Path, output: &Path) -> AppResult<()> {
  run_command(
    "ffmpeg",
    &[
      "-y",
      "-hide_banner",
      "-loglevel",
      "error",
      "-i",
      &source.to_string_lossy(),
      "-threads",
      "1",
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "23",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-movflags",
      "+faststart",
      &output.to_string_lossy(),
    ],
  )
}

fn run_command(binary: &str, args: &[&str]) -> AppResult<()> {
  let output = Command::new(binary)
    .args(args)
    .output()
    .map_err(|err| AppError::ExternalCommand(format!("{binary} not available: {err}")))?;

  if output.status.success() {
    return Ok(());
  }

  let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
  let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();

  Err(AppError::ExternalCommand(format!(
    "{binary} exited with code {:?}. stderr: {} stdout: {}",
    output.status.code(),
    stderr,
    stdout
  )))
}
