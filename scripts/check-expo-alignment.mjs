import { realpathSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import { parseImporters } from './check-dep-duplicates.mjs';

/**
 * Fails when a workspace package resolves an Expo-managed dependency to a
 * version outside what the installed Expo SDK prescribes in
 * expo/bundledNativeModules.json (the data behind `npx expo install --check`).
 *
 * Versions that merely *install* fine can still break at runtime: react-native
 * ships a renderer compiled against one exact React version, so e.g. react
 * 19.2.7 installs against RN 0.85.3 (peer ^19.2.3) but crashes on device with
 * "Incompatible React versions: react vs react-native-renderer". Holding every
 * workspace package to the SDK's prescribed ranges catches that class before
 * deployment.
 */

// Intentional deviations from the Expo SDK's prescribed versions.
// Map of dependency name -> reason.
export const ALLOWED_EXPO_MISMATCHES = new Map([
  // example: ['react-native-svg', 'pinned ahead of SDK for fix XYZ'],
]);

/**
 * Minimal semver-range check for the three specifier forms that
 * bundledNativeModules.json uses: exact `x.y.z`, tilde `~x.y.z`, caret `^x.y.z`.
 * Returns false for anything it cannot parse (conservative: surfaces for review).
 */
export function satisfies(version, range) {
  const parse = (v) => {
    const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(v);
    return match ? match.slice(1).map(Number) : null;
  };
  const operator = range.startsWith('~') || range.startsWith('^') ? range[0] : '';
  const wanted = parse(operator ? range.slice(1) : range);
  const got = parse(version);
  if (!wanted || !got) return false;

  const [wMajor, wMinor, wPatch] = wanted;
  const [gMajor, gMinor, gPatch] = got;
  const atLeast =
    gMajor !== wMajor
      ? gMajor > wMajor
      : gMinor !== wMinor
        ? gMinor > wMinor
        : gPatch >= wPatch;

  if (operator === '') return gMajor === wMajor && gMinor === wMinor && gPatch === wPatch;
  if (operator === '~') return gMajor === wMajor && gMinor === wMinor && atLeast;
  // caret: leftmost non-zero component must match
  if (wMajor > 0) return gMajor === wMajor && atLeast;
  if (wMinor > 0) return gMajor === 0 && gMinor === wMinor && atLeast;
  return gMajor === 0 && gMinor === 0 && gPatch === wPatch;
}

/**
 * Compare every importer's resolved versions against the prescribed ranges.
 * Returns [{ name, prescribed, version, importers: [path] }] sorted by name.
 */
export function findExpoMisalignments(importers, bundled, allowed = ALLOWED_EXPO_MISMATCHES) {
  const misaligned = new Map();
  for (const [importer, deps] of Object.entries(importers)) {
    for (const [name, { version }] of Object.entries(deps)) {
      const prescribed = bundled[name];
      if (!prescribed || allowed.has(name) || satisfies(version, prescribed)) continue;
      const key = `${name}@${version}`;
      misaligned.set(key, misaligned.get(key) ?? { name, prescribed, version, importers: [] });
      misaligned.get(key).importers.push(importer);
    }
  }
  return [...misaligned.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function formatMisalignments(misalignments) {
  return misalignments
    .map(
      ({ name, prescribed, version, importers }) =>
        `${name}: resolved ${version}, Expo SDK prescribes ${prescribed}\n  <- ${importers.join(', ')}`
    )
    .join('\n');
}

function main() {
  const require = createRequire(import.meta.url);
  let bundled;
  try {
    bundled = require('expo/bundledNativeModules.json');
  } catch {
    console.error(
      'check-expo-alignment: could not load expo/bundledNativeModules.json — run pnpm install first.'
    );
    process.exit(1);
  }

  const lockfileText = readFileSync(new URL('../pnpm-lock.yaml', import.meta.url), 'utf8');
  const importers = parseImporters(lockfileText);
  const misalignments = findExpoMisalignments(importers, bundled);

  if (misalignments.length > 0) {
    console.error(
      `Found ${misalignments.length} dependency version(s) outside the Expo SDK prescribed range:\n`
    );
    console.error(formatMisalignments(misalignments));
    console.error(
      '\nAlign the declared versions (including the pnpm-workspace.yaml overrides) with' +
        '\nexpo/bundledNativeModules.json, or add an entry to ALLOWED_EXPO_MISMATCHES in' +
        '\nscripts/check-expo-alignment.mjs with a reason.'
    );
    process.exit(1);
  }

  console.log(
    `check-expo-alignment: all Expo-managed dependencies match the SDK prescribed versions across ${Object.keys(importers).length} workspace packages.`
  );
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
