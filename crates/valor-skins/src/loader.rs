use crate::tokens::SkinTokens;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SkinManifest {
    pub id: String,
    pub name: String,
    pub version: String,
    pub author: String,
    pub license: String,
    pub min_app_version: String,
    pub variant: String,
}

pub struct SkinPackage {
    pub manifest: SkinManifest,
    pub tokens: SkinTokens,
    pub css_raw: String,
}
