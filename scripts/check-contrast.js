#!/usr/bin/env node

/**
 * Dependency-free WCAG Contrast Ratio Checker
 * Reads and verifies token pairs for every Valor theme:
 * - text-1, text-2, text-3, accent, status colours on bg and every surface
 * - on-accent on accent-fill
 * - control-border on bg and surface-1
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function hexToRgb(hex) {
  let c = hex.replace('#', '').trim();
  if (c.length === 3) c = c.split('').map(x => x + x).join('');
  const num = parseInt(c, 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

function luminance(r, g, b) {
  const a = [r, g, b].map(v => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return a[0] * 0.2126 + a[1] * 0.7152 + a[2] * 0.0722;
}

function contrastRatio(hex1, hex2) {
  const [r1, g1, b1] = hexToRgb(hex1);
  const [r2, g2, b2] = hexToRgb(hex2);
  const l1 = luminance(r1, g1, b1);
  const l2 = luminance(r2, g2, b2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

// Parse themes directly from _semantic.css to ensure single source of truth
function parseThemesFromCss() {
  const cssPath = path.resolve(__dirname, '../src/styles/01-tokens/_semantic.css');
  const content = fs.readFileSync(cssPath, 'utf8');

  // Match each theme block: [data-theme="..."] { ... }
  const themeRegex = /\[data-theme=["']([^"']+)["']\][^{]*\{([^}]+)\}/g;
  const themes = {};
  let match;

  while ((match = themeRegex.exec(content)) !== null) {
    const themeName = match[1];
    // skip legacy aliases if already captured
    if (['dark', 'dim', 'cyberpunk', 'abyss', 'aqua', 'teal', 'light', 'garden', 'valentine', 'black', 'black-and-white', 'oled'].includes(themeName)) {
      continue;
    }
    const block = match[2];
    const tokenRegex = /--([a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{3,8})/g;
    const tokens = {};
    let propMatch;
    while ((propMatch = tokenRegex.exec(block)) !== null) {
      tokens[propMatch[1]] = propMatch[2];
    }
    if (tokens['bg'] && tokens['text-1']) {
      themes[themeName] = tokens;
    }
  }

  return themes;
}

function runAudit() {
  const themes = parseThemesFromCss();
  const themeNames = Object.keys(themes);

  if (themeNames.length === 0) {
    console.error('Error: No token themes found in _semantic.css!');
    process.exit(1);
  }

  console.log('Validating contrast ratios for ' + themeNames.length + ' themes: ' + themeNames.join(', '));
  console.log('='.repeat(70));

  let totalChecks = 0;
  let totalFailures = 0;

  for (const name of themeNames) {
    const t = themes[name];
    const surfaces = [
      { name: 'bg', val: t['bg'] },
      { name: 'surface-1', val: t['surface-1'] },
      { name: 'surface-2', val: t['surface-2'] },
      { name: 'surface-3', val: t['surface-3'] }
    ];

    let themeFails = 0;

    // 1. on-accent on accent-fill (Target >= 4.5:1)
    if (t['on-accent'] && t['accent-fill']) {
      totalChecks++;
      const cr = contrastRatio(t['on-accent'], t['accent-fill']);
      if (cr < 4.5) {
        console.error('  [' + name + '] FAIL: on-accent on accent-fill = ' + cr.toFixed(2) + ':1 (target >= 4.5:1)');
        themeFails++;
      }
    }

    // 2. control-border on bg and surface-1 (Target >= 3.0:1)
    if (t['control-border']) {
      totalChecks++;
      const crBg = contrastRatio(t['control-border'], t['bg']);
      if (crBg < 3.0) {
        console.error('  [' + name + '] FAIL: control-border on bg = ' + crBg.toFixed(2) + ':1 (target >= 3.0:1)');
        themeFails++;
      }
      totalChecks++;
      const crS1 = contrastRatio(t['control-border'], t['surface-1']);
      if (crS1 < 3.0) {
        console.error('  [' + name + '] FAIL: control-border on surface-1 = ' + crS1.toFixed(2) + ':1 (target >= 3.0:1)');
        themeFails++;
      }
    }

    // 3. text & status colours on bg and all surfaces
    const textColorChecks = [
      { key: 'text-1', min: 10.5, label: 'primary text' },
      { key: 'text-2', min: 5.5, label: 'secondary text' },
      { key: 'text-3', min: 4.5, label: 'hint text' },
      { key: 'accent', min: 4.5, label: 'accent' },
      { key: 'success', min: 4.5, label: 'success' },
      { key: 'warning', min: 4.5, label: 'warning' },
      { key: 'danger', min: 4.5, label: 'danger' }
    ];

    for (const surface of surfaces) {
      if (!surface.val) continue;
      for (const item of textColorChecks) {
        const hex = t[item.key];
        if (!hex) continue;
        totalChecks++;
        const cr = contrastRatio(hex, surface.val);
        if (cr < item.min) {
          console.error('  [' + name + '] FAIL: ' + item.key + ' (' + hex + ') on ' + surface.name + ' (' + surface.val + ') = ' + cr.toFixed(2) + ':1 (target >= ' + item.min + ':1)');
          themeFails++;
        }
      }
    }

    if (themeFails === 0) {
      console.log('  [PASS] ' + name.padEnd(16) + ' - All contrast targets satisfied');
    } else {
      totalFailures += themeFails;
    }
  }

  console.log('='.repeat(70));
  console.log('Total checks executed: ' + totalChecks);

  if (totalFailures > 0) {
    console.error('FAILED: ' + totalFailures + ' contrast checks did not meet threshold.');
    process.exit(1);
  } else {
    console.log('SUCCESS: All token combinations pass contrast requirements.');
  }
}

runAudit();
