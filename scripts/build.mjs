import { mkdir, readFile, writeFile, copyFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'dist');
const base = (process.env.URL || process.env.DEPLOY_PRIME_URL || process.env.SITE_URL || '').replace(/\/$/, '');
const htmlFiles = ['index.html', 'archive.html', 'about.html'];
const staticFiles = ['favicon.svg', 'og-image.png', '_redirects', '_headers'];

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
for (const file of htmlFiles) {
  const original = await readFile(path.join(root, file), 'utf8');
  const html = original.replaceAll('__SITE_URL__', base);
  await writeFile(path.join(out, file), html, 'utf8');
}
for (const file of staticFiles) {
  await copyFile(path.join(root, file), path.join(out, file));
}
console.log(`Built ${htmlFiles.length} HTML pages and ${staticFiles.length} static assets to dist/${base ? ` for ${base}` : ' (relative metadata; Netlify will inject its site URL during deploy)'}`);
