#!/usr/bin/env node

/**
 * Production Build Script with Service Control for Valor
 *
 * Usage:
 *   node scripts/build.mjs [options]
 *   npm run build -- [options]
 *
 * Options:
 *   --disable-online, --no-online, --offline  Build with Online Stream disabled
 *   --disable-engine, --no-engine             Build with Local Companion Engine disabled
 *   --disable-app, --no-app, --maintenance    Build with Entire Application disabled (Under Construction)
 *   --disable=<services>                      Comma-separated list (e.g. --disable=online,engine)
 *   --skip-tsc                                Skip TypeScript typecheck step
 *   --help, -h                                Show this help message
 *
 * Environment Variables:
 *   DISABLE_ONLINE=true
 *   DISABLE_ENGINE=true
 *   DISABLE_APP=true
 *   DISABLE_SERVICES=online,engine
 */

import { spawnSync } from 'node:child_process';
import process from 'node:process';

const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  console.log(`
Valor Build CLI with Service Control
Usage:
  npm run build -- [options]
  node scripts/build.mjs [options]

Options:
  --disable-online, --no-online, --offline  Build with Online Stream disabled
  --disable-engine, --no-engine             Build with Local Companion Engine disabled
  --disable-app, --no-app, --maintenance    Build with Entire Application disabled (Under Construction)
  --disable=<services>                      Comma-separated list (e.g. --disable=online,engine)
  --skip-tsc                                Skip TypeScript typecheck step
  --help, -h                                Show this help message

Environment Variables:
  DISABLE_ONLINE=true
  DISABLE_ENGINE=true
  DISABLE_APP=true
  DISABLE_SERVICES=online,engine
`);
  process.exit(0);
}

const hasArg = (flag) => args.some(a => a.toLowerCase() === flag);
const getArgVal = (name) => {
  const match = args.find(a => a.toLowerCase().startsWith(`--${name}=`));
  return match ? match.split('=')[1] : null;
};

const disableListArg = getArgVal('disable') || process.env.DISABLE_SERVICES || process.env.DISABLE || '';
const disabledItems = disableListArg.toLowerCase().split(',').map(s => s.trim()).filter(Boolean);

const disableOnline =
  hasArg('--disable-online') ||
  hasArg('--no-online') ||
  hasArg('--offline') ||
  disabledItems.includes('online') ||
  disabledItems.includes('stream') ||
  process.env.DISABLE_ONLINE === 'true' ||
  process.env.DISABLE_ONLINE === '1' ||
  process.env.VITE_DISABLE_ONLINE === 'true';

const disableEngine =
  hasArg('--disable-engine') ||
  hasArg('--no-engine') ||
  disabledItems.includes('engine') ||
  disabledItems.includes('companion') ||
  process.env.DISABLE_ENGINE === 'true' ||
  process.env.DISABLE_ENGINE === '1' ||
  process.env.VITE_DISABLE_ENGINE === 'true';

const disableApp =
  hasArg('--disable-app') ||
  hasArg('--no-app') ||
  hasArg('--maintenance') ||
  disabledItems.includes('app') ||
  disabledItems.includes('all') ||
  process.env.DISABLE_APP === 'true' ||
  process.env.DISABLE_APP === '1' ||
  process.env.VITE_DISABLE_APP === 'true';

// Filter out custom flags before passing to vite build
const viteArgs = args.filter(a =>
  !a.startsWith('--disable') &&
  !a.startsWith('--no-') &&
  a !== '--offline' &&
  a !== '--maintenance' &&
  a !== '--skip-tsc'
);

console.log('\n======================================================');
console.log('              VALOR PRODUCTION BUILD RUNNER           ');
console.log('======================================================');
console.log('Service configuration for this build:');
console.log(`  * Application Status : ${disableApp ? '\x1b[31m[DISABLED / UNDER CONSTRUCTION]\x1b[0m' : '\x1b[32m[ENABLED]\x1b[0m'}`);
console.log(`  * Online Stream      : ${disableOnline ? '\x1b[31m[DISABLED / UNDER CONSTRUCTION]\x1b[0m' : '\x1b[32m[ENABLED]\x1b[0m'}`);
console.log(`  * Local Engine       : ${disableEngine ? '\x1b[31m[DISABLED / UNDER CONSTRUCTION]\x1b[0m' : '\x1b[32m[ENABLED]\x1b[0m'}`);
console.log('======================================================\n');

// 1. Run tsc -b unless --skip-tsc is specified
if (!args.includes('--skip-tsc')) {
  console.log('>> Running TypeScript compilation check (tsc -b)...');
  const isWindows = process.platform === 'win32';
  const tscCmd = isWindows ? 'cmd' : 'npx';
  const tscArgs = isWindows ? ['/c', 'npx', 'tsc', '-b'] : ['tsc', '-b'];
  const tscResult = spawnSync(tscCmd, tscArgs, {
    stdio: 'inherit',
    env: process.env
  });
  if (tscResult.status !== 0) {
    console.error('\x1b[31mTypeScript compilation failed. Fix errors above before building.\x1b[0m');
    process.exit(tscResult.status || 1);
  }
}

// 2. Run vite build with injected environment variables
console.log('>> Running Vite production bundle...');
const buildEnv = {
  ...process.env,
  VITE_DISABLE_ONLINE: disableOnline ? 'true' : 'false',
  VITE_DISABLE_ENGINE: disableEngine ? 'true' : 'false',
  VITE_DISABLE_APP: disableApp ? 'true' : 'false',
  DISABLE_ONLINE: disableOnline ? 'true' : 'false',
  DISABLE_ENGINE: disableEngine ? 'true' : 'false',
  DISABLE_APP: disableApp ? 'true' : 'false'
};

const isWindows = process.platform === 'win32';
const viteCmd = isWindows ? 'cmd' : 'npx';
const fullViteArgs = isWindows ? ['/c', 'npx', 'vite', 'build', ...viteArgs] : ['vite', 'build', ...viteArgs];

const viteResult = spawnSync(viteCmd, fullViteArgs, {
  stdio: 'inherit',
  env: buildEnv
});

if (viteResult.status !== 0) {
  process.exit(viteResult.status || 1);
}

console.log('\n\x1b[32m✓ Build completed successfully!\x1b[0m');
if (disableOnline || disableEngine || disableApp) {
  console.log('\x1b[33mNote: Disabled services are pre-compiled into this build and will render Under Construction notices.\x1b[0m\n');
}
