use libmpv2_sys::mpv_handle;
use std::ffi::{c_char, c_int, c_void};
use std::sync::Arc;
use thiserror::Error;
use tracing::{error, info};

#[derive(Error, Debug)]
pub enum RenderError {
    #[error("Failed to create mpv render context: code {0}")]
    CreateFailed(i32),
    #[error("Render failed: code {0}")]
    RenderFailed(i32),
}

#[repr(C)]
pub struct mpv_render_context {
    _unused: [u8; 0],
}

#[repr(C)]
pub struct mpv_render_param {
    pub param_type: c_int,
    pub data: *mut c_void,
}

pub const MPV_RENDER_PARAM_INVALID: c_int = 0;
pub const MPV_RENDER_PARAM_API_TYPE: c_int = 1;
pub const MPV_RENDER_PARAM_OPENGL_INIT_PARAMS: c_int = 2;
pub const MPV_RENDER_PARAM_OPENGL_FBO: c_int = 3;
pub const MPV_RENDER_PARAM_FLIP_Y: c_int = 4;
pub const MPV_RENDER_PARAM_ADVANCED_CONTROL: c_int = 10;

pub const MPV_RENDER_API_TYPE_OPENGL: &[u8] = b"opengl\0";
pub const MPV_RENDER_UPDATE_FRAME: u64 = 1 << 0;

#[repr(C)]
pub struct mpv_opengl_init_params {
    pub get_proc_address:
        Option<unsafe extern "C" fn(ctx: *mut c_void, name: *const c_char) -> *mut c_void>,
    pub get_proc_address_ctx: *mut c_void,
}

#[repr(C)]
pub struct mpv_opengl_fbo {
    pub fbo: c_int,
    pub w: c_int,
    pub h: c_int,
    pub internal_format: c_int,
}

extern "C" {
    pub fn mpv_render_context_create(
        res: *mut *mut mpv_render_context,
        mpv: *mut mpv_handle,
        params: *mut mpv_render_param,
    ) -> c_int;

    pub fn mpv_render_context_set_update_callback(
        ctx: *mut mpv_render_context,
        callback: Option<unsafe extern "C" fn(cb_ctx: *mut c_void)>,
        callback_ctx: *mut c_void,
    );

    pub fn mpv_render_context_update(ctx: *mut mpv_render_context) -> u64;

    pub fn mpv_render_context_render(
        ctx: *mut mpv_render_context,
        params: *mut mpv_render_param,
    ) -> c_int;

    pub fn mpv_render_context_report_swap(ctx: *mut mpv_render_context);

    pub fn mpv_render_context_free(ctx: *mut mpv_render_context);
}

#[derive(Debug, Clone, Copy)]
pub struct GpuFrameStats {
    pub last_frame_time_ms: f64,
    pub avg_frame_time_ms: f64,
    pub frame_budget_ms: f64, // e.g. 16.66 ms for 60Hz
    pub is_over_budget: bool,
    pub over_budget_frames: u32,
    pub auto_downgrade_triggered: bool,
}

impl Default for GpuFrameStats {
    fn default() -> Self {
        Self {
            last_frame_time_ms: 0.0,
            avg_frame_time_ms: 0.0,
            frame_budget_ms: 16.66,
            is_over_budget: false,
            over_budget_frames: 0,
            auto_downgrade_triggered: false,
        }
    }
}

pub struct RenderGlContext {
    ctx: *mut mpv_render_context,
    pub stats: Arc<parking_lot::Mutex<GpuFrameStats>>,
}

unsafe impl Send for RenderGlContext {}
unsafe impl Sync for RenderGlContext {}

impl RenderGlContext {
    #[allow(clippy::not_unsafe_ptr_arg_deref)]
    pub fn new(
        mpv: *mut mpv_handle,
        get_proc_address: unsafe extern "C" fn(
            ctx: *mut c_void,
            name: *const c_char,
        ) -> *mut c_void,
        proc_ctx: *mut c_void,
    ) -> Result<Self, RenderError> {
        let mut init_params = mpv_opengl_init_params {
            get_proc_address: Some(get_proc_address),
            get_proc_address_ctx: proc_ctx,
        };

        let mut advanced_control: c_int = 1;

        let mut params = [
            mpv_render_param {
                param_type: MPV_RENDER_PARAM_API_TYPE,
                data: MPV_RENDER_API_TYPE_OPENGL.as_ptr() as *mut c_void,
            },
            mpv_render_param {
                param_type: MPV_RENDER_PARAM_OPENGL_INIT_PARAMS,
                data: &mut init_params as *mut _ as *mut c_void,
            },
            mpv_render_param {
                param_type: MPV_RENDER_PARAM_ADVANCED_CONTROL,
                data: &mut advanced_control as *mut _ as *mut c_void,
            },
            mpv_render_param {
                param_type: MPV_RENDER_PARAM_INVALID,
                data: std::ptr::null_mut(),
            },
        ];

        let mut ctx: *mut mpv_render_context = std::ptr::null_mut();
        let ret = unsafe { mpv_render_context_create(&mut ctx, mpv, params.as_mut_ptr()) };
        if ret < 0 || ctx.is_null() {
            error!("mpv_render_context_create returned error: {}", ret);
            return Err(RenderError::CreateFailed(ret));
        }

        info!("Successfully created mpv OpenGL render context: {:p}", ctx);
        Ok(Self {
            ctx,
            stats: Arc::new(parking_lot::Mutex::new(GpuFrameStats::default())),
        })
    }

    #[allow(clippy::not_unsafe_ptr_arg_deref)]
    pub fn set_update_callback(
        &self,
        callback: Option<unsafe extern "C" fn(cb_ctx: *mut c_void)>,
        callback_ctx: *mut c_void,
    ) {
        unsafe {
            mpv_render_context_set_update_callback(self.ctx, callback, callback_ctx);
        }
    }

    pub fn update(&self) -> u64 {
        unsafe { mpv_render_context_update(self.ctx) }
    }

    pub fn render(
        &self,
        fbo: i32,
        width: i32,
        height: i32,
        flip_y: bool,
    ) -> Result<(), RenderError> {
        let t_start = std::time::Instant::now();
        let mut gl_fbo = mpv_opengl_fbo {
            fbo,
            w: width,
            h: height,
            internal_format: 0,
        };

        let mut flip_val: c_int = if flip_y { 1 } else { 0 };

        let mut params = [
            mpv_render_param {
                param_type: MPV_RENDER_PARAM_OPENGL_FBO,
                data: &mut gl_fbo as *mut _ as *mut c_void,
            },
            mpv_render_param {
                param_type: MPV_RENDER_PARAM_FLIP_Y,
                data: &mut flip_val as *mut _ as *mut c_void,
            },
            mpv_render_param {
                param_type: MPV_RENDER_PARAM_INVALID,
                data: std::ptr::null_mut(),
            },
        ];

        let ret = unsafe { mpv_render_context_render(self.ctx, params.as_mut_ptr()) };
        let elapsed_ms = t_start.elapsed().as_secs_f64() * 1000.0;

        // Update GPU frame stats and budget monitoring
        {
            let mut s = self.stats.lock();
            s.last_frame_time_ms = elapsed_ms;
            s.avg_frame_time_ms = if s.avg_frame_time_ms == 0.0 {
                elapsed_ms
            } else {
                s.avg_frame_time_ms * 0.95 + elapsed_ms * 0.05
            };
            s.is_over_budget = elapsed_ms > s.frame_budget_ms;
            if s.is_over_budget {
                s.over_budget_frames += 1;
                if s.over_budget_frames > 60 {
                    s.auto_downgrade_triggered = true;
                }
            } else {
                s.over_budget_frames = s.over_budget_frames.saturating_sub(1);
            }
        }

        if ret < 0 {
            return Err(RenderError::RenderFailed(ret));
        }
        Ok(())
    }

    pub fn report_swap(&self) {
        unsafe {
            mpv_render_context_report_swap(self.ctx);
        }
    }
}

impl Drop for RenderGlContext {
    fn drop(&mut self) {
        if !self.ctx.is_null() {
            unsafe {
                mpv_render_context_free(self.ctx);
            }
            self.ctx = std::ptr::null_mut();
        }
    }
}
