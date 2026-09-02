import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { ESLint } from 'eslint';

import { config } from '../index.js';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const VIRTUALIZED_LIST = join(
	REPO_ROOT,
	'packages/components/src/virtualized-list/virtualized-list.web.tsx'
);

test('keeps the intentional virtualizer compiler opt-out lint-clean', async () => {
	const eslint = new ESLint({ baseConfig: config, overrideConfigFile: true, cwd: REPO_ROOT });
	const [result] = await eslint.lintFiles([VIRTUALIZED_LIST]);
	const violations = result.messages
		.filter(({ ruleId }) => ruleId === 'react-hooks/incompatible-library')
		.map(({ line, column, message }) => `${line}:${column} ${message}`);

	assert.deepEqual(violations, []);
});
