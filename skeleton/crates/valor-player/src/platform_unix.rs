//! Unix-native path conversion for the player boundary.

use std::ffi::OsString;
use std::path::Path;

pub fn native_path(path: &Path) -> OsString {
    path.as_os_str().to_owned()
}
