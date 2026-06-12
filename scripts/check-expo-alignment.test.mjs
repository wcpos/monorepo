import test from 'node:test';
import assert from 'node:assert/strict';

import {
  satisfies,
  findExpoMisalignments,
  formatMisalignments,
} from './check-expo-alignment.mjs';

test('satisfies handles exact versions', () => {
  assert.equal(satisfies('19.2.3', '19.2.3'), true);
  assert.equal(satisfies('19.2.7', '19.2.3'), false);
});

test('satisfies handles tilde ranges', () => {
  assert.equal(satisfies('2.31.1', '~2.31.0'), true);
  assert.equal(satisfies('2.31.5', '~2.31.1'), true);
  assert.equal(satisfies('2.32.0', '~2.31.1'), false);
  assert.equal(satisfies('2.31.0', '~2.31.1'), false);
});

test('satisfies handles caret ranges', () => {
  assert.equal(satisfies('1.6.9', '^1.6.2'), true);
  assert.equal(satisfies('1.7.0', '^1.6.2'), true);
  assert.equal(satisfies('2.0.0', '^1.6.2'), false);
  assert.equal(satisfies('1.6.1', '^1.6.2'), false);
  assert.equal(satisfies('0.8.4', '^0.8.3'), true);
  assert.equal(satisfies('0.9.0', '^0.8.3'), false);
});

test('satisfies is conservative about unparsable versions', () => {
  assert.equal(satisfies('uniwind-pro@1.3.0', '^1.0.0'), false);
  assert.equal(satisfies('1.2.3-rc.0', '^1.0.0'), false);
});

const bundled = {
  react: '19.2.3',
  'react-native': '0.85.3',
  '@shopify/flash-list': '2.0.2',
  'expo-image': '~56.0.9',
};

const importers = {
  'apps/main': {
    react: { specifier: '19.2.7', version: '19.2.7' },
    'react-native': { specifier: '0.85.3', version: '0.85.3' },
    lodash: { specifier: '^4.18.1', version: '4.18.1' },
  },
  'packages/components': {
    react: { specifier: '19.2.7', version: '19.2.7' },
    'expo-image': { specifier: '~56.0.9', version: '56.0.11' },
  },
};

test('findExpoMisalignments flags resolved versions outside the prescribed range', () => {
  const misalignments = findExpoMisalignments(importers, bundled, new Map());
  assert.equal(misalignments.length, 1);
  assert.deepEqual(misalignments[0], {
    name: 'react',
    prescribed: '19.2.3',
    version: '19.2.7',
    importers: ['apps/main', 'packages/components'],
  });
});

test('findExpoMisalignments ignores deps Expo does not manage', () => {
  const misalignments = findExpoMisalignments(importers, bundled, new Map());
  assert.equal(misalignments.some(({ name }) => name === 'lodash'), false);
});

test('findExpoMisalignments accepts in-range tilde resolutions', () => {
  const misalignments = findExpoMisalignments(importers, bundled, new Map());
  assert.equal(misalignments.some(({ name }) => name === 'expo-image'), false);
});

test('findExpoMisalignments respects the allowlist', () => {
  const allowed = new Map([['react', 'testing']]);
  assert.deepEqual(findExpoMisalignments(importers, bundled, allowed), []);
});

test('formatMisalignments renders the prescribed range and importers', () => {
  const output = formatMisalignments(findExpoMisalignments(importers, bundled, new Map()));
  assert.match(output, /react: resolved 19\.2\.7, Expo SDK prescribes 19\.2\.3/);
  assert.match(output, /<- apps\/main, packages\/components/);
});
