import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const turbo = path.join(ROOT, 'node_modules', '.bin', 'turbo');
const result = spawnSync(
	turbo,
	[
		'run',
		'build',
		'--filter=@wcpos/main',
		'--filter=@wcpos/scanner',
		'--filter=@wcpos/sync-core',
		'--filter=@wcpos/sync-engine',
		'--dry=json',
	],
	{ cwd: ROOT, encoding: 'utf8' }
);

assert.equal(result.status, 0, result.stdout + result.stderr);
const plan = JSON.parse(result.stdout);

function inputsFor(taskId) {
	const task = plan.tasks.find(({ taskId: id }) => id === taskId);
	assert.ok(task, `missing ${taskId} from Turbo dry run`);
	return new Set(Object.keys(task.inputs));
}

test('TypeScript tests consumed by package builds remain build inputs', () => {
	assert.ok(inputsFor('@wcpos/scanner#build').has('src/analyze-trace.test.ts'));
	assert.ok(inputsFor('@wcpos/sync-core#build').has('src/applyReplicationActions.test.ts'));
	assert.ok(inputsFor('@wcpos/sync-engine#build').has('src/automatic-tick-gate.test.ts'));
});

test('JavaScript plugin tests do not invalidate the main app build', () => {
	assert.ok(!inputsFor('@wcpos/main#build').has('plugins/with-printer-support.test.js'));
	assert.ok(!inputsFor('@wcpos/main#build').has('plugins/with-wedge-key-events.test.js'));
});
