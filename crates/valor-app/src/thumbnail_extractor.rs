//! Background thumbnail extractor using Windows Shell IShellItemImageFactory.

#[cfg(windows)]
pub fn extract_thumbnail_to_file(
    file_path: &std::path::Path,
    output_path: &std::path::Path,
    max_w: u32,
    max_h: u32,
) -> Result<(), String> {
    use std::os::windows::ffi::OsStrExt;
    use windows::core::PCWSTR;
    use windows::Win32::Foundation::SIZE;
    use windows::Win32::Graphics::Gdi::{
        DeleteObject, GetDC, GetDIBits, GetObjectW, ReleaseDC, BITMAP, BITMAPINFO,
        BITMAPINFOHEADER, BI_RGB, DIB_RGB_COLORS, HGDIOBJ,
    };
    use windows::Win32::System::Com::{CoInitializeEx, CoUninitialize, COINIT_APARTMENTTHREADED};
    use windows::Win32::UI::Shell::{
        SHCreateItemFromParsingName, IShellItemImageFactory, SIIGBF_THUMBNAILONLY,
    };

    if !file_path.exists() {
        return Err("Input file does not exist".into());
    }

    if let Some(parent) = output_path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }

    unsafe {
        let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
    }

    let wide_path: Vec<u16> = file_path
        .as_os_str()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();
    let pcwstr = PCWSTR::from_raw(wide_path.as_ptr());

    let factory: IShellItemImageFactory = unsafe {
        SHCreateItemFromParsingName(pcwstr, None).map_err(|e| format!("SHCreateItem failed: {e}"))?
    };

    let size_struct = SIZE {
        cx: max_w as i32,
        cy: max_h as i32,
    };

    let hbitmap = unsafe {
        factory
            .GetImage(size_struct, SIIGBF_THUMBNAILONLY)
            .map_err(|e| format!("GetImage failed: {e}"))?
    };

    let save_res = unsafe {
        let mut bm: BITMAP = std::mem::zeroed();
        let get_obj_res = GetObjectW(
            HGDIOBJ(hbitmap.0),
            std::mem::size_of::<BITMAP>() as i32,
            Some(&mut bm as *mut _ as *mut _),
        );

        if get_obj_res == 0 {
            let _ = DeleteObject(HGDIOBJ(hbitmap.0));
            return Err("GetObjectW failed".into());
        }

        let width = bm.bmWidth.max(1) as u32;
        let height = bm.bmHeight.abs().max(1) as u32;

        let mut bmi: BITMAPINFO = std::mem::zeroed();
        bmi.bmiHeader.biSize = std::mem::size_of::<BITMAPINFOHEADER>() as u32;
        bmi.bmiHeader.biWidth = width as i32;
        bmi.bmiHeader.biHeight = -(height as i32); // Top-down
        bmi.bmiHeader.biPlanes = 1;
        bmi.bmiHeader.biBitCount = 24;
        bmi.bmiHeader.biCompression = BI_RGB.0;

        let mut buffer = vec![0u8; (width * height * 3) as usize];
        let hdc = GetDC(None);
        let lines = GetDIBits(
            hdc,
            hbitmap,
            0,
            height,
            Some(buffer.as_mut_ptr() as *mut _),
            &mut bmi,
            DIB_RGB_COLORS,
        );
        ReleaseDC(None, hdc);
        let _ = DeleteObject(HGDIOBJ(hbitmap.0));

        if lines == 0 {
            return Err("GetDIBits failed".into());
        }

        // Convert BGR -> RGB
        for chunk in buffer.chunks_exact_mut(3) {
            chunk.swap(0, 2);
        }

        if let Some(img) = image::RgbImage::from_raw(width, height, buffer) {
            img.save(output_path)
                .map_err(|e| format!("Failed to save image: {e}"))?;
            if let Ok(meta) = std::fs::metadata(output_path) {
                if meta.len() == 6146 || meta.len() == 6479 || meta.len() == 14276 || meta.len() < 1200 {
                    let _ = std::fs::remove_file(output_path);
                    return Err("Rejected icon fallback as thumbnail".into());
                }
            }
            Ok(())
        } else {
            Err("Failed to create RgbImage".into())
        }
    };

    unsafe {
        CoUninitialize();
    }

    save_res
}

#[cfg(not(windows))]
pub fn extract_thumbnail_to_file(
    _file_path: &std::path::Path,
    _output_path: &std::path::Path,
    _max_w: u32,
    _max_h: u32,
) -> Result<(), String> {
    Err("Thumbnail extraction only supported on Windows".into())
}
