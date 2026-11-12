import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { parseAllDocuments } from 'yaml';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const commands = parseAllDocuments(
	readFileSync(path.join(ROOT, 'apps/main/.maestro/subflows/ensure-pos-ready.yml'), 'utf8')
)
	.at(-1)
	.toJS();

// The labels both platforms gave the picker rows in run 43121066541 (dev-pro 24128).
const SUITE_ROW = 'Register, Abierta desde 22:11 · Demo Cashier';
const CLIMB_ROW = 'Climb Register, Abierta desde 22:17 · e2e-cashier-2';

test('ensure-pos-ready picks the suite register when the picker is up', () => {
	const guard = commands.find((step) => step.runFlow?.when?.visible?.id === 'register-bar-pill')?.runFlow;
	assert.ok(guard, 'ensure-pos-ready checks the register bar pill');
	const pick = guard.commands.find((step) => step.runFlow?.when?.visible?.id === 'register-picker-row-.*');
	assert.ok(pick, 'the guard checks for a picker row');
	const tap = pick.runFlow.commands.find((step) => step.tapOn).tapOn;
	assert.equal(tap.id, 'register-picker-row-.*');
	// Maestro text selectors are full-match regexes.
	const name = new RegExp(`^(?:${tap.text})$`);
	assert.ok(name.test(SUITE_ROW), `${tap.text} must match the suite's own row`);
	assert.ok(!name.test(CLIMB_ROW), `${tap.text} must not match "Climb Register"`);
	assert.ok(
		pick.runFlow.commands.some((step) => /WCPOS_E2E register picker shown/.test(step.evalScript ?? '')),
		'the recovery guard logs'
	);
});
