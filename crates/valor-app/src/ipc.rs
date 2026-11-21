use std::path::{Path, PathBuf};
use std::sync::mpsc::{channel, Receiver, Sender};
use tracing::{info, warn};

pub fn get_user_identifier() -> String {
    #[cfg(windows)]
    {
        std::env::var("USERNAME")
            .or_else(|_| std::env::var("USERPROFILE"))
            .map(|u| format!("{:x}", md5_hash(u.as_bytes())))
            .unwrap_or_else(|_| "default_user".to_string())
    }
    #[cfg(not(windows))]
    {
        std::env::var("USER")
            .map(|u| format!("{:x}", md5_hash(u.as_bytes())))
            .unwrap_or_else(|_| "default_user".to_string())
    }
}

fn md5_hash(bytes: &[u8]) -> u64 {
    // Simple deterministic hash for username without extra crypto dependencies
    let mut h = 0xcbf29ce484222325u64;
    for b in bytes {
        h ^= *b as u64;
        h = h.wrapping_mul(0x100000001b3);
    }
    h
}

pub fn get_ipc_pipe_name() -> String {
    #[cfg(windows)]
    {
        format!(r"\\.\pipe\valor-ipc-{}", get_user_identifier())
    }
    #[cfg(not(windows))]
    {
        if let Ok(runtime_dir) = std::env::var("XDG_RUNTIME_DIR") {
            let p = Path::new(&runtime_dir).join("valor.sock");
            p.to_string_lossy().to_string()
        } else {
            let dir = PathBuf::from(format!("/tmp/valor-{}", get_user_identifier()));
            let _ = std::fs::create_dir_all(&dir);
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                let _ = std::fs::set_permissions(&dir, std::fs::Permissions::from_mode(0o700));
            }
            dir.join("valor.sock").to_string_lossy().to_string()
        }
    }
}

/// Validates and canonicalizes a path string.
/// Rejects empty strings, non-existent paths, and paths that are not regular files or directories.
pub fn validate_and_canonicalize_path<P: AsRef<Path>>(raw_path: P) -> Result<PathBuf, String> {
    let p = raw_path.as_ref();
    let s = p.to_string_lossy();
    if s.trim().is_empty() {
        return Err("Path is empty".to_string());
    }

    if !p.exists() {
        return Err(format!("Path does not exist: {:?}", p));
    }

    let canonical = match std::fs::canonicalize(p) {
        Ok(c) => c,
        Err(e) => return Err(format!("Canonicalization failed for {:?}: {}", p, e)),
    };

    if !canonical.is_file() && !canonical.is_dir() {
        return Err(format!(
            "Path is neither a regular file nor directory: {:?}",
            canonical
        ));
    }

    Ok(canonical)
}

/// Validates that an IPC payload does not exceed the 64KB security threshold.
pub fn validate_ipc_payload_size(bytes: &[u8]) -> Result<(), String> {
    if bytes.len() > 65536 {
        Err(format!(
            "Payload exceeds 64KB security limit (got {} bytes)",
            bytes.len()
        ))
    } else {
        Ok(())
    }
}

/// Attempts to forward arguments to an existing running Valor instance.
/// Returns Ok(true) if successfully connected and forwarded (caller should exit).
/// Returns Ok(false) if no server is running (caller should become server).
pub fn try_forward_to_existing_instance(args: &[String]) -> Result<bool, String> {
    if args.is_empty() || args[0] == "--bench" {
        return Ok(false);
    }

    let mut valid_paths: Vec<String> = Vec::new();
    for arg in args {
        if let Ok(canon) = validate_and_canonicalize_path(arg) {
            valid_paths.push(canon.to_string_lossy().to_string());
        }
    }

    if valid_paths.is_empty() {
        return Ok(false);
    }

    let json_payload = match serde_json::to_string(&valid_paths) {
        Ok(j) => j,
        Err(e) => return Err(format!("JSON serialization error: {}", e)),
    };

    let payload_bytes = format!("{}\n", json_payload);
    validate_ipc_payload_size(payload_bytes.as_bytes())?;

    #[cfg(windows)]
    {
        use std::ffi::OsStr;
        use std::os::windows::ffi::OsStrExt;
        use windows::Win32::Foundation::{
            CloseHandle, GENERIC_READ, GENERIC_WRITE, INVALID_HANDLE_VALUE,
        };
        use windows::Win32::Storage::FileSystem::{
            CreateFileW, FILE_ATTRIBUTE_NORMAL, OPEN_EXISTING,
        };

        let pipe_name = get_ipc_pipe_name();
        let wide: Vec<u16> = OsStr::new(&pipe_name)
            .encode_wide()
            .chain(std::iter::once(0))
            .collect();

        unsafe {
            let handle = CreateFileW(
                windows::core::PCWSTR(wide.as_ptr()),
                GENERIC_READ.0 | GENERIC_WRITE.0,
                windows::Win32::Storage::FileSystem::FILE_SHARE_NONE,
                None,
                OPEN_EXISTING,
                FILE_ATTRIBUTE_NORMAL,
                None,
            );

            if let Ok(h) = handle {
                if h != INVALID_HANDLE_VALUE {
                    use windows::Win32::Storage::FileSystem::WriteFile;
                    let mut bytes_written = 0u32;
                    let write_res = WriteFile(
                        h,
                        Some(payload_bytes.as_bytes()),
                        Some(&mut bytes_written),
                        None,
                    );
                    let _ = CloseHandle(h);

                    if write_res.is_ok() && bytes_written > 0 {
                        info!(
                            "Forwarded {} paths to existing instance via named pipe",
                            valid_paths.len()
                        );
                        return Ok(true);
                    }
                }
            }
        }
        Ok(false)
    }

    #[cfg(not(windows))]
    {
        use std::io::Write;
        use std::os::unix::net::UnixStream;

        let sock_path = get_ipc_pipe_name();
        #[cfg(unix)]
        {
            use std::os::unix::fs::MetadataExt;
            if let Ok(meta) = std::fs::metadata(&sock_path) {
                let sock_uid = meta.uid();
                let current_uid = unsafe { libc::getuid() };
                if sock_uid != current_uid {
                    return Err(
                        "Socket owner mismatch; refusing connection for security".to_string()
                    );
                }
            }
        }

        if let Ok(mut stream) = UnixStream::connect(&sock_path) {
            if stream.write_all(payload_bytes.as_bytes()).is_ok() && stream.flush().is_ok() {
                info!(
                    "Forwarded {} paths to existing instance via Unix socket",
                    valid_paths.len()
                );
                return Ok(true);
            }
        }
        Ok(false)
    }
}

/// Starts the single-instance IPC server on the per-user pipe/socket.
pub fn start_single_instance_ipc_server() -> Receiver<PathBuf> {
    let (tx, rx) = channel();

    #[cfg(windows)]
    {
        let pipe_name = get_ipc_pipe_name();
        std::thread::spawn(move || {
            run_windows_named_pipe_server(&pipe_name, tx);
        });
    }

    #[cfg(not(windows))]
    {
        let sock_path = get_ipc_pipe_name();
        std::thread::spawn(move || {
            run_unix_socket_server(&sock_path, tx);
        });
    }

    rx
}

#[cfg(windows)]
fn run_windows_named_pipe_server(pipe_name: &str, tx: Sender<PathBuf>) {
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;
    use windows::Win32::Foundation::{CloseHandle, INVALID_HANDLE_VALUE};
    use windows::Win32::Security::Authorization::ConvertStringSecurityDescriptorToSecurityDescriptorW;
    use windows::Win32::Security::{PSECURITY_DESCRIPTOR, SECURITY_ATTRIBUTES};
    use windows::Win32::Storage::FileSystem::{ReadFile, FILE_FLAGS_AND_ATTRIBUTES};
    use windows::Win32::System::Pipes::{
        ConnectNamedPipe, CreateNamedPipeW, DisconnectNamedPipe, PIPE_READMODE_MESSAGE,
        PIPE_REJECT_REMOTE_CLIENTS, PIPE_TYPE_MESSAGE, PIPE_WAIT,
    };

    let wide: Vec<u16> = OsStr::new(pipe_name)
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();

    info!(
        "Starting secure single-instance IPC Named Pipe Server at {}",
        pipe_name
    );

    // Build explicit DACL granting access solely to current user / owner rights
    let mut p_sd = PSECURITY_DESCRIPTOR::default();
    let mut sa = SECURITY_ATTRIBUTES {
        nLength: std::mem::size_of::<SECURITY_ATTRIBUTES>() as u32,
        lpSecurityDescriptor: std::ptr::null_mut(),
        bInheritHandle: windows::Win32::Foundation::BOOL(0),
    };

    let sd_ok = unsafe {
        ConvertStringSecurityDescriptorToSecurityDescriptorW(
            windows::core::w!("D:(A;;GA;;;OW)"),
            1,
            &mut p_sd,
            None,
        )
        .is_ok()
    };
    if sd_ok && !p_sd.0.is_null() {
        sa.lpSecurityDescriptor = p_sd.0;
    }

    let sa_ptr = if sd_ok && !p_sd.0.is_null() {
        Some(&sa as *const SECURITY_ATTRIBUTES)
    } else {
        None
    };

    // FILE_FLAG_FIRST_PIPE_INSTANCE = 0x00080000 (prevents pipe squatting)
    // PIPE_ACCESS_DUPLEX = 0x00000003
    let open_mode = FILE_FLAGS_AND_ATTRIBUTES(0x00000003 | 0x00080000);
    let pipe_mode =
        PIPE_TYPE_MESSAGE | PIPE_READMODE_MESSAGE | PIPE_WAIT | PIPE_REJECT_REMOTE_CLIENTS;

    loop {
        unsafe {
            let pipe_handle = CreateNamedPipeW(
                windows::core::PCWSTR(wide.as_ptr()),
                open_mode,
                pipe_mode,
                1, // strictly 1 instance max
                65536,
                65536,
                0,
                sa_ptr,
            );

            if pipe_handle == INVALID_HANDLE_VALUE {
                warn!("Failed to create named pipe; retrying in 1s");
                std::thread::sleep(std::time::Duration::from_millis(1000));
                continue;
            }
            let h = pipe_handle;

            let connected = ConnectNamedPipe(h, None);
            if connected.is_ok() {
                // Buffer capped strictly to 64KB (65536 bytes)
                let mut buffer = [0u8; 65536];
                let mut bytes_read = 0u32;
                if ReadFile(h, Some(&mut buffer), Some(&mut bytes_read), None).is_ok()
                    && bytes_read > 0
                    && (bytes_read as usize) <= 65536
                {
                    if let Ok(text) = std::str::from_utf8(&buffer[..bytes_read as usize]) {
                        if let Ok(paths) = serde_json::from_str::<Vec<String>>(text.trim()) {
                            for raw in paths {
                                match validate_and_canonicalize_path(&raw) {
                                    Ok(canon) => {
                                        info!("IPC received valid path: {:?}", canon);
                                        let _ = tx.send(canon);
                                    }
                                    Err(e) => {
                                        warn!("IPC rejected invalid path {:?}: {}", raw, e);
                                    }
                                }
                            }
                        }
                    }
                }
                let _ = DisconnectNamedPipe(h);
            }
            let _ = CloseHandle(h);
        }
    }
}

#[cfg(not(windows))]
fn run_unix_socket_server(sock_path: &str, tx: Sender<PathBuf>) {
    use std::io::{BufRead, BufReader};
    use std::os::unix::net::UnixListener;

    let _ = std::fs::remove_file(sock_path);
    let listener = match UnixListener::bind(sock_path) {
        Ok(l) => l,
        Err(e) => {
            error!("Failed to bind Unix domain socket at {}: {}", sock_path, e);
            return;
        }
    };

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(sock_path, std::fs::Permissions::from_mode(0o600));
    }

    info!(
        "Starting single-instance Unix Domain Socket Server at {}",
        sock_path
    );
    for stream in listener.incoming().flatten() {
        let mut reader = BufReader::new(stream).take(65536);
        let mut line = String::new();
        if reader.read_line(&mut line).is_ok() {
            if let Ok(paths) = serde_json::from_str::<Vec<String>>(line.trim()) {
                for raw in paths {
                    if let Ok(canon) = validate_and_canonicalize_path(&raw) {
                        let _ = tx.send(canon);
                    }
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_validate_and_canonicalize_valid_file() {
        let test_file = Path::new("../../tests/fixtures/media/clip_01_multitrack.mkv");
        if test_file.exists() {
            let canon = validate_and_canonicalize_path(test_file);
            assert!(canon.is_ok());
            assert!(canon.unwrap().is_file());
        }
    }

    #[test]
    fn test_validate_and_canonicalize_valid_dir() {
        let test_dir = Path::new("../../tests/fixtures/media");
        if test_dir.exists() {
            let canon = validate_and_canonicalize_path(test_dir);
            assert!(canon.is_ok());
            assert!(canon.unwrap().is_dir());
        }
    }

    #[test]
    fn test_validate_and_canonicalize_rejects_nonexistent() {
        let invalid = Path::new("non_existent_folder_or_clip_123456.mkv");
        let res = validate_and_canonicalize_path(invalid);
        assert!(res.is_err());
    }

    #[test]
    fn test_validate_and_canonicalize_rejects_empty() {
        let res = validate_and_canonicalize_path("");
        assert!(res.is_err());
    }

    #[test]
    fn test_user_identifier_deterministic() {
        let id1 = get_user_identifier();
        let id2 = get_user_identifier();
        assert_eq!(id1, id2);
        assert!(!id1.is_empty());
    }

    #[test]
    fn test_payload_cap_exceeding_64kb_rejected() {
        let small = vec![0u8; 1024];
        assert!(validate_ipc_payload_size(&small).is_ok());

        let massive = vec![0u8; 65537];
        let res = validate_ipc_payload_size(&massive);
        assert!(res.is_err(), "Payload > 64KB must be rejected");
        assert!(res.unwrap_err().contains("exceeds 64KB"));
    }
}
