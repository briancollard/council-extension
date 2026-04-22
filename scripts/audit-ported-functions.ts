#!/usr/bin/env npx tsx
/**
 * audit-ported-functions.ts
 *
 * Extracts all meaningful function names from the original beautified source files,
 * scans the ported TypeScript source, and cross-references to produce a coverage report.
 *
 * Usage:  npx tsx scripts/audit-ported-functions.ts
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..', '..');
const EXTENSION_SRC = path.join(REPO_ROOT, 'packages', 'extension', 'src');

const ORIGINAL_SOURCE_FILES = [
  {
    path: path.join(REPO_ROOT, 'extension-source-beautified', 'scripts', 'content', 'content.isolated.end.js'),
    shortName: 'content.isolated.end.js',
  },
  {
    path: path.join(REPO_ROOT, 'extension-source-beautified', 'scripts', 'background', 'initialize.js'),
    shortName: 'initialize.js',
  },
  {
    path: path.join(REPO_ROOT, 'extension-source-beautified', 'scripts', 'content', 'content.main.start.js'),
    shortName: 'content.main.start.js',
  },
  {
    path: path.join(REPO_ROOT, 'extension-source-beautified', 'scripts', 'content', 'content.isolated.start.js'),
    shortName: 'content.isolated.start.js',
  },
];

const MIN_NAME_LENGTH = 3;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface OriginalFunction {
  name: string;
  file: string; // short name
  filePath: string; // full path
  lineNumber: number;
  approxSize: number; // lines until next function
}

interface PortedFunction {
  name: string;
  filePath: string;
  lineNumber: number;
}

interface MatchResult extends OriginalFunction {
  status: 'PORTED' | 'MISSING';
  portedLocation: string; // relative path in our source
}

// ---------------------------------------------------------------------------
// Extraction helpers
// ---------------------------------------------------------------------------

/**
 * Regex patterns for extracting function names from original JS source.
 *
 * We look for lines that start with (possibly indented, but typically at column 0
 * in beautified output):
 *   - `function NAME(`
 *   - `async function NAME(`
 *   - `const NAME = function`  /  `let NAME = function`
 *   - `const NAME = async function`
 *   - `const NAME = (`  (arrow function, only if NAME is meaningful)
 *   - `const NAME = async (`
 *
 * We capture the function name from each pattern.
 */
const JS_FUNCTION_PATTERNS: RegExp[] = [
  // function declarations
  /^(?:export\s+)?(?:async\s+)?function\s+([a-zA-Z_$][\w$]*)\s*\(/,
  // const/let function expressions
  /^(?:export\s+)?(?:const|let|var)\s+([a-zA-Z_$][\w$]*)\s*=\s*(?:async\s+)?function\b/,
  // const/let arrow functions: const foo = ( or const foo = async (
  /^(?:export\s+)?(?:const|let|var)\s+([a-zA-Z_$][\w$]*)\s*=\s*(?:async\s+)?\(/,
];

/**
 * Additional TypeScript-aware patterns for the ported source.
 * These include type annotations and export keywords.
 */
const TS_FUNCTION_PATTERNS: RegExp[] = [
  // export function foo(, export async function foo(, function foo(
  /^(?:export\s+)?(?:async\s+)?function\s+([a-zA-Z_$][\w$]*)\s*[<(]/,
  // const/let function expressions (with possible type annotations)
  /^(?:export\s+)?(?:const|let|var)\s+([a-zA-Z_$][\w$]*)\s*(?::\s*[^=]+)?\s*=\s*(?:async\s+)?function\b/,
  // const/let arrow functions: const foo = ( or const foo = async (
  // Also handles: const foo: Type = ( or const foo = async <T>(
  /^(?:export\s+)?(?:const|let|var)\s+([a-zA-Z_$][\w$]*)\s*(?::\s*[^=]+)?\s*=\s*(?:async\s+)?[<(]/,
  // class method declarations: methodName(  or  async methodName(
  /^\s+(?:async\s+)?([a-zA-Z_$][\w$]*)\s*[<(].*\{?\s*$/,
];

/**
 * Names to skip even if they meet the length requirement.
 * Common JS built-in identifiers, common loop variables, etc.
 */
const SKIP_NAMES = new Set([
  // JS keywords / common variable names that look like functions
  'use',
  'get',
  'set',
  'has',
  'map',
  'pop',
  'run',
  'add',
  'log',
  'div',
  'url',
  'key',
  'res',
  'req',
  'msg',
  'err',
  'val',
  'len',
  'max',
  'min',
  'obj',
  'arr',
  'str',
  'num',
  'idx',
  'acc',
  'cur',
  'pre',
  'sub',
  'sup',
  'top',
  'btn',
  'img',
  'src',
  'css',
  'cls',
  'tag',
  'opt',
  'ref',
  'dom',
  'nav',
  'tab',
  'row',
  'col',
  'btn',
  'hex',
  'rgb',
  'hsl',
  'api',
  'app',
  'cmd',
  'doc',
  'env',
  'ext',
  'fig',
  'gen',
  'win',
  'for',
  'var',
  'let',
  'new',
  'not',
  'and',
  'end',
  'box',
  'svg',
  'ctx',
  'out',
  'raw',
  'alt',
  'abs',
  'esc',
  'pad',
  'gap',
  'hub',
  'ids',
  'mix',
  'mod',
  'net',
  'nil',
  'pin',
  'pos',
  'pub',
  'put',
  'rev',
  'rid',
  'rot',
  'sec',
  'seq',
  'sin',
  'sum',
  'tmp',
  'tri',
  'txt',
  'vid',
  'zip',
  'any',
  // Common beautified-minified variables
  'this',
]);

/**
 * Patterns in names that indicate they are NOT meaningful named functions
 * but rather artifacts of minification, e.g. single-letter followed by digits.
 */
function isLikelyMinifiedName(name: string): boolean {
  // Single letter + digits like "e2", "t3" etc
  if (/^[a-z]\d+$/i.test(name)) return true;
  // Two letters (like "fn", "el") — borderline, but we filter by MIN_NAME_LENGTH anyway
  return false;
}

function extractFunctionsFromJS(filePath: string, shortName: string): OriginalFunction[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const functions: OriginalFunction[] = [];
  const seenNamesInFile = new Set<string>();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Skip lines that are clearly inside string literals (indented CSS, etc.)
    // A heuristic: if the trimmed line starts with common CSS or HTML tokens, skip
    if (
      /^\s+(body|article|footer|header|p\s*\{|h[1-6]|font-|color:|background|margin|padding|border|position|transform|text-|writing-|content:|display:|width:|height:|opacity:|box-shadow|overflow|letter-spacing|line-height)/.test(
        line,
      )
    ) {
      continue;
    }

    for (const pattern of JS_FUNCTION_PATTERNS) {
      const match = line.match(pattern);
      if (match) {
        const name = match[1];
        if (
          name.length >= MIN_NAME_LENGTH &&
          !SKIP_NAMES.has(name) &&
          !isLikelyMinifiedName(name) &&
          !seenNamesInFile.has(name)
        ) {
          seenNamesInFile.add(name);
          functions.push({
            name,
            file: shortName,
            filePath,
            lineNumber: i + 1,
            approxSize: 0, // computed below
          });
        }
        break; // matched one pattern, don't try others for the same line
      }
    }
  }

  // Compute approximate sizes (distance to next function in this file)
  for (let i = 0; i < functions.length; i++) {
    if (i < functions.length - 1) {
      functions[i].approxSize = functions[i + 1].lineNumber - functions[i].lineNumber;
    } else {
      functions[i].approxSize = lines.length - functions[i].lineNumber + 1;
    }
  }

  return functions;
}

// ---------------------------------------------------------------------------
// Ported source extraction
// ---------------------------------------------------------------------------

function findTSFiles(dir: string): string[] {
  const results: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findTSFiles(fullPath));
    } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx'))) {
      results.push(fullPath);
    }
  }
  return results;
}

function extractFunctionsFromTS(filePath: string): PortedFunction[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const functions: PortedFunction[] = [];
  const seenNames = new Set<string>();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    for (const pattern of TS_FUNCTION_PATTERNS) {
      const match = line.match(pattern);
      if (match) {
        const name = match[1];
        if (
          name.length >= MIN_NAME_LENGTH &&
          !SKIP_NAMES.has(name) &&
          !isLikelyMinifiedName(name) &&
          !seenNames.has(name)
        ) {
          seenNames.add(name);
          functions.push({ name, filePath, lineNumber: i + 1 });
        }
        break;
      }
    }
  }

  return functions;
}

// ---------------------------------------------------------------------------
// Cross-referencing
// ---------------------------------------------------------------------------

/**
 * Build a lookup map from function name -> PortedFunction[].
 * Also builds a lowercase version for case-insensitive fallback matching.
 */
function buildPortedLookup(portedFunctions: PortedFunction[]): {
  exact: Map<string, PortedFunction[]>;
  lower: Map<string, PortedFunction[]>;
} {
  const exact = new Map<string, PortedFunction[]>();
  const lower = new Map<string, PortedFunction[]>();

  for (const fn of portedFunctions) {
    // Exact match
    if (!exact.has(fn.name)) exact.set(fn.name, []);
    exact.get(fn.name)!.push(fn);

    // Lowercase match
    const lowerName = fn.name.toLowerCase();
    if (!lower.has(lowerName)) lower.set(lowerName, []);
    lower.get(lowerName)!.push(fn);
  }

  return { exact, lower };
}

/**
 * Try to find a ported function matching the original name.
 * Strategy:
 *   1. Exact name match
 *   2. Case-insensitive match
 *   3. camelCase variations (e.g., "getaccount" -> "getAccount")
 */
function findPortedMatch(
  originalName: string,
  lookup: { exact: Map<string, PortedFunction[]>; lower: Map<string, PortedFunction[]> },
): PortedFunction | null {
  // 1. Exact match
  const exactMatches = lookup.exact.get(originalName);
  if (exactMatches && exactMatches.length > 0) return exactMatches[0];

  // 2. Case-insensitive match
  const lowerMatches = lookup.lower.get(originalName.toLowerCase());
  if (lowerMatches && lowerMatches.length > 0) return lowerMatches[0];

  return null;
}

// ---------------------------------------------------------------------------
// Report generation
// ---------------------------------------------------------------------------

function relativePath(fullPath: string): string {
  return path.relative(REPO_ROOT, fullPath);
}

function generateReport(results: MatchResult[]): string {
  const total = results.length;
  const ported = results.filter((r) => r.status === 'PORTED').length;
  const missing = results.filter((r) => r.status === 'MISSING').length;
  const percentage = total > 0 ? ((ported / total) * 100).toFixed(1) : '0.0';

  const lines: string[] = [];

  // Header
  lines.push('# Council — Function Port Audit');
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push(`| Metric | Count |`);
  lines.push(`|--------|------:|`);
  lines.push(`| Total original functions (name >= ${MIN_NAME_LENGTH} chars) | ${total} |`);
  lines.push(`| Ported | ${ported} |`);
  lines.push(`| Missing | ${missing} |`);
  lines.push(`| Coverage | ${percentage}% |`);
  lines.push('');

  // Full table sorted by file then line number
  lines.push('## Full Function Inventory');
  lines.push('');
  lines.push('| Original File | Function Name | Line | Size | Status | Ported Location |');
  lines.push('|---|---|---:|---:|---|---|');

  for (const r of results) {
    const loc = r.status === 'PORTED' ? r.portedLocation : '';
    lines.push(
      `| ${r.file} | \`${r.name}\` | ${r.lineNumber} | ~${r.approxSize} | ${r.status === 'PORTED' ? 'PORTED' : '**MISSING**'} | ${loc} |`,
    );
  }

  lines.push('');

  // Missing functions grouped by original file
  lines.push('## Missing Functions by Source File');
  lines.push('');

  const missingByFile = new Map<string, MatchResult[]>();
  for (const r of results) {
    if (r.status === 'MISSING') {
      if (!missingByFile.has(r.file)) missingByFile.set(r.file, []);
      missingByFile.get(r.file)!.push(r);
    }
  }

  if (missingByFile.size === 0) {
    lines.push('No missing functions found! All functions have been ported.');
    lines.push('');
  } else {
    for (const [file, fns] of missingByFile) {
      lines.push(`### ${file}`);
      lines.push('');
      lines.push(`${fns.length} missing function(s):`);
      lines.push('');
      for (const fn of fns) {
        lines.push(`- \`${fn.name}\` (line ${fn.lineNumber}, ~${fn.approxSize} lines)`);
      }
      lines.push('');
    }
  }

  // Ported functions grouped by ported location (for a quick overview)
  lines.push('## Ported Functions by Target File');
  lines.push('');

  const portedByTarget = new Map<string, MatchResult[]>();
  for (const r of results) {
    if (r.status === 'PORTED') {
      const target = r.portedLocation || 'unknown';
      if (!portedByTarget.has(target)) portedByTarget.set(target, []);
      portedByTarget.get(target)!.push(r);
    }
  }

  const sortedTargets = [...portedByTarget.keys()].sort();
  for (const target of sortedTargets) {
    const fns = portedByTarget.get(target)!;
    lines.push(`**${target}** (${fns.length} functions)`);
    for (const fn of fns) {
      lines.push(`  - \`${fn.name}\` <- ${fn.file}:${fn.lineNumber}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main(): void {
  console.error('Extracting functions from original source files...');

  // 1. Extract from original source
  const originalFunctions: OriginalFunction[] = [];
  for (const srcFile of ORIGINAL_SOURCE_FILES) {
    if (!fs.existsSync(srcFile.path)) {
      console.error(`  WARNING: Source file not found: ${srcFile.path}`);
      continue;
    }
    const fns = extractFunctionsFromJS(srcFile.path, srcFile.shortName);
    console.error(`  ${srcFile.shortName}: ${fns.length} functions extracted`);
    originalFunctions.push(...fns);
  }

  console.error(`Total original functions: ${originalFunctions.length}`);
  console.error('');

  // 2. Extract from ported TypeScript source
  console.error('Scanning ported TypeScript source...');
  const tsFiles = findTSFiles(EXTENSION_SRC);
  console.error(`  Found ${tsFiles.length} .ts/.tsx files`);

  const portedFunctions: PortedFunction[] = [];
  for (const tsFile of tsFiles) {
    const fns = extractFunctionsFromTS(tsFile);
    portedFunctions.push(...fns);
  }
  console.error(`  Total ported functions extracted: ${portedFunctions.length}`);
  console.error('');

  // 3. Build lookup and cross-reference
  console.error('Cross-referencing...');
  const lookup = buildPortedLookup(portedFunctions);

  const results: MatchResult[] = [];
  for (const orig of originalFunctions) {
    const match = findPortedMatch(orig.name, lookup);
    results.push({
      ...orig,
      status: match ? 'PORTED' : 'MISSING',
      portedLocation: match ? relativePath(match.filePath) : '',
    });
  }

  // 4. Generate and output report
  const report = generateReport(results);
  console.log(report);

  // Summary to stderr as well for quick glance
  const ported = results.filter((r) => r.status === 'PORTED').length;
  const missing = results.filter((r) => r.status === 'MISSING').length;
  const pct = results.length > 0 ? ((ported / results.length) * 100).toFixed(1) : '0.0';
  console.error('');
  console.error('=== AUDIT COMPLETE ===');
  console.error(`  Total: ${results.length}  |  Ported: ${ported}  |  Missing: ${missing}  |  Coverage: ${pct}%`);
}

main();
