#!/usr/bin/env node

/**
 * Extract translatable strings from the WCPOS monorepo.
 *
 * Parses t('...', { _tags: '...' }) calls and groups them by tag.
 * Outputs one JSON file per tag into .translations/.
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

// Match t('string' or t("string" with optional second argument containing _tags
// Handles single quotes, double quotes, and backticks
const T_CALL_REGEX = /\bt\(\s*(['"`])((?:(?!\1)[^\\]|\\.)*?)\1\s*(?:,\s*\{([^}]*)\})?\s*\)/g;
const TAGS_REGEX = /_tags:\s*['"`]([^'"`]+)['"`]/;
const CONTEXT_REGEX = /_context:\s*['"`]([^'"`]+)['"`]/;

async function extractFromFile(filePath) {
  const content = await fs.readFile(filePath, 'utf8');
  const strings = [];
  let match;

  T_CALL_REGEX.lastIndex = 0;
  while ((match = T_CALL_REGEX.exec(content)) !== null) {
    const sourceString = match[2];
    const options = match[3] || '';

    const tagsMatch = options.match(TAGS_REGEX);
    const contextMatch = options.match(CONTEXT_REGEX);

    const tag = tagsMatch ? tagsMatch[1].trim() : null;
    const context = contextMatch ? contextMatch[1] : undefined;

    if (!tag) {
      console.warn(`  Warning: t() call without _tags in ${filePath}: "${sourceString.substring(0, 50)}..."`);
      continue;
    }

    strings.push({
      string: sourceString,
      tag,
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

  // Group by tag
  const byTag = {};
  for (const entry of allStrings) {
    if (!byTag[entry.tag]) {
      byTag[entry.tag] = {};
    }

    const key = entry.context ? `${entry.string}_${entry.context}` : entry.string;

    if (!byTag[entry.tag][key]) {
      byTag[entry.tag][key] = {
        string: entry.string,
        ...(entry.context && { context: entry.context }),
        files: [],
      };
    }

    if (!byTag[entry.tag][key].files.includes(entry.file)) {
      byTag[entry.tag][key].files.push(entry.file);
    }
  }

  // Write output files
  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  for (const [tag, strings] of Object.entries(byTag)) {
    const outputPath = path.join(OUTPUT_DIR, `${tag}.json`);

    // Sort keys for stable output
    const sorted = {};
    for (const key of Object.keys(strings).sort()) {
      sorted[key] = strings[key];
    }

    await fs.writeFile(outputPath, JSON.stringify(sorted, null, 2) + '\n');

    const uniqueCount = Object.keys(sorted).length;
    console.log(`  ${tag}: ${uniqueCount} unique strings -> ${outputPath}`);
  }

  console.log('\nDone.');
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
