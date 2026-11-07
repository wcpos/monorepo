import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { parseAllDocuments } from 'yaml';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MAESTRO = path.join(ROOT, 'apps/main/.maestro');
const REACHED_SUBFLOW = '../subflows/cart-add-reached-handler.yml';

const commandsOf = (file) =>
	parseAllDocuments(readFileSync(path.join(MAESTRO, file), 'utf8'))
		.at(-1)
		.toJS();

/** Yield every command list in a flow together with the runFlow `when` that guards it. */
function* branches(commands, when = null) {
	yield { commands, when };
	for (const command of commands) {
		for (const nested of [command.runFlow, command.retry, command.repeat]) {
			if (nested?.commands) yield* branches(nested.commands, nested.when ?? null);
		}
	}
}

const tapsTile = (command) => command.tapOn?.id === 'product-tile';
const setsRetried = (command) =>
	typeof command.evalScript === 'string' && command.evalScript.includes('cartAddRetried = true');

for (const flow of ['flows/04-cash-sale.yml', 'flows/06-cart-quantity-editing.yml']) {
	test(`${flow}: the cart re-add runs only when the tap did not reach the add handler`, () => {
		const all = [...branches(commandsOf(flow))];
		const reAdd = all.filter(({ commands }) => commands.some(setsRetried));
		assert.equal(reAdd.length, 1, 'exactly one branch sets cartAddRetried = true');
		const [{ commands, when }] = reAdd;
		assert.ok(commands.some(tapsTile), 'the re-add branch re-taps product-tile');
		assert.match(String(when?.true), /output\.cartAddReachedHandler !== true/);

		const parent = all.find(({ commands: list }) =>
			list.some((command) => command.runFlow?.commands === commands)
		);
		assert.ok(parent, 'the re-add runFlow sits in a parent branch');
		const reachedAt = parent.commands.findIndex(
			(command) => command.runFlow?.file === REACHED_SUBFLOW
		);
		const reAddAt = parent.commands.findIndex((command) => command.runFlow?.commands === commands);
		assert.ok(reachedAt >= 0, 'cart-add-reached-handler.yml runs in the same branch');
		assert.ok(reachedAt < reAddAt, 'cart-add-reached-handler.yml runs before the re-add');
	});
}

function reachedHandler(sequence, cartAddSequence) {
	const evalCommand = commandsOf('subflows/cart-add-reached-handler.yml').find(
		({ evalScript }) =>
			typeof evalScript === 'string' && evalScript.includes('cartAddReachedHandler')
	).evalScript;
	const output = { cartAddSequence };
	const maestro = { copiedText: JSON.stringify({ sequence, status: 'pending' }) };
	Function('output', 'maestro', evalCommand.slice(2, -1))(output, maestro);
	return output.cartAddReachedHandler;
}

test('cart-add-reached-handler.yml: only a sequence past the captured one counts as reached', () => {
	assert.equal(reachedHandler(4, 4), false);
	assert.equal(reachedHandler(5, 4), true);
	assert.equal(reachedHandler(0, 0), false);
});
