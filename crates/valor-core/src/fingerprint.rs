use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
use std::path::Path;
use thiserror::Error;

const CHUNK_SIZE: usize = 1024 * 1024; // 1 MB

#[derive(Error, Debug)]
pub enum FingerprintError {
    #[error("IO error while fingerprinting: {0}")]
    Io(#[from] std::io::Error),
}

/// Computes a blake3 fingerprint over file size + first 1MB + last 1MB.
/// Fast, robust against renames and movements.
pub fn compute_fingerprint<P: AsRef<Path>>(path: P) -> Result<String, FingerprintError> {
    let mut file = File::open(path)?;
    let metadata = file.metadata()?;
    let size = metadata.len();

    let mut hasher = blake3::Hasher::new();
    hasher.update(&size.to_le_bytes());

    let mut buffer = vec![0u8; CHUNK_SIZE];

    // First 1MB (or entire file if <= 1MB)
    let first_read = file.read(&mut buffer)?;
    hasher.update(&buffer[..first_read]);

    // Last 1MB if file is larger than 1MB
    if size > (CHUNK_SIZE as u64) {
        let seek_offset = size.saturating_sub(CHUNK_SIZE as u64);
        file.seek(SeekFrom::Start(seek_offset))?;
        let last_read = file.read(&mut buffer)?;
        hasher.update(&buffer[..last_read]);
    }

    Ok(hasher.finalize().to_hex().to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use tempfile::NamedTempFile;

    #[test]
    fn test_fingerprint_deterministic() {
        let mut f1 = NamedTempFile::new().unwrap();
        f1.write_all(b"Hello Valor Media Player Test Content 123456")
            .unwrap();
        f1.flush().unwrap();

        let fp1 = compute_fingerprint(f1.path()).unwrap();
        let fp2 = compute_fingerprint(f1.path()).unwrap();
        assert_eq!(fp1, fp2);
        assert_eq!(fp1.len(), 64);
    }
}
