#!/usr/bin/env node

/**
 * Extract translatable strings from the WCPOS monorepo.
 *
 * Parses t('...') calls, groups them by namespace (electron vs core),
 * then looks up the English value for each key from the locale files.
 *
 * Outputs one JSON file per namespace into .translations/:
 *   { "symbolic.key": "English value", ... }
 *
 * Usage:
 *   node scripts/extract-js-strings.js [path-to-monorepo]
 */

const fs = require('fs').promises;
const path = require('path');
const { glob } = require('glob');

const MONOREPO_PATH = process.argv[2] || path.resolve(__dirname, '..');
const OUTPUT_DIR = path.resolve(MONOREPO_PATH, '.translations');

// Locale files that contain the English strings for each namespace
const LOCALE_FILES = {
  core: path.resolve(MONOREPO_PATH, 'packages/core/src/contexts/translations/locales/en/core.json'),
  electron: path.resolve(MONOREPO_PATH, 'apps/electron/src/main/translations/locales/en/electron.json'),
};

// Match t('string') or t("string") with optional second argument
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
    const key = context ? `${sourceString}_${context}` : sourceString;

    strings.push({ key, namespace });
  }

  return strings;
}

async function loadLocale(filePath) {
  try {
    const content = await fs.readFile(filePath, 'utf8');
    return JSON.parse(content);
  } catch (err) {
    console.warn(`  Warning: could not load locale file ${filePath}: ${err.message}`);
    return {};
  }
}

async function main() {
  console.log(`Extracting strings from: ${MONOREPO_PATH}`);

  // Load English locale files
  const locales = {};
  for (const [ns, localePath] of Object.entries(LOCALE_FILES)) {
    locales[ns] = await loadLocale(localePath);
    console.log(`  Loaded ${Object.keys(locales[ns]).length} English strings for "${ns}"`);
  }

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

  console.log(`\nFound ${allFiles.length} source files to scan`);

  // Extract keys from all files
  const byNamespace = {};
  for (const file of allFiles) {
    const strings = await extractFromFile(file);
    for (const { key, namespace } of strings) {
      if (!byNamespace[namespace]) {
        byNamespace[namespace] = new Set();
      }
      byNamespace[namespace].add(key);
    }
  }

  // Build output: look up English value for each extracted key
  let warnings = 0;
  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  for (const [ns, keys] of Object.entries(byNamespace)) {
    const locale = locales[ns] || {};
    const output = {};

    for (const key of [...keys].sort()) {
      if (locale[key] !== undefined) {
        output[key] = locale[key];
      } else {
        // Check for i18next plural suffixes (_one, _other, _zero, _two, _few, _many)
        const pluralSuffixes = ['_zero', '_one', '_two', '_few', '_many', '_other'];
        let foundPlural = false;
        for (const suffix of pluralSuffixes) {
          const pluralKey = `${key}${suffix}`;
          if (locale[pluralKey] !== undefined) {
            output[pluralKey] = locale[pluralKey];
            foundPlural = true;
          }
        }
        if (!foundPlural) {
          console.warn(`  ⚠ ${ns}: key "${key}" not found in English locale file`);
          warnings++;
        }
      }
    }

    const outputPath = path.join(OUTPUT_DIR, `${ns}.json`);
    await fs.writeFile(outputPath, JSON.stringify(output, null, '\t') + '\n');

    console.log(`  ${ns}: ${Object.keys(output).length} strings -> ${outputPath}`);
  }

  if (warnings > 0) {
    console.warn(`\n${warnings} key(s) missing from English locale files.`);
  }

  console.log('\nDone.');
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
