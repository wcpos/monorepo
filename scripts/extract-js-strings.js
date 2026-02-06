#!/usr/bin/env node

/**
 * Extract translatable strings from the WCPOS monorepo.
 *
 * Parses t('...') calls and groups them by namespace based on file path:
 *   - apps/electron/ → electron
 *   - everything else → core
 *
 * Outputs one JSON file per namespace into .translations/.
 *
 * Usage:
 *   node scripts/extract-js-strings.js [path-to-monorepo]
 *
 * Default monorepo path: . (current working directory)
 */

const fs = require('fs').promises;
const path = require('path');
const { glob } = require('glob');

const MONOREPO_PATH = process.argv[2] || path.resolve(__dirname, '..');
const OUTPUT_DIR = path.resolve(MONOREPO_PATH, '.translations');

// Match t('string' or t("string" with optional second argument
// Handles single quotes, double quotes, and backticks
const T_CALL_REGEX = /\bt\(\s*(['"`])((?:(?!\1)[^\\]|\\.)*?)\1\s*(?:,\s*\{([^}]*)\})?\s*\)/g;
const CONTEXT_REGEX = /_context:\s*['"`]([^'"`]+)['"`]/;

/**
 * Determine the i18next namespace from the file path.
 */
function getNamespace(filePath) {
  const rel = path.relative(MONOREPO_PATH, filePath);
  if (rel.startsWith(path.join('apps', 'electron') + path.sep)) {
    return 'electron';
  }
  return 'core';
}

async function extractFromFile(filePath) {
  const content = await fs.readFile(filePath, 'utf8');
  const strings = [];
  let match;

  T_CALL_REGEX.lastIndex = 0;
  while ((match = T_CALL_REGEX.exec(content)) !== null) {
    const sourceString = match[2];
    const options = match[3] || '';

    const contextMatch = options.match(CONTEXT_REGEX);
    const context = contextMatch ? contextMatch[1] : undefined;
    const namespace = getNamespace(filePath);

    strings.push({
      string: sourceString,
      namespace,
      context,
      file: path.relative(MONOREPO_PATH, filePath),
    });
  }

  return strings;
}

async function main() {
  console.log(`Extracting strings from: ${MONOREPO_PATH}`);

  // Find all TypeScript/JavaScript files in apps/ and packages/
  const patterns = [
    'apps/**/*.{ts,tsx,js,jsx}',
    'packages/**/*.{ts,tsx,js,jsx}',
  ];

  const ignorePatterns = [
    '**/node_modules/**',
    '**/dist/**',
    '**/build/**',
    '**/web-build/**',
    '**/*.d.ts',
    '**/*.test.*',
    '**/*.spec.*',
  ];

  let allFiles = [];
  for (const pattern of patterns) {
    const files = await glob(pattern, {
      cwd: MONOREPO_PATH,
      ignore: ignorePatterns,
      absolute: true,
    });
    allFiles = allFiles.concat(files);
  }

  console.log(`Found ${allFiles.length} source files to scan\n`);

  // Extract strings from all files
  const allStrings = [];
  for (const file of allFiles) {
    const strings = await extractFromFile(file);
    if (strings.length > 0) {
      allStrings.push(...strings);
    }
  }

  console.log(`\nExtracted ${allStrings.length} translatable strings`);

  // Group by namespace
  const byNamespace = {};
  for (const entry of allStrings) {
    if (!byNamespace[entry.namespace]) {
      byNamespace[entry.namespace] = {};
    }

    const key = entry.context ? `${entry.string}_${entry.context}` : entry.string;

    if (!byNamespace[entry.namespace][key]) {
      byNamespace[entry.namespace][key] = {
        string: entry.string,
        ...(entry.context && { context: entry.context }),
        files: [],
      };
    }

    if (!byNamespace[entry.namespace][key].files.includes(entry.file)) {
      byNamespace[entry.namespace][key].files.push(entry.file);
    }
  }

  // Validate: warn if any key contains spaces (indicates missed symbolic-key migration)
  let warnings = 0;
  for (const [ns, strings] of Object.entries(byNamespace)) {
    for (const key of Object.keys(strings)) {
      if (/\s/.test(key)) {
        console.warn(`  ⚠ ${ns}: key contains spaces (not a symbolic key): "${key}"`);
        warnings++;
      }
    }
  }
  if (warnings > 0) {
    console.warn(`\n${warnings} key(s) still use English strings instead of symbolic keys.\n`);
  }

  // Write output files
  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  for (const [ns, strings] of Object.entries(byNamespace)) {
    const outputPath = path.join(OUTPUT_DIR, `${ns}.json`);

    // Sort keys for stable output
    const sorted = {};
    for (const key of Object.keys(strings).sort()) {
      sorted[key] = strings[key];
    }

    await fs.writeFile(outputPath, JSON.stringify(sorted, null, 2) + '\n');

    const uniqueCount = Object.keys(sorted).length;
    console.log(`  ${ns}: ${uniqueCount} unique strings -> ${outputPath}`);
  }

  console.log('\nDone.');
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
