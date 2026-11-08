import fs from 'fs';
import crypto from 'crypto';
import { pathToFileURL } from 'url';
import { createRequire } from 'module';
import { runPostbuildCompat } from './postbuild-compat.mjs';

const require = createRequire(import.meta.url);

async function loadOrigAdapter() {
  const origPath = process.env.__ORIG_VERCEL_ADAPTER_PATH;
  if (!origPath) return null;
  try {
    const resolved = require.resolve(origPath);
    const mod = await import(pathToFileURL(resolved).href);
    return mod.default || mod;
  } catch (err) {
    console.warn('[next-compat-adapter] Could not load original adapter:', err.message);
    return null;
  }
}

const compatAdapter = {
  name: 'srv-compat-vercel-adapter',

  async modifyConfig(config, ctx) {
    const orig = await loadOrigAdapter();
    if (orig && typeof orig.modifyConfig === 'function') {
      return await orig.modifyConfig(config, ctx);
    }
    return config;
  },

  async onBuildComplete(ctx) {
    // 1. Transpile all .next/static JS & CSS chunks BEFORE Vercel packages them
    runPostbuildCompat();

    // 2. Refresh immutableHash on staticFiles so Vercel uploads the transpiled content
    if (ctx && ctx.outputs && Array.isArray(ctx.outputs.staticFiles)) {
      for (const item of ctx.outputs.staticFiles) {
        if (item.filePath && (item.filePath.endsWith('.js') || item.filePath.endsWith('.css'))) {
          try {
            const buf = fs.readFileSync(item.filePath);
            if (item.immutableHash) {
              item.immutableHash = crypto.createHash('sha256').update(buf).digest('hex');
            }
          } catch {
            // ignore
          }
        }
      }
    }

    // 3. Delegate to Vercel's native adapter if present
    const orig = await loadOrigAdapter();
    if (orig && typeof orig.onBuildComplete === 'function') {
      await orig.onBuildComplete(ctx);
      // 4. Ensure any copied files in /vercel/output/static/_next/static are also transpiled
      runPostbuildCompat();
    }
  },
};

export default compatAdapter;
