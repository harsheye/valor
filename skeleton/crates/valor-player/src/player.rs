//! Public player ownership boundary around libmpv.

use std::path::Path;
use valor_core::Error;

pub use libmpv2::Mpv;

#[derive(Debug, Default)]
pub struct Player;

impl Player {
    pub fn new() -> Result<Self, Error> {
        Err(Error::NotImplemented)
    }

    pub fn open(&mut self, _path: &Path) -> Result<(), Error> {
        Err(Error::NotImplemented)
    }
}
