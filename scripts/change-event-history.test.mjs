import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import test from 'node:test';

const premiumRoot = dirname(createRequire(import.meta.url).resolve('rxdb-premium/package.json'));
// Like flexsearch-export-history: only Dependabot's declared missing premium dist skips.
const premium = existsSync(join(premiumRoot, 'dist/esm/plugins/shared/index.js'));
// Run via test:scripts on PRs regardless of the affected-package unit-test selection.
// Vitest imports the real TS app factories without source slicing or a second recipe.
test('app collection byte-retention detector', { skip: !premium && 'premium dist absent' }, () => {
	const result = spawnSync(
		'pnpm',
		['exec', 'vitest', 'run', 'src/collections/change-event-history.test.ts', '--maxWorkers=2'],
		{
			cwd: new URL('../packages/sync-engine/', import.meta.url),
			encoding: 'utf8',
			timeout: 60_000,
		}
	);
	assert.equal(result.status, 0, `${result.error ?? ''}\n${result.stdout}\n${result.stderr}`);
});
