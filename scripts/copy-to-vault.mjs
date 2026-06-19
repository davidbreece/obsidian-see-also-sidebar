#!/usr/bin/env node
import { copyFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

// Vault plugin directory
const VAULT_PATH = '/home/dbreece/Documents/Gnosis';
const PLUGIN_DIR = join(VAULT_PATH, '.obsidian', 'plugins', 'see-also-sidebar');

// Files to copy
const FILES = ['main.js', 'manifest.json', 'styles.css'];

try {
	// Ensure plugin directory exists
	mkdirSync(PLUGIN_DIR, { recursive: true });

	// Copy files
	for (const file of FILES) {
		const src = join(projectRoot, file);
		const dest = join(PLUGIN_DIR, file);
		copyFileSync(src, dest);
		console.log(`✓ Copied ${file} to vault`);
	}

	console.log(`\n✅ Plugin files copied to: ${PLUGIN_DIR}`);
} catch (error) {
	console.error('❌ Copy failed:', error.message);
	process.exit(1);
}
