import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';

const scriptPath = new URL('./extract-js-strings.js', import.meta.url).pathname;

function writeFixtureFile(root, relativePath, contents) {
  const filePath = join(root, relativePath);
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, contents);
}

test('--check fails when source uses keys missing from the English catalog', () => {
  const root = mkdtempSync(join(tmpdir(), 'wcpos-translations-check-'));

  writeFixtureFile(
    root,
    'packages/core/src/contexts/translations/locales/en/core.json',
    JSON.stringify({ 'existing.key': 'Existing copy' }, null, '\t')
  );
  writeFixtureFile(
    root,
    'packages/core/src/example.tsx',
    `
      const title = t('existing.key', 'Existing copy');
      const body = t('missing.key', 'Missing copy');
    `
  );

  const result = spawnSync(process.execPath, [scriptPath, root, '--check'], {
    encoding: 'utf8',
  });

  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}\n${result.stderr}`, /missing\.key/);
});
