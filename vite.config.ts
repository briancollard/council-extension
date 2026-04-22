import { defineConfig } from 'vite';
import { crx } from '@crxjs/vite-plugin';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from 'fs';
import { resolve, join } from 'path';
import manifest from './src/manifest';

/**
 * Copy raw CSS that CRXJS doesn't handle.
 */
function copyContentCss() {
  return {
    name: 'copy-content-css',
    closeBundle() {
      const outDir = resolve(__dirname, 'dist');
      mkdirSync(resolve(outDir, 'src/styles'), { recursive: true });
      copyFileSync(resolve(__dirname, 'src/styles/global.css'), resolve(outDir, 'src/styles/global.css'));
    },
  };
}

/**
 * CRXJS generates loader stubs that use dynamic import() via chrome.runtime.getURL().
 * This breaks chrome.storage / chrome.runtime.sendMessage in the isolated world
 * (known issue: https://github.com/crxjs/chrome-extension-tools/issues/864).
 *
 * This plugin inlines all imported chunks into each loader so no dynamic import()
 * is needed. The loader becomes a self-contained IIFE with all dependencies.
 */
function fixCrxjsLoaders() {
  return {
    name: 'fix-crxjs-loaders',
    closeBundle() {
      const outDir = resolve(__dirname, 'dist');
      const assetsDir = join(outDir, 'assets');
      const manifestPath = join(outDir, 'manifest.json');
      const manifestJson = JSON.parse(readFileSync(manifestPath, 'utf-8'));

      const loaderFiles = readdirSync(assetsDir).filter((f) => f.includes('-loader-') && f.endsWith('.js'));

      for (const loaderFile of loaderFiles) {
        const loaderPath = join(assetsDir, loaderFile);
        const loaderContent = readFileSync(loaderPath, 'utf-8');

        // Skip MAIN world loaders (fetch-interceptor) — they don't need Chrome APIs
        const isMainWorld = (manifestJson.content_scripts || []).some(
          (cs: any) => cs.world === 'MAIN' && cs.js?.includes(`assets/${loaderFile}`),
        );
        if (isMainWorld) continue;

        // Extract the chunk filename from: chrome.runtime.getURL("assets/XXXX.js")
        const match = loaderContent.match(/chrome\.runtime\.getURL\("assets\/([^"]+)"\)/);
        if (!match) continue;
        const chunkFile = match[1];

        // Recursively collect all ES module imports (dependencies first)
        const collected = new Map<string, string>();
        const visiting = new Set<string>();
        function collectDeps(filename: string) {
          if (collected.has(filename) || visiting.has(filename)) return;
          visiting.add(filename);
          const filePath = join(assetsDir, filename);
          let content: string;
          try {
            content = readFileSync(filePath, 'utf-8');
          } catch {
            return;
          }
          // Process dependencies FIRST so they appear before this module
          const importRe = /from\s*"\.\/([^"]+\.js)"/g;
          let m;
          while ((m = importRe.exec(content)) !== null) {
            collectDeps(m[1]);
          }
          collected.set(filename, content);
        }
        collectDeps(chunkFile);

        // Build a single IIFE that evaluates all deps then the main chunk.
        let iife = '(function(){\n"use strict";\n';

        // Step 1: Parse export maps for each module.
        // Maps exportName → localVarName (e.g. "A" → "a" from `export{a as A}`).
        const exportMaps = new Map<string, Map<string, string>>();
        for (const [filename, code] of collected) {
          const eMap = new Map<string, string>();
          // Named re-exports: export{a as A, e as I}
          const namedExportRe = /export\{([^}]*)\}/g;
          let em;
          while ((em = namedExportRe.exec(code)) !== null) {
            for (const pair of em[1].split(',')) {
              const parts = pair.trim().split(/\s+as\s+/);
              if (parts.length === 2) {
                eMap.set(parts[1].trim(), parts[0].trim());
              } else if (parts[0]) {
                eMap.set(parts[0].trim(), parts[0].trim());
              }
            }
          }
          // export const foo / export function foo / export let foo
          const declRe = /export\s+(?:const|let|function)\s+(\w+)/g;
          let dm;
          while ((dm = declRe.exec(code)) !== null) {
            eMap.set(dm[1], dm[1]);
          }
          exportMaps.set(filename, eMap);
        }

        // Step 2: Process each module — strip imports/exports, emit alias bindings.
        for (const [filename, code] of collected) {
          let stripped = code;

          // Collect alias assignments for imports from sibling modules.
          // import{A as nt}from"./api-endpoints-X.js"  →  const nt = a;
          // (because api-endpoints exports {a as A}, so A→a, and nt is alias for A)
          const aliases: string[] = [];
          const importRe = /import\{([^}]*)\}\s*from\s*"\.\/([^"]+\.js)"\s*;?\s*/g;
          let im;
          while ((im = importRe.exec(code)) !== null) {
            const sourceFile = im[2];
            const eMap = exportMaps.get(sourceFile);
            if (!eMap) continue;
            for (const pair of im[1].split(',')) {
              const parts = pair.trim().split(/\s+as\s+/);
              const importedName = parts[0].trim(); // A
              const localName = (parts[1] || parts[0]).trim(); // nt
              const actualVar = eMap.get(importedName); // a
              if (actualVar && actualVar !== localName) {
                aliases.push(`const ${localName}=${actualVar};`);
              } else if (actualVar && actualVar === localName) {
                // Same name, no alias needed — variable already in scope.
              }
            }
          }

          // Remove import statements
          stripped = stripped.replace(/import\{[^}]*\}\s*from\s*"[^"]*"\s*;?\s*/g, '');
          stripped = stripped.replace(/import\s+"[^"]*"\s*;?\s*/g, '');
          // Remove export statements but keep the declarations
          stripped = stripped.replace(/export\{[^}]*\}\s*;?\s*/g, '');
          stripped = stripped.replace(/export function /g, 'function ');
          stripped = stripped.replace(/export const /g, 'const ');
          stripped = stripped.replace(/export let /g, 'let ');
          stripped = stripped.replace(/export default /g, 'const __default = ');

          // Emit alias assignments BEFORE the module code that uses them
          if (aliases.length > 0) {
            iife += aliases.join('\n') + '\n';
          }
          iife += stripped + '\n';
        }

        // Call onExecute if it exists (CRXJS convention)
        iife += 'if(typeof onExecute==="function")onExecute({perf:{injectTime:performance.now(),loadTime:0}});\n';
        iife += '})();\n';

        writeFileSync(loaderPath, iife);
      }

      // Ensure web_accessible_resources includes all asset JS files
      const allAssetJs = readdirSync(assetsDir).filter((f) => f.endsWith('.js'));
      for (const war of manifestJson.web_accessible_resources || []) {
        for (const jsFile of allAssetJs) {
          const path = `assets/${jsFile}`;
          if (!war.resources.includes(path)) war.resources.push(path);
        }
      }
      writeFileSync(manifestPath, JSON.stringify(manifestJson, null, 2));
    },
  };
}

export default defineConfig({
  plugins: [crx({ manifest }), copyContentCss(), fixCrxjsLoaders()],
  esbuild: {
    // Force non-ASCII characters to \u escape sequences.
    // KaTeX contains literal U+FFFF (Unicode noncharacter) in regex patterns,
    // which Chrome rejects in content scripts with "not UTF-8 encoded" error.
    charset: 'ascii',
  },
  build: {
    outDir: 'dist',
    target: 'esnext',
    sourcemap: process.env.NODE_ENV === 'development' ? 'inline' : false,
    minify: process.env.NODE_ENV === 'production',
  },
});
