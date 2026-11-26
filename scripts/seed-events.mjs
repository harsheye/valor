#!/usr/bin/env node
import { generateDemoEventBatch } from '../server/realtime/seedDemoEvents.js';
import { globalEventBus } from '../server/realtime/eventBus.js';

console.log('⚡ Valor Real-Time Event Portal - Demo Seed Generator');
console.log('====================================================');

const count = parseInt(process.argv[2] || '25', 10);
console.log(`Generating ${count} realistic events across traffic, playback, geo, and alerts...`);

const generated = generateDemoEventBatch(count);

console.log(`✓ Successfully generated and emitted ${generated.length} events into the event bus.`);
console.log(`Current ring buffer size: ${globalEventBus.ringBuffer.length} events.`);

if (generated.length > 0) {
  console.log('\nSample emitted event:');
  console.log(JSON.stringify(generated[0], null, 2));
}

console.log('\nDone.');
process.exit(0);
