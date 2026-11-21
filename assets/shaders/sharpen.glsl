// MIT License
// Copyright (c) 2026 Valor Media Player Authors
//
// Simple, high-performance unsharp mask / detail enhancement shader.
// Computes discrete 3x3 Laplacian edge magnitude and blends with center sample.

//!HOOK MAIN
//!BIND HOOKED
//!DESC Adaptive Detail Unsharp Masking

vec4 hook() {
    vec2 tex_coord = HOOKED_pos;
    vec2 px = HOOKED_pt;

    vec4 center = HOOKED_tex(tex_coord);
    vec4 top    = HOOKED_tex(tex_coord + vec2(0.0, -px.y));
    vec4 bottom = HOOKED_tex(tex_coord + vec2(0.0,  px.y));
    vec4 left   = HOOKED_tex(tex_coord + vec2(-px.x, 0.0));
    vec4 right  = HOOKED_tex(tex_coord + vec2( px.x, 0.0));

    // Discrete 4-neighbor Laplacian edge mask
    vec4 laplacian = (4.0 * center) - (top + bottom + left + right);

    // Apply mild edge boost (sharpening strength: 0.25)
    vec4 sharpened = center + 0.25 * laplacian;

    return clamp(sharpened, 0.0, 1.0);
}
