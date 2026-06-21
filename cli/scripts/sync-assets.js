#!/usr/bin/env node
/**
 * Syncs src/ui-ux-pro-max/{data,scripts,templates} → cli/assets/
 * Run before packaging: npm run sync-assets
 */
import { cpSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const src = join(root, 'src', 'ui-ux-pro-max');
const dest = join(root, 'cli', 'assets');

if (!existsSync(src)) {
  console.error(`Source not found: ${src}`);
  process.exit(1);
}

for (const dir of ['data', 'scripts', 'templates']) {
  cpSync(join(src, dir), join(dest, dir), { recursive: true, force: true });
  console.log(`✓ synced ${dir}`);
}

console.log('\nAssets synced successfully.');
