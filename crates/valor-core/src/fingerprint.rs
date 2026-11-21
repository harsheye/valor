use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
use std::path::Path;
use thiserror::Error;

pub const FINGERPRINT_VERSION: u8 = 0x01;
const CHUNK_SIZE: usize = 1024 * 1024; // 1 MB

#[derive(Error, Debug)]
pub enum FingerprintError {
    #[error("IO error while fingerprinting: {0}")]
    Io(#[from] std::io::Error),
}

fn hash_bounded_chunk<R: Read>(
    reader: &mut R,
    max_bytes: u64,
    hasher: &mut blake3::Hasher,
) -> Result<(), std::io::Error> {
    let mut take = reader.take(max_bytes);
    let mut buf = [0u8; 64 * 1024]; // 64 KB zero-allocation stack buffer
    loop {
        let n = take.read(&mut buf)?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
    }
    Ok(())
}

/// Computes a blake3 fingerprint over:
/// 1. Version byte (0x01)
/// 2. File size as 8-byte little-endian integer
/// 3. First 1 MB (or full file if <= 1 MB)
/// 4. Middle 1 MB (if file > 2 MB)
/// 5. Last 1 MB (if file > 1 MB)
///
/// Fast, robust against renames and movements across filesystems. Zero-allocation streaming.
pub fn compute_fingerprint<P: AsRef<Path>>(path: P) -> Result<String, FingerprintError> {
    let mut file = File::open(path)?;
    let metadata = file.metadata()?;
    let size = metadata.len();

    let mut hasher = blake3::Hasher::new();
    hasher.update(&[FINGERPRINT_VERSION]);
    hasher.update(&size.to_le_bytes());

    // 1. First 1MB (or entire file if <= 1MB)
    hash_bounded_chunk(&mut file, CHUNK_SIZE as u64, &mut hasher)?;

    // 2. Middle 1MB (if file is larger than 2MB)
    if size > (2 * CHUNK_SIZE as u64) {
        let mid_offset = (size / 2).saturating_sub((CHUNK_SIZE / 2) as u64);
        file.seek(SeekFrom::Start(mid_offset))?;
        hash_bounded_chunk(&mut file, CHUNK_SIZE as u64, &mut hasher)?;
    }

    // 3. Last 1MB if file is larger than 1MB
    if size > (CHUNK_SIZE as u64) {
        let seek_offset = size.saturating_sub(CHUNK_SIZE as u64);
        file.seek(SeekFrom::Start(seek_offset))?;
        hash_bounded_chunk(&mut file, CHUNK_SIZE as u64, &mut hasher)?;
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

    #[test]
    fn test_fingerprint_large_file_three_chunks() {
        let mut f1 = NamedTempFile::new().unwrap();
        // Create 3MB file
        let chunk = vec![0xABu8; 1024 * 1024];
        f1.write_all(&chunk).unwrap();
        f1.write_all(&chunk).unwrap();
        f1.write_all(&chunk).unwrap();
        f1.flush().unwrap();

        let fp = compute_fingerprint(f1.path()).unwrap();
        assert_eq!(fp.len(), 64);
    }
}
