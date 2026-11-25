//! Operating-system project paths for Valor application data.

use crate::Error;
use directories::ProjectDirs;
use std::path::PathBuf;

pub fn project_dirs() -> Result<ProjectDirs, Error> {
    ProjectDirs::from("com", "Valor", "Valor").ok_or(Error::ProjectDirectoryUnavailable)
}

pub fn data_dir() -> Result<PathBuf, Error> {
    Ok(project_dirs()?.data_dir().to_path_buf())
}
