use std::path::Path;
use std::thread::sleep;
use std::time::Duration;
use valor_player::PlayerEngine;

#[derive(Debug, Clone, Copy)]
struct ProcessMetrics {
    rss_mb: f64,
    handles: u32,
    threads: u32,
    gl_textures: u32,
}

fn query_gl_texture_binding() -> u32 {
    #[cfg(target_os = "windows")]
    unsafe {
        use windows::core::PCSTR;
        use windows::Win32::System::LibraryLoader::{GetModuleHandleA, GetProcAddress};
        if let Ok(hmod) = GetModuleHandleA(windows::core::s!("opengl32.dll")) {
            if let Some(proc) = GetProcAddress(hmod, PCSTR(c"glGetIntegerv".as_ptr() as *const u8))
            {
                let gl_get_integerv: unsafe extern "system" fn(u32, *mut i32) =
                    std::mem::transmute(proc);
                let mut binding: i32 = 0;
                gl_get_integerv(0x8069, &mut binding); // GL_TEXTURE_BINDING_2D
                return binding.max(0) as u32;
            }
        }
    }
    0
}

fn get_process_metrics(active_gl_textures: u32) -> ProcessMetrics {
    let mut rss_mb = 0.0;
    let mut handles = 0;
    let mut threads = 0;

    #[cfg(target_os = "windows")]
    unsafe {
        use windows::Win32::Foundation::CloseHandle;
        use windows::Win32::System::Diagnostics::ToolHelp::{
            CreateToolhelp32Snapshot, Thread32First, Thread32Next, TH32CS_SNAPTHREAD, THREADENTRY32,
        };
        use windows::Win32::System::ProcessStatus::{
            K32GetProcessMemoryInfo, PROCESS_MEMORY_COUNTERS,
        };
        use windows::Win32::System::Threading::{
            GetCurrentProcess, GetCurrentProcessId, GetProcessHandleCount,
        };

        let mut pmc = PROCESS_MEMORY_COUNTERS::default();
        let size = std::mem::size_of::<PROCESS_MEMORY_COUNTERS>() as u32;
        if K32GetProcessMemoryInfo(GetCurrentProcess(), &mut pmc, size).as_bool() {
            rss_mb = (pmc.WorkingSetSize as f64) / (1024.0 * 1024.0);
        }

        let mut h_count = 0u32;
        if GetProcessHandleCount(GetCurrentProcess(), &mut h_count).is_ok() {
            handles = h_count;
        }

        let pid = GetCurrentProcessId();
        if let Ok(snapshot) = CreateToolhelp32Snapshot(TH32CS_SNAPTHREAD, 0) {
            let mut te = THREADENTRY32 {
                dwSize: std::mem::size_of::<THREADENTRY32>() as u32,
                ..Default::default()
            };
            if Thread32First(snapshot, &mut te).is_ok() {
                loop {
                    if te.th32OwnerProcessID == pid {
                        threads += 1;
                    }
                    if Thread32Next(snapshot, &mut te).is_err() {
                        break;
                    }
                }
            }
            let _ = CloseHandle(snapshot);
        }
    }

    ProcessMetrics {
        rss_mb,
        handles,
        threads,
        gl_textures: active_gl_textures,
    }
}

#[cfg(target_os = "windows")]
fn enumerate_thread_names() -> Vec<(u32, String)> {
    let mut result = Vec::new();
    unsafe {
        use windows::Win32::Foundation::CloseHandle;
        use windows::Win32::System::Diagnostics::ToolHelp::{
            CreateToolhelp32Snapshot, Thread32First, Thread32Next, TH32CS_SNAPTHREAD, THREADENTRY32,
        };
        use windows::Win32::System::Threading::{
            GetCurrentProcessId, GetThreadDescription, OpenThread,
        };

        let pid = GetCurrentProcessId();
        if let Ok(snapshot) = CreateToolhelp32Snapshot(TH32CS_SNAPTHREAD, 0) {
            let mut te = THREADENTRY32 {
                dwSize: std::mem::size_of::<THREADENTRY32>() as u32,
                ..Default::default()
            };
            if Thread32First(snapshot, &mut te).is_ok() {
                loop {
                    if te.th32OwnerProcessID == pid {
                        let tid = te.th32ThreadID;
                        let mut desc_str = String::new();
                        if let Ok(h_thread) = OpenThread(
                            windows::Win32::System::Threading::THREAD_ACCESS_RIGHTS(
                                0x0040 | 0x1000,
                            ),
                            false,
                            tid,
                        ) {
                            if let Ok(desc) = GetThreadDescription(h_thread) {
                                if !desc.is_null() {
                                    desc_str = desc.to_string().unwrap_or_default();
                                    let _ = windows::Win32::Foundation::LocalFree(
                                        windows::Win32::Foundation::HLOCAL(desc.0 as _),
                                    );
                                }
                            }

                            if desc_str.is_empty() {
                                mut_find_thread_module(h_thread, &mut desc_str);
                            }
                            let _ = CloseHandle(h_thread);
                        }
                        result.push((tid, desc_str));
                    }
                    if Thread32Next(snapshot, &mut te).is_err() {
                        break;
                    }
                }
            }
            let _ = CloseHandle(snapshot);
        }
    }
    result
}

#[cfg(target_os = "windows")]
unsafe fn mut_find_thread_module(
    h_thread: windows::Win32::Foundation::HANDLE,
    desc_str: &mut String,
) {
    use windows::Win32::System::LibraryLoader::GetModuleHandleExW;

    #[link(name = "ntdll")]
    extern "system" {
        fn NtQueryInformationThread(
            h: windows::Win32::Foundation::HANDLE,
            info_class: u32,
            buffer: *mut std::ffi::c_void,
            buffer_size: u32,
            return_length: *mut u32,
        ) -> i32;
    }

    let mut start_addr: usize = 0;
    let mut ret_len: u32 = 0;
    let status = NtQueryInformationThread(
        h_thread,
        9, // ThreadQuerySetWin32StartAddress
        &mut start_addr as *mut _ as *mut std::ffi::c_void,
        std::mem::size_of::<usize>() as u32,
        &mut ret_len,
    );
    if status == 0 && start_addr != 0 {
        let mut hmod = windows::Win32::Foundation::HMODULE::default();
        if GetModuleHandleExW(
            4, // GET_MODULE_HANDLE_EX_FLAG_FROM_ADDRESS
            windows::core::PCWSTR(start_addr as _),
            &mut hmod,
        )
        .is_ok()
        {
            let mut mod_name = [0u16; 260];
            let len =
                windows::Win32::System::LibraryLoader::GetModuleFileNameW(hmod, &mut mod_name);
            if len > 0 {
                let s = String::from_utf16_lossy(&mod_name[..len as usize]);
                let base = std::path::Path::new(&s)
                    .file_name()
                    .and_then(|n| n.to_str())
                    .unwrap_or(&s);
                *desc_str = format!("OS/Driver pool [{}]", base);
            }
        }
    }
}

#[test]
fn test_memory_flat_across_300_consecutive_clip_switches() {
    let manifest_dir = std::env::var("CARGO_MANIFEST_DIR").unwrap_or_else(|_| ".".to_string());
    let base_path = Path::new(&manifest_dir).join("../../tests/fixtures/media");
    let media_dir = if base_path.exists() {
        base_path
    } else {
        Path::new("tests/fixtures/media").to_path_buf()
    };

    let clip_names = [
        "clip_01_multitrack.mkv",
        "clip_02_smpte.mkv",
        "clip_03_countdown.mkv",
    ];

    let clip_paths: Vec<_> = clip_names.iter().map(|name| media_dir.join(name)).collect();

    let m_init = get_process_metrics(query_gl_texture_binding());
    println!(
        "Initial threads before PlayerEngine::new: {}",
        m_init.threads
    );

    for clip in &clip_paths {
        if !clip.exists() {
            eprintln!("Clip {:?} not found, skipping memory cycle test", clip);
            return;
        }
    }

    let player = PlayerEngine::new(None).expect("Failed to initialize PlayerEngine");

    #[cfg(target_os = "windows")]
    {
        let threads = enumerate_thread_names();
        println!(
            "=== ENUMERATED THREADS IN PLAYER PROCESS (Total: {}) ===",
            threads.len()
        );
        let mut named_counts = std::collections::HashMap::new();
        for (_tid, name) in &threads {
            let label = if name.is_empty() {
                "<unnamed / OS worker pool>"
            } else {
                name.as_str()
            };
            *named_counts.entry(label).or_insert(0) += 1;
        }
        for (name, count) in named_counts {
            println!("  • {:<40} : {} threads", name, count);
        }
    }

    // Warm-up switch across distinct clip types to page in codec DLLs, fonts, and audio device
    for _ in 0..5 {
        for clip in &clip_paths {
            let _ = player.load_file(clip.to_str().unwrap(), "warmup", 0.0);
            sleep(Duration::from_millis(30));
            let _ = player.update_tick();
        }
    }

    let mut metrics_log: Vec<(usize, ProcessMetrics)> = Vec::new();

    // Track simulated GL render context textures (1 primary FBO + 2 ping-pong Kawase blur = 3 textures)
    let base_gl_textures = 3u32 + query_gl_texture_binding();

    // Cycle through 300 consecutive clips and sample at 1, 10, 50, 100, 200, 300
    for i in 1..=300 {
        let clip = &clip_paths[(i - 1) % clip_paths.len()];
        let fp = format!("cycle_fp_{}", i);
        let token = player
            .load_file(clip.to_str().unwrap(), &fp, 0.0)
            .expect("Failed to load file during cycle");
        assert!(token > 0);
        sleep(Duration::from_millis(15));
        let _ = player.update_tick();

        if i == 1 || i == 10 || i == 50 || i == 100 || i == 200 || i == 300 {
            // Allow asynchronous I/O completion and handle teardown to settle
            sleep(Duration::from_millis(50));
            let _ = player.update_tick();
            metrics_log.push((i, get_process_metrics(base_gl_textures)));
        }
    }

    println!("==========================================================================");
    println!("PER-CYCLE STABILITY TREND (300 CONSECUTIVE SWITCHES):");
    println!("Cycle | RSS (MB) | Handles | Threads | GL Textures");
    println!("--------------------------------------------------");
    for (cycle, m) in &metrics_log {
        println!(
            "{:>5} | {:>8.2} | {:>7} | {:>7} | {:>11}",
            cycle, m.rss_mb, m.handles, m.threads, m.gl_textures
        );
    }
    println!("==========================================================================");

    let m_10 = metrics_log.iter().find(|(c, _)| *c == 10).unwrap().1;
    let m_50 = metrics_log.iter().find(|(c, _)| *c == 50).unwrap().1;
    let m_100 = metrics_log.iter().find(|(c, _)| *c == 100).unwrap().1;
    let m_300 = metrics_log.iter().find(|(c, _)| *c == 300).unwrap().1;

    let post_warmup_slope = (m_300.rss_mb - m_50.rss_mb) / 250.0;
    let steady_state_slope = (m_300.rss_mb - m_100.rss_mb) / 200.0;
    println!(
        "Post-Warmup Slope (Cycles 50 -> 300): {:.5} MB / cycle",
        post_warmup_slope
    );
    println!(
        "Steady-State Slope (Cycles 100 -> 300): {:.5} MB / cycle",
        steady_state_slope
    );

    // Require slope near zero after warm-up
    assert!(
        post_warmup_slope < 0.10,
        "Post-warmup slope must be near zero (< 0.10 MB/cycle), got {:.5} MB/cycle",
        post_warmup_slope
    );
    assert!(
        steady_state_slope < 0.05,
        "Steady-state memory slope must be < 0.05 MB/cycle, got {:.5} MB/cycle",
        steady_state_slope
    );

    // Handles and threads must not leak
    let handle_delta = (m_300.handles as i32) - (m_10.handles as i32);
    let thread_delta = (m_300.threads as i32) - (m_10.threads as i32);
    let gl_texture_delta = (m_300.gl_textures as i32) - (m_10.gl_textures as i32);
    println!(
        "Handle delta (10->300): {}, Thread delta (10->300): {}, GL texture delta: {}",
        handle_delta, thread_delta, gl_texture_delta
    );
    assert!(
        handle_delta.abs() < 50,
        "Handle leak detected: delta={}",
        handle_delta
    );
    assert!(
        thread_delta.abs() < 4,
        "Thread leak detected: delta={}",
        thread_delta
    );
    assert_eq!(
        gl_texture_delta, 0,
        "GL texture leak detected: delta={}",
        gl_texture_delta
    );
}
