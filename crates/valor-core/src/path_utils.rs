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

/// Case-insensitive natural (numeric-aware) string comparison so "Episode 2" < "Episode 10".
pub fn natural_cmp(a: &str, b: &str) -> std::cmp::Ordering {
    let mut ai = a.chars().peekable();
    let mut bi = b.chars().peekable();
    loop {
        match (ai.peek().copied(), bi.peek().copied()) {
            (None, None) => return std::cmp::Ordering::Equal,
            (None, Some(_)) => return std::cmp::Ordering::Less,
            (Some(_), None) => return std::cmp::Ordering::Greater,
            (Some(ac), Some(bc)) if ac.is_ascii_digit() && bc.is_ascii_digit() => {
                let mut an = String::new();
                while let Some(&c) = ai.peek() {
                    if c.is_ascii_digit() {
                        an.push(c);
                        ai.next();
                    } else {
                        break;
                    }
                }
                let mut bn = String::new();
                while let Some(&c) = bi.peek() {
                    if c.is_ascii_digit() {
                        bn.push(c);
                        bi.next();
                    } else {
                        break;
                    }
                }
                let a_val = an.trim_start_matches('0');
                let b_val = bn.trim_start_matches('0');
                let ord = a_val
                    .len()
                    .cmp(&b_val.len())
                    .then_with(|| a_val.cmp(b_val))
                    .then_with(|| an.len().cmp(&bn.len()));
                if ord != std::cmp::Ordering::Equal {
                    return ord;
                }
            }
            (Some(ac), Some(bc)) => {
                ai.next();
                bi.next();
                let ord = ac.to_ascii_lowercase().cmp(&bc.to_ascii_lowercase());
                if ord != std::cmp::Ordering::Equal {
                    return ord;
                }
            }
        }
    }
}
