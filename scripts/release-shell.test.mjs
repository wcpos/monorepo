// Runs the release shell suites under `pnpm test:scripts` (scripts/*.test.mjs),
// so the web-bundle lane gate's tests are exercised by CI, not only by hand.
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const releaseDir = join(dirname(fileURLToPath(import.meta.url)), 'release');

for (const suite of ['test-check-worker-rxdb-lane.sh', 'test-tag-web-bundle.sh']) {
	test(suite, (t) => {
		const result = spawnSync('bash', [join(releaseDir, suite)], { encoding: 'utf8' });
		if (result.status !== 0) t.diagnostic(result.stdout + result.stderr);
		if (result.status !== 0) throw new Error(`${suite} exited ${result.status}`);
	});
}
