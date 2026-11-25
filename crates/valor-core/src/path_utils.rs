use std::path::{Path, PathBuf};

/// Normalize persisted filesystem paths without resolving symlinks or requiring existence.
pub fn normalize_path(path: &Path) -> PathBuf {
    PathBuf::from(normalize_path_string(&path.to_string_lossy()))
}

pub fn normalize_path_string(path: &str) -> String {
    let mut value = path.trim().to_string();
    if cfg!(windows) {
        value = value.replace('/', "\\");
        let upper = value.to_ascii_uppercase();
        if upper.starts_with("\\\\?\\UNC\\") {
            value = format!("\\\\{}", &value[8..]);
        } else if value.starts_with("\\\\?\\") {
            value.drain(..4);
        }
        let bytes = value.as_bytes();
        if bytes.len() >= 2 && bytes[1] == b':' && bytes[0].is_ascii_alphabetic() {
            value.replace_range(0..1, &value[0..1].to_ascii_uppercase());
        }
        while value.ends_with('\\') && value.len() > 3 {
            value.pop();
        }
    } else {
        while value.ends_with('/') && value.len() > 1 {
            value.pop();
        }
    }
    value
}

pub fn paths_equal(left: &Path, right: &Path) -> bool {
    let left = normalize_path_string(&left.to_string_lossy());
    let right = normalize_path_string(&right.to_string_lossy());
    if cfg!(windows) {
        left.eq_ignore_ascii_case(&right)
    } else {
        left == right
    }
}

pub fn path_is_within(path: &Path, root: &Path) -> bool {
    let path = normalize_path_string(&path.to_string_lossy());
    let root = normalize_path_string(&root.to_string_lossy());
    let (path, root) = if cfg!(windows) {
        (path.to_ascii_lowercase(), root.to_ascii_lowercase())
    } else {
        (path, root)
    };
    if path == root {
        return true;
    }
    path.strip_prefix(&root).is_some_and(|rest| {
        root.ends_with(std::path::MAIN_SEPARATOR)
            || rest.starts_with(std::path::MAIN_SEPARATOR)
            || (cfg!(windows) && (root.ends_with('\\') || rest.starts_with('\\')))
    })
}
