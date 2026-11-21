pub fn update_os_power_state(playing: bool) {
    #[cfg(target_os = "windows")]
    unsafe {
        use windows::Win32::System::Power::{
            SetThreadExecutionState, ES_CONTINUOUS, ES_DISPLAY_REQUIRED, ES_SYSTEM_REQUIRED,
        };
        if playing {
            SetThreadExecutionState(ES_CONTINUOUS | ES_SYSTEM_REQUIRED | ES_DISPLAY_REQUIRED);
        } else {
            SetThreadExecutionState(ES_CONTINUOUS);
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = playing;
    }
}
