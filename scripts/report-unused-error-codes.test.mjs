import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { scanErrorCodeUsage } from './report-unused-error-codes.mjs';

test('counts runtime code literals and generated symbols while excluding generated sources', async () => {
	const root = await mkdtemp(path.join(tmpdir(), 'unused-error-codes-'));

	try {
		await Promise.all([
			mkdir(path.join(root, 'packages/example/src/__tests__'), {
				recursive: true,
			}),
			mkdir(path.join(root, 'packages/utils/src/logger/generated'), { recursive: true }),
			mkdir(path.join(root, 'apps/main/e2e'), { recursive: true }),
		]);
		await Promise.all([
			writeFile(
				path.join(root, 'packages/example/src/emitter.ts'),
				"log.error('failed', { context: { errorCode: ERROR_CODES.SYNC_FAILED } });\n"
			),
			writeFile(
				path.join(root, 'apps/main/emitter.tsx'),
				'const first = \'SYNC101\';\nconst second = "SYNC101";\n'
			),
			writeFile(
				path.join(root, 'packages/example/src/emitter.test.ts'),
				"const ignored = 'AUTH101';\n"
			),
			writeFile(
				path.join(root, 'packages/example/src/__tests__/fixture.ts'),
				'const ignored = ERROR_CODES.AUTH_FAILED;\n'
			),
			writeFile(
				path.join(root, 'packages/utils/src/logger/index.ts'),
				"const runtimeFallback = 'AUTH101';\n"
			),
			writeFile(
				path.join(root, 'packages/utils/src/logger/generated/error-codes.generated.ts'),
				"const catalogueEntry = 'AUTH101';\n"
			),
			writeFile(
				path.join(root, 'apps/main/e2e/flow.ts'),
				'const ignored = ERROR_CODES.AUTH_FAILED;\n'
			),
			writeFile(path.join(root, 'packages/example/src/plain.js'), "const ignored = 'SYNC101';\n"),
		]);

		const counts = await scanErrorCodeUsage(
			[
				{ code: 'SYNC101', symbol: 'SYNC_FAILED' },
				{ code: 'AUTH101', symbol: 'AUTH_FAILED' },
			],
			root
		);

		assert.deepEqual(Object.fromEntries(counts), { SYNC101: 3, AUTH101: 1 });
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});
