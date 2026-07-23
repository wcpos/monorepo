import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ALLOWED_DUPLICATES,
  parseImporters,
  findDuplicateResolutions,
  formatDuplicates,
} from './check-dep-duplicates.mjs';

const lockfile = `lockfileVersion: '9.0'

settings:
  autoInstallPeers: true

importers:

  .:
    dependencies:
      turbo:
        specifier: ^2.9.18
        version: 2.9.18

  apps/main:
    dependencies:
      '@shopify/flash-list':
        specifier: 2.0.2
        version: 2.0.2(react-native@0.85.3(react@19.2.7))(react@19.2.7)
      '@wcpos/components':
        specifier: workspace:*
        version: link:../../packages/components
      uniwind:
        specifier: npm:uniwind-pro@1.3.0
        version: uniwind-pro@1.3.0(metro@0.84.4)
    devDependencies:
      typescript:
        specifier: ^5.9.3
        version: 5.9.3

  packages/components:
    dependencies:
      '@shopify/flash-list':
        specifier: ^2.2.2
        version: 2.3.2(react-native@0.85.3(react@19.2.7))(react@19.2.7)
      date-fns:
        specifier: ^4.4.0
        version: 4.4.0
    devDependencies:
      typescript:
        specifier: 5.9.3
        version: 5.9.3

  packages/core:
    dependencies:
      date-fns:
        specifier: 4.3.0
        version: 4.3.0

packages:

  '@shopify/flash-list@2.0.2':
    resolution: {integrity: sha512-fake}
`;

test('parseImporters extracts resolved versions with peer suffixes stripped', () => {
  const importers = parseImporters(lockfile);
  assert.deepEqual(importers['apps/main']['@shopify/flash-list'], {
    specifier: '2.0.2',
    version: '2.0.2',
  });
  assert.deepEqual(importers['packages/components']['@shopify/flash-list'], {
    specifier: '^2.2.2',
    version: '2.3.2',
  });
});

test('parseImporters skips workspace link: resolutions', () => {
  const importers = parseImporters(lockfile);
  assert.equal(importers['apps/main']['@wcpos/components'], undefined);
});

test('parseImporters keeps npm: alias target versions', () => {
  const importers = parseImporters(lockfile);
  assert.deepEqual(importers['apps/main'].uniwind, {
    specifier: 'npm:uniwind-pro@1.3.0',
    version: 'uniwind-pro@1.3.0',
  });
});

test('parseImporters ignores sections outside importers', () => {
  const importers = parseImporters(lockfile);
  assert.equal('@shopify/flash-list@2.0.2' in importers, false);
});

test('findDuplicateResolutions flags deps resolving to more than one version', () => {
  const duplicates = findDuplicateResolutions(parseImporters(lockfile), new Map());
  assert.deepEqual(
    duplicates.map(({ name }) => name),
    ['@shopify/flash-list', 'date-fns']
  );
  const flashList = duplicates[0];
  assert.deepEqual(flashList.versions['2.0.2'], [{ importer: 'apps/main', specifier: '2.0.2' }]);
  assert.deepEqual(flashList.versions['2.3.2'], [
    { importer: 'packages/components', specifier: '^2.2.2' },
  ]);
});

test('findDuplicateResolutions ignores specifier-only differences', () => {
  // typescript: ^5.9.3 vs 5.9.3 both resolve to 5.9.3 — not a duplicate
  const duplicates = findDuplicateResolutions(parseImporters(lockfile), new Map());
  assert.equal(duplicates.some(({ name }) => name === 'typescript'), false);
});

test('findDuplicateResolutions respects the allowlist', () => {
  const allowed = new Map([['@shopify/flash-list', 'testing']]);
  const duplicates = findDuplicateResolutions(parseImporters(lockfile), allowed);
  assert.deepEqual(
    duplicates.map(({ name }) => name),
    ['date-fns']
  );
});

test('default allowlist permits the intentional expo-constants split', () => {
  const importers = {
    'apps/main': {
      'expo-constants': { specifier: '~56.0.18', version: '56.0.18' },
    },
    'packages/core': {
      'expo-constants': { specifier: '~56.0.16', version: '56.0.21' },
    },
  };

  assert.equal(ALLOWED_DUPLICATES.has('expo-constants'), true);
  assert.deepEqual(findDuplicateResolutions(importers), []);
});

test('formatDuplicates renders versions with their importers and specifiers', () => {
  const duplicates = findDuplicateResolutions(parseImporters(lockfile), new Map());
  const output = formatDuplicates(duplicates);
  assert.match(output, /@shopify\/flash-list:/);
  assert.match(output, /2\.0\.2 {2}<- apps\/main \(2\.0\.2\)/);
  assert.match(output, /2\.3\.2 {2}<- packages\/components \(\^2\.2\.2\)/);
});
