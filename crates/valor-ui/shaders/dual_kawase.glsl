// Dual Kawase Blur Pass (Downsample + Upsample)
// Reference Implementation for Valor Glass Compositor

#version 330 core

// Pass 1: Downsample
vec4 downsample(sampler2D tex, vec2 uv, vec2 halfpixel) {
    vec4 sum = texture(tex, uv) * 4.0;
    sum += texture(tex, uv - halfpixel.xy);
    sum += texture(tex, uv + halfpixel.xy);
    sum += texture(tex, uv + vec2(halfpixel.x, -halfpixel.y));
    sum += texture(tex, uv - vec2(halfpixel.x, -halfpixel.y));
    return sum / 8.0;
}

// Pass 2: Upsample
vec4 upsample(sampler2D tex, vec2 uv, vec2 halfpixel) {
    vec4 sum = vec4(0.0);
    sum += texture(tex, uv + vec2(-halfpixel.x * 2.0, 0.0));
    sum += texture(tex, uv + vec2(-halfpixel.x, halfpixel.y)) * 2.0;
    sum += texture(tex, uv + vec2(0.0, halfpixel.y * 2.0));
    sum += texture(tex, uv + vec2(halfpixel.x, halfpixel.y)) * 2.0;
    sum += texture(tex, uv + vec2(halfpixel.x * 2.0, 0.0));
    sum += texture(tex, uv + vec2(halfpixel.x, -halfpixel.y)) * 2.0;
    sum += texture(tex, uv + vec2(0.0, -halfpixel.y * 2.0));
    sum += texture(tex, uv + vec2(-halfpixel.x, -halfpixel.y)) * 2.0;
    return sum / 12.0;
}
