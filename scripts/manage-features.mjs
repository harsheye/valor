#!/usr/bin/env node

/**
 * Feature Manager CLI for Valor
 * Allows enabling, disabling, and checking the status of:
 * - Online Stream (`online`, `stream`, `onlineStream`)
 * - Local Companion Engine (`engine`, `companion`, `localEngine`)
 * - Entire Application (`app`, `all`, `maintenance`)
 *
 * Usage:
 *   node scripts/manage-features.mjs disable online
 *   node scripts/manage-features.mjs disable engine
 *   node scripts/manage-features.mjs disable app
 *   node scripts/manage-features.mjs enable online
 *   node scripts/manage-features.mjs enable all
 *   node scripts/manage-features.mjs status
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CONFIG_PATH = path.resolve(__dirname, '../src/config/features.json');

const FEATURE_ALIASES = {
  online: 'onlineStream',
  stream: 'onlineStream',
  onlinestream: 'onlineStream',
  'online-stream': 'onlineStream',

  engine: 'localEngine',
  companion: 'localEngine',
  localengine: 'localEngine',
  'local-engine': 'localEngine',

  app: 'app',
  application: 'app',
  maintenance: 'app',
  all: 'all'
};

function readFeatures() {
  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    console.error(`Error reading ${CONFIG_PATH}:`, err.message);
    process.exit(1);
  }
}

function writeFeatures(data) {
  try {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(data, null, 2) + '\n', 'utf8');
  } catch (err) {
    console.error(`Error writing ${CONFIG_PATH}:`, err.message);
    process.exit(1);
  }
}

function printStatus(features) {
  console.log('\n======================================================');
  console.log('              VALOR FEATURE STATUS MATRIX              ');
  console.log('======================================================');
  
  const items = [
    { key: 'app', label: 'Entire Application' },
    { key: 'onlineStream', label: 'Online Stream' },
    { key: 'localEngine', label: 'Local Companion Engine' }
  ];

  for (const item of items) {
    const feat = features[item.key];
    const status = feat.enabled ? '\x1b[32m[ENABLED]\x1b[0m' : '\x1b[31m[DISABLED / UNDER CONSTRUCTION]\x1b[0m';
    console.log(`  * ${item.label.padEnd(24)} : ${status}`);
    if (!feat.enabled && feat.maintenanceMessage) {
      console.log(`    Message: "${feat.maintenanceMessage}"`);
    }
  }

  console.log('======================================================\n');
}

const args = process.argv.slice(2);
const action = args[0]?.toLowerCase();
const targetInput = args[1]?.toLowerCase();

if (!action || action === 'status' || action === '--status' || action === '-s') {
  const current = readFeatures();
  printStatus(current);
  process.exit(0);
}

const targetKey = FEATURE_ALIASES[targetInput];

if (!targetKey && action !== 'help' && targetInput !== 'all') {
  console.error(`\x1b[31mError: Unknown target "${targetInput}".\x1b[0m`);
  console.log('Available targets: online, engine, app, all');
  console.log('\nExamples:');
  console.log('  node scripts/manage-features.mjs disable online');
  console.log('  node scripts/manage-features.mjs disable engine');
  console.log('  node scripts/manage-features.mjs disable app');
  console.log('  node scripts/manage-features.mjs enable all');
  console.log('  node scripts/manage-features.mjs status\n');
  process.exit(1);
}

const features = readFeatures();

if (action === 'disable' || action === 'off') {
  if (targetKey === 'all' || targetKey === 'app') {
    features.app.enabled = false;
    console.log('\x1b[33m>> DISABLED: Entire Application (Under Construction / Maintenance Page will be shown)\x1b[0m');
  } else {
    features[targetKey].enabled = false;
    console.log(`\x1b[33m>> DISABLED: ${features[targetKey].title} (Under Construction Page will be shown)\x1b[0m`);
  }
  writeFeatures(features);
  printStatus(features);
} else if (action === 'enable' || action === 'on') {
  if (targetKey === 'all') {
    features.app.enabled = true;
    features.onlineStream.enabled = true;
    features.localEngine.enabled = true;
    console.log('\x1b[32m>> ENABLED: All Features and Application Restored\x1b[0m');
  } else {
    features[targetKey].enabled = true;
    console.log(`\x1b[32m>> ENABLED: ${features[targetKey].title}\x1b[0m`);
  }
  writeFeatures(features);
  printStatus(features);
} else if (action === 'toggle') {
  if (targetKey === 'all') {
    const next = !features.app.enabled;
    features.app.enabled = next;
    features.onlineStream.enabled = next;
    features.localEngine.enabled = next;
  } else {
    features[targetKey].enabled = !features[targetKey].enabled;
  }
  writeFeatures(features);
  printStatus(features);
} else {
  console.log(`Unknown action: "${action}". Use enable, disable, toggle, or status.`);
  process.exit(1);
}
