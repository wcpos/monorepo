import test from 'node:test';
import assert from 'node:assert/strict';

import { spliceErrorDocsSidebar } from './splice-error-docs-sidebar.mjs';

const generatedCategory = {
	type: 'category',
	label: 'Error codes (1.10+)',
	items: ['error-codes/SYNC101'],
};

test('replaces the generated category in place', () => {
	const fixture = `{
  "version-1.x": [
    { "type": "category", "label": "Error Codes", "items": ["error-codes/legacy"] },
    { "type": "category", "label": "Error codes (1.10+)", "items": ["stale"] },
    "support"
  ]
}
`;
	const output = spliceErrorDocsSidebar(fixture, generatedCategory);

	assert.deepEqual(JSON.parse(output)['version-1.x'], [
		{ type: 'category', label: 'Error Codes', items: ['error-codes/legacy'] },
		generatedCategory,
		'support',
	]);
	assert.match(output, /\n  "version-1\.x"/);
	assert.doesNotMatch(output, /\n\t"version-1\.x"/);
});

test('inserts the generated category immediately after the legacy category', () => {
	const fixture = `{
\t"version-1.x": [
\t\t"intro",
\t\t{ "type": "category", "label": "Error Codes", "items": [] },
\t\t"support"
\t]
}
`;
	const output = spliceErrorDocsSidebar(fixture, generatedCategory);

	assert.deepEqual(JSON.parse(output)['version-1.x'], [
		'intro',
		{ type: 'category', label: 'Error Codes', items: [] },
		generatedCategory,
		'support',
	]);
	assert.match(output, /\n\t"version-1\.x"/);
});
