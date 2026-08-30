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
test('launcher recovery triggers on the launcher-screen TITLE, not one error body', () => {
	const commands = readRecoveryCommands();
	const guardedReload = commands[0].repeat.commands[0].runFlow.commands[1].runFlow;
	const title = 'There was a problem loading the project.*';

	// The manifest timeout is one CAUSE; the launcher shows this same screen,
	// with the same Reload button, for every load failure (a 5xx or a JSON error
	// from Metro included), each with its own body line. Triggering on a body
	// would drop recovery for all of those, and the body is also the line that
	// carries a URL and wraps or truncates on a narrow device. The title is the
	// screen's invariant, captured on run 33302195102's failure screenshot.
	assert.equal(guardedReload.when.visible.text, title);

	// The trigger and the "still broken" assertion must name the SAME screen —
	// tapping Reload for one set of errors while failing on another would leave
	// a recoverable launcher unrecovered.
	assert.equal(commands.at(-1).assertNotVisible.text, title);
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
