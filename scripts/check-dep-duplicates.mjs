import { readFileSync } from 'node:fs';
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Fails when two workspace packages resolve the same dependency to different
 * versions in pnpm-lock.yaml (e.g. one declares `2.0.2`, another declares a
 * peer range `^2.2.2`, and pnpm auto-installs a second nested copy). Duplicate
 * copies of native/runtime libraries break the Android/iOS builds and bloat
 * the JS bundle.
 *
 * The check reads resolved versions from the lockfile `importers:` section —
 * the ground truth of what pnpm installed — rather than comparing package.json
 * specifiers, so it also catches silently auto-installed peer dependencies.
 * Transitive-only duplicates (packages no workspace package declares directly)
 * are out of scope.
 */

// Intentional version splits. Map of dependency name -> reason it is allowed
// to resolve to more than one version across workspace packages.
export const ALLOWED_DUPLICATES = new Map([
  // example: ['jest', 'apps/main needs jest-expo (jest 29); packages use jest 30'],
  ['expo-constants', 'Expo 56 packages resolve compatible patch versions across app and peer ranges'],
]);

/**
 * Parse the `importers:` section of a pnpm-lock.yaml (lockfile v9).
 * Returns { [importerPath]: { [depName]: { specifier, version } } } where
 * `version` is the resolved version with any peer-suffix `(...)` stripped.
 * `link:` (workspace) resolutions are skipped.
 */
export function parseImporters(lockfileText) {
  const lines = lockfileText.split('\n');
  const importers = {};
  let inImporters = false;
  let importer = null;
  let dep = null;

  for (const line of lines) {
    if (/^\S/.test(line)) {
      inImporters = line === 'importers:';
      importer = null;
      dep = null;
      continue;
    }
    if (!inImporters || line.trim() === '') continue;

    const importerMatch = line.match(/^ {2}(\S.*):$/);
    if (importerMatch) {
      importer = importerMatch[1].replace(/^(['"])(.*)\1$/, '$2');
      importers[importer] ??= {};
      dep = null;
      continue;
    }

    const depMatch = line.match(/^ {6}(['"]?)(.+?)\1:$/);
    if (depMatch && importer) {
      dep = { name: depMatch[2], specifier: null };
      continue;
    }

    const specifierMatch = line.match(/^ {8}specifier: (.+)$/);
    if (specifierMatch && dep) {
      dep.specifier = specifierMatch[1];
      continue;
    }

    const versionMatch = line.match(/^ {8}version: (.+)$/);
    if (versionMatch && dep && importer) {
      const raw = versionMatch[1];
      if (!raw.startsWith('link:')) {
        const parenIndex = raw.indexOf('(');
        const version = (parenIndex === -1 ? raw : raw.slice(0, parenIndex)).trim();
        importers[importer][dep.name] = { specifier: dep.specifier, version };
      }
      dep = null;
    }
  }

  return importers;
}

/**
 * Find dependencies that resolve to more than one version across importers.
 * Returns [{ name, versions: { [version]: [{ importer, specifier }] } }].
 */
export function findDuplicateResolutions(importers, allowed = ALLOWED_DUPLICATES) {
  const byName = {};
  for (const [importer, deps] of Object.entries(importers)) {
    for (const [name, { specifier, version }] of Object.entries(deps)) {
      byName[name] ??= {};
      byName[name][version] ??= [];
      byName[name][version].push({ importer, specifier });
    }
  }

  return Object.entries(byName)
    .filter(([name, versions]) => Object.keys(versions).length > 1 && !allowed.has(name))
    .map(([name, versions]) => ({ name, versions }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function formatDuplicates(duplicates) {
  const sections = duplicates.map(({ name, versions }) => {
    const lines = Object.entries(versions).map(
      ([version, users]) =>
        `  ${version}  <- ${users.map(({ importer, specifier }) => `${importer} (${specifier})`).join(', ')}`
    );
    return `${name}:\n${lines.join('\n')}`;
  });
  return sections.join('\n');
}

function main() {
  const lockfileText = readFileSync(new URL('../pnpm-lock.yaml', import.meta.url), 'utf8');
  const importers = parseImporters(lockfileText);

  if (Object.keys(importers).length === 0) {
    console.error('check-dep-duplicates: no importers found in pnpm-lock.yaml — lockfile format change?');
    process.exit(1);
  }

  const duplicates = findDuplicateResolutions(importers);

  if (duplicates.length > 0) {
    console.error(`Found ${duplicates.length} dependency duplicate(s) across workspace packages:\n`);
    console.error(formatDuplicates(duplicates));
    console.error(
      '\nAlign the declared versions/ranges (including peerDependencies) so a single version resolves,' +
        '\nor add an entry to ALLOWED_DUPLICATES in scripts/check-dep-duplicates.mjs with a reason.'
    );
    process.exit(1);
  }

  console.log(
    `check-dep-duplicates: all direct dependencies resolve to a single version across ${Object.keys(importers).length} workspace packages.`
  );
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
