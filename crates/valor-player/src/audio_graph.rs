//! Composes the ordered mpv audio filter chain and boost safety limiter.

/// Returns the boost gain and optional filter chain for a supported tier.
pub fn boost_chain(tier: u8) -> Option<(f64, String)> {
    match tier {
        100 => None,
        150 => Some((
            3.0,
            "lavfi=[volume=3.0],lavfi=[alimiter=limit=0.891:attack=5:release=50:level=disabled]"
                .to_owned(),
        )),
        200 => Some((
            4.0,
            "lavfi=[volume=4.0],lavfi=[alimiter=limit=0.891:attack=5:release=50:level=disabled]"
                .to_owned(),
        )),
        _ => None,
    }
}
