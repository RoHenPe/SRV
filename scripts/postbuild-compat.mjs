import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const esbuild = require('esbuild');

const POLYFILL_BANNER = `if(typeof globalThis==="undefined"){try{Object.defineProperty(Object.prototype,"__magic__",{get:function(){return this},configurable:true});__magic__.globalThis=__magic__;delete Object.prototype.__magic__}catch(e){if(typeof window!=="undefined")window.globalThis=window;else if(typeof self!=="undefined")self.globalThis=self}}if(typeof window!=="undefined"){if(!window.queueMicrotask){window.queueMicrotask=function(cb){Promise.resolve().then(cb).catch(function(e){setTimeout(function(){throw e},0)})}}if(!Object.hasOwn){Object.hasOwn=function(o,p){return Object.prototype.hasOwnProperty.call(o,p)}}if(!Array.prototype.at){Array.prototype.at=function(n){n=Math.trunc(n)||0;if(n<0)n+=this.length;return n<0||n>=this.length?undefined:this[n]}}if(!String.prototype.at){String.prototype.at=function(n){n=Math.trunc(n)||0;if(n<0)n+=this.length;return n<0||n>=this.length?undefined:this.charAt(n)}}if(!String.prototype.replaceAll){String.prototype.replaceAll=function(s,r){return s instanceof RegExp?this.replace(s,r):this.split(s).join(r)}}if(!Promise.allSettled){Promise.allSettled=function(ps){return Promise.all(Array.from(ps,function(p){return Promise.resolve(p).then(function(v){return{status:"fulfilled",value:v}},function(r){return{status:"rejected",reason:r}})}))}}}`;

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

function expandLogicalCss(css) {
  let out = css
    .replace(/@layer\s+[a-zA-Z0-9_.,\s-]+;/g, '')
    .replace(/@layer\s+[a-zA-Z0-9_-]+\s*\{/g, '@media all {')
    .replace(/100dvh/g, '100vh')
    // Unwrap Tailwind v4 @supports fallback so Chromium 53-84 (LG WebOS TV) receives --tw-border-style and --tw-space-*-reverse
    .replace(
      /@supports\s*\(\(\(-webkit-hyphens:none\)\)[^\{]+\{/g,
      '@media all {'
    )
    // Remove "--tw-leading:initial;--tw-font-weight:initial;--tw-tracking:initial;" from universal reset so var(--tw-leading, fallback) uses fallback on browsers without @property
    .replace(/--tw-leading:initial;/g, '')
    .replace(/--tw-font-weight:initial;/g, '')
    .replace(/--tw-tracking:initial;/g, '')
    // Expand logical properties for Chrome < 87 / WebOS TV / older iOS & Android
    .replace(/padding-inline:([^;\}]+)/g, 'padding-left:$1;padding-right:$1')
    .replace(/padding-block:([^;\}]+)/g, 'padding-top:$1;padding-bottom:$1')
    .replace(/padding-inline-start:([^;\}]+)/g, 'padding-left:$1')
    .replace(/padding-inline-end:([^;\}]+)/g, 'padding-right:$1')
    .replace(/margin-inline:([^;\}]+)/g, 'margin-left:$1;margin-right:$1')
    .replace(/margin-block:([^;\}]+)/g, 'margin-top:$1;margin-bottom:$1')
    .replace(/margin-inline-start:([^;\}]+)/g, 'margin-left:$1')
    .replace(/margin-inline-end:([^;\}]+)/g, 'margin-right:$1')
    .replace(/inset-inline:([^;\}]+)/g, 'left:$1;right:$1')
    .replace(/inset-block:([^;\}]+)/g, 'top:$1;bottom:$1')
    .replace(/([\{;])inset:0(px)?([;\}])/g, '$1top:0;right:0;bottom:0;left:0$3');
  return out;
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
    const finalJs = code.includes('__magic__.globalThis')
      ? result.code
      : `${POLYFILL_BANNER}\n${result.code}`;
    fs.writeFileSync(file, finalJs, 'utf8');
    jsCount++;
  } catch (err) {
    console.warn(`[postbuild-compat] Ignored JS ${path.basename(file)}: ${err.message}`);
  }
}

let cssCount = 0;
for (const file of cssFiles) {
  try {
    const code = fs.readFileSync(file, 'utf8');
    const expanded = expandLogicalCss(code);
    const result = esbuild.transformSync(expanded, {
      loader: 'css',
      target: ['chrome53', 'safari11'],
      minify: true,
    });
    // Run expandLogicalCss once more in case esbuild collapsed top/right/bottom/left back to inset
    const finalCss = expandLogicalCss(result.code);
    fs.writeFileSync(file, finalCss, 'utf8');
    cssCount++;
  } catch (err) {
    console.warn(`[postbuild-compat] Ignored CSS ${path.basename(file)}: ${err.message}`);
  }
}

console.log(`[postbuild-compat] Transpiled ${jsCount} JS chunks and ${cssCount} CSS chunks to es2016/chrome53/safari11 (Smart TV, Mobile & PC).`);
