import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { parseAllDocuments } from 'yaml';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function acceptsDuration(durationMs) {
	const documents = parseAllDocuments(
		readFileSync(path.join(ROOT, 'apps/main/.maestro/subflows/assert-cart-add-timing.yml'), 'utf8')
	);
	const commands = documents.at(-1).toJS();
	const budgetAssertion = commands.find(({ assertTrue }) =>
		assertTrue?.label?.startsWith('Add handler to cart commit is within')
	).assertTrue.condition;
	const expression = budgetAssertion.slice(2, -1);

	return Function(
		'output',
		'isFinite',
		`return ${expression}`
	)({ cartAddSample: { durationMs } }, Number.isFinite);
}

test('native cart-add timing keeps a three-second phone regression boundary', () => {
	assert.equal(acceptsDuration(2_999.9), true);
	assert.equal(acceptsDuration(3_000), true);
	assert.equal(acceptsDuration(3_000.1), false);
});
