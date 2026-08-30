import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { parseAllDocuments } from 'yaml';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function readRecoveryCommands() {
	const documents = parseAllDocuments(
		readFileSync(
			path.join(ROOT, 'apps', 'main', '.maestro', 'subflows', 'recover-dev-launcher.yml'),
			'utf8'
		)
	);
	return documents.at(-1).toJS();
}

// These parsed-command checks pin Maestro configuration that can only execute
// against expo-dev-launcher's native UI. The screen text itself was captured on
// the iOS tablet in run 33302195102; these tests guard how the suite responds.
test('launcher recovery reloads only the localhost manifest-timeout screen', () => {
	const commands = readRecoveryCommands();
	const guardedReload = commands[0].repeat.commands[0].runFlow.commands[1].runFlow;

	assert.equal(
		guardedReload.when.visible.text,
		'Failed to load app from http://localhost:8081 with error: The request timed out.*'
	);
});

test('launcher recovery observes the final Reload outcome before returning', () => {
	const commands = readRecoveryCommands();

	assert.deepEqual(commands[1], {
		extendedWaitUntil: {
			visible: { id: '${APP_READY_TESTID}' },
			timeout: 15000,
			optional: true,
		},
	});
});
