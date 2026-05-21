use std::path::PathBuf;

use thiserror::Error;

#[derive(Debug, Error)]
pub enum AppError {
  #[error("Folder does not exist: {0}")]
  MissingFolder(PathBuf),
  #[error("I/O error: {0}")]
  Io(#[from] std::io::Error),
  #[error("External command failed: {0}")]
  ExternalCommand(String),
  #[error("Invalid input: {0}")]
  InvalidInput(String),
}

pub type AppResult<T> = Result<T, AppError>;

impl AppError {
  pub fn to_user_message(&self) -> String {
    match self {
      AppError::MissingFolder(path) => {
        format!("Folder not found: {}", path.display())
      }
      AppError::Io(err) => format!("I/O error: {err}"),
      AppError::ExternalCommand(message) => {
        format!("Media processing failed. Check ffmpeg/libheif installation. Details: {message}")
      }
      AppError::InvalidInput(message) => format!("Invalid input: {message}"),
    }
  }
}
