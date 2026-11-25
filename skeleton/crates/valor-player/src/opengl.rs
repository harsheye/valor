//! OpenGL surface handoff point for libmpv rendering.

use valor_core::Error;

#[derive(Debug, Default)]
pub struct OpenGlSurface;

impl OpenGlSurface {
    pub fn render(&mut self, _framebuffer: u32, _width: u32, _height: u32) -> Result<(), Error> {
        Err(Error::NotImplemented)
    }
}
