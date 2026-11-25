# Valor App Shell Specification

This document defines the formal layout, dimensions, color tokens, typography, and states for the Valor App Shell. All UI implementations must strictly adhere to these specifications.

## 1. Surfaces & Lightness Steps

All surfaces are strictly defined with calibrated lightness ($L^*$ in HSL) guaranteeing minimum perceptual steps ($\Delta L \ge 4.0$ points):

| Surface | Hex Color | Lightness (HSL) | Step vs Previous | Purpose |
| :--- | :--- | :--- | :--- | :--- |
| `window_bg` | `#0B0D12` | 5.7% | — | Canvas background behind everything, title bar, borders |
| `nav_surface` | `#141721` | 10.4% | +4.7 points ($\ge 4.0$) | Left navigation rail surface |
| `content_surface` | `#1F2433` | 16.1% | +5.7 points ($\ge 4.0$) | Content page background, rounded 8px top-left corner |
| `divider` | `#FFFFFF1A` (10% white) | — | — | 1 physical/logical px dividers separating surfaces |

## 2. Color Palette & WCAG Contrast

All text and interactive colors satisfy WCAG AA / AAA contrast requirements against all three surfaces:

| Token | Hex / Value | Role | Content Surface Contrast | Nav Surface Contrast | WCAG Standard |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `text_primary` | `#FFFFFF` | Primary headers, body text, active labels | 12.2:1 | 14.5:1 | AAA ($\ge 7.0:1$) |
| `text_secondary` | `#94A3B8` | Muted subtitles, meta lines, summaries | 4.9:1 | 5.8:1 | AA ($\ge 4.5:1$) |
| `text_tertiary` | `#64748B` | Subtle captions, inactive icons, shortcuts | 3.2:1 | 3.8:1 | AA Large / Non-text ($\ge 3.0:1$) |
| `accent` | `#3B82F6` | Active selections, pills, focus rings | 4.6:1 | 5.5:1 | AA ($\ge 3.0:1$ non-text) |
| `accent_hover` | `#60A5FA` | Hover state for accent buttons | — | — | — |
| `selected_fill` | `#2D374880` | Selected nav row / tree item background | — | — | Subtle highlight |
| `hover_fill` | `#FFFFFF0F` | 6% white hover fill on interactive rows | — | — | Standard hover |
| `close_hover` | `#C42B1C` | Window close button hover background | — | — | Windows standard red |
| `warning` | `#F59E0B` | Missing folder warning badge | — | — | Amber warning |

## 3. Spacing Scale

Strictly restricted to powers-of-two / standard steps: `[4, 8, 12, 16, 24, 32]` logical pixels. No arbitrary values permitted.

- **Content Padding**: 32px Left & Right, 24px Top
- **Section Gaps**: 24px vertical separation
- **Toolbar Gap**: 8px between buttons
- **Nav Margins**: 8px horizontal margin per row, 4px vertical item gap
- **Tree Indentation**: 16px per nested level

## 4. Typography Scale

Strictly restricted to $\ge 12$ logical pixels:

| Token | Size (px) | Weight | Use Case |
| :--- | :--- | :--- | :--- |
| `PAGE_TITLE` | 28.0 | Display / Semibold | Content page title ("Home", "Library", "Gallery") |
| `DATE_HEADING` | 16.0 | Semibold | Chronological date groups |
| `BODY` | 14.0 | Regular | Main text, buttons, drop zone description |
| `NAV_ITEM` | 14.0 | Medium | Left navigation labels, "This PC" header |
| `TITLEBAR_APP_NAME` | 14.0 | Semibold | Window title text ("Valor") |
| `SUMMARY_TEXT` | 14.0 | Regular | Muted summary line under page title |
| `SECONDARY` | 12.0 | Regular | Metadata, durations, file sizes |
| `SECTION_LABEL` | 12.0 | Semibold Uppercase | Section dividers, header labels |

## 5. Element Dimensions & Layout Specifications

| Element | Width (px) | Height (px) | Corner Radius (px) | Description / State |
| :--- | :--- | :--- | :--- | :--- |
| **Title Bar** | 100% | 40.0 | 0.0 | Borderless chrome, background `window_bg` |
| Title Bar Left Pad | 12.0 | — | — | Distance from window left to app icon |
| App Icon | 16.0 | 16.0 | — | Valor flame / mark icon |
| App Title | Auto | — | — | "Valor" 14px Semibold |
| Search Box | 40% (280-640) | 32.0 | 6.0 | Center aligned, `/` focus, `Esc` clear, non-drag |
| Settings Button | 32.0 | 32.0 | 6.0 | Titlebar gear icon, hover fill |
| Minimize Button | 46.0 | 40.0 | 0.0 | Titlebar window control |
| Maximize Button | 46.0 | 40.0 | 0.0 | Titlebar window control |
| Close Button | 46.0 | 40.0 | 0.0 | Titlebar close (X); hover background `#C42B1C` |
| **Left Nav** | 280 (220-420) | Full - 40.0 | 0.0 | Surface `nav_surface`, resizable drag handle |
| Left Nav Collapsed | 48.0 | Full - 40.0 | 0.0 | Hamburger collapse mode with tooltips |
| Hamburger Button | 32.0 | 32.0 | 6.0 | Top-left in nav, 8px margins |
| Nav Rows | Full - 16.0 | 40.0 | 6.0 | 20px icon + 12px gap + 14px label; 3x16px accent pill on left |
| "This PC" Header | Full - 16.0 | 40.0 | 6.0 | 20px computer icon, label, chevron, + 32px folder-plus button |
| Tree Child Row | Full - 16.0 | 36.0 | 6.0 | 16px indent / level, 20px folder icon, ellipsis name |
| Empty Tree Row | Full - 16.0 | 40.0 | 6.0 | "No folders added" with inline "Add a folder" button |
| Pinned Nav Bottom | Full - 16.0 | 40.0 each | 6.0 | "Theme" and "Settings" rows |
| **Content Surface** | Remaining | Full - 40.0 | 8.0 top-left | Surface `content_surface`, sits on `window_bg` |
| Content Header Title | Auto | 32.0 | — | 24px icon + 12px gap + 28px page title |
| Content Toolbar | Auto | 32.0 | — | Right-aligned: `[Select]`, `[Sort v]`, `[Filter v]`, `[View v]`, `[...]` |
| Toolbar Button | Auto / 32.0 | 32.0 | 6.0 | 8px padding, 8px gap between buttons |
| Popup Menus | Auto (min 180) | Auto | 8.0 | Surface `window_bg` / card, 8px pad, 32px rows, Esc closes |
| **Home Minimal** | Full | Auto | — | Top primary "Open file" + drop hint; Continue Watching or empty prompt |
| Window Minimum | 960.0 | 600.0 | — | Minimum supported window size |
