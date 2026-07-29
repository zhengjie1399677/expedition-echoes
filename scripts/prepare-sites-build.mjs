import { copyFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const targetDir = resolve(projectRoot, 'dist/server');

await mkdir(targetDir, { recursive: true });
await copyFile(resolve(projectRoot, 'sites-worker.js'), resolve(targetDir, 'index.js'));
