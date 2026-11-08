import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const esbuild = require('esbuild');

function walkFiles(dir, ext, results = []) {
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkFiles(fullPath, ext, results);
    } else if (entry.name.endsWith(ext)) {
      results.push(fullPath);
    }
  }
  return results;
}

const staticDir = path.join(process.cwd(), '.next', 'static');
const jsFiles = walkFiles(staticDir, '.js');
const cssFiles = walkFiles(staticDir, '.css');

let jsCount = 0;
for (const file of jsFiles) {
  try {
    const code = fs.readFileSync(file, 'utf8');
    const result = esbuild.transformSync(code, {
      loader: 'js',
      target: 'chrome58',
      minify: true,
    });
    fs.writeFileSync(file, result.code, 'utf8');
    jsCount++;
  } catch (err) {
    console.warn(`[postbuild-compat] Ignored JS ${path.basename(file)}: ${err.message}`);
  }
}

let cssCount = 0;
for (const file of cssFiles) {
  try {
    const code = fs.readFileSync(file, 'utf8');
    const flattened = code
      .replace(/@layer\s+[a-zA-Z0-9_.,\s-]+;/g, '')
      .replace(/@layer\s+[a-zA-Z0-9_-]+\s*\{/g, '@media all {')
      .replace(/100dvh/g, '100vh');
    const result = esbuild.transformSync(flattened, {
      loader: 'css',
      target: 'chrome58',
      minify: true,
    });
    fs.writeFileSync(file, result.code, 'utf8');
    cssCount++;
  } catch (err) {
    console.warn(`[postbuild-compat] Ignored CSS ${path.basename(file)}: ${err.message}`);
  }
}

console.log(`[postbuild-compat] Transpiled ${jsCount} JS chunks and ${cssCount} CSS chunks to chrome58 (Smart TV / Mobile / PC compatible).`);
