import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { parseAllDocuments } from 'yaml';

const flows = [
	['04-cash-sale.yml', 'PRODUCT_SEARCH'],
	['06-cart-quantity-editing.yml', 'PRODUCT_SEARCH'],
	['07-variation-add-to-cart.yml', 'VARIABLE_PRODUCT_SEARCH'],
];

function evaluate(expression, context) {
	const source = expression.slice(2, -1);
	return Function(...Object.keys(context), `"use strict"; return (${source});`)(
		...Object.values(context)
	);
}

function execute(commands, context, bursts) {
	for (const command of commands) {
		if (typeof command !== 'object') continue;
		if (command.evalScript) {
			evaluate(command.evalScript, context);
		} else if (command.inputText) {
			bursts.push(String(evaluate(command.inputText, context)));
		} else if (command.repeat) {
			while (evaluate(command.repeat.while.true, context)) {
				execute(command.repeat.commands, context, bursts);
			}
		}
	}
}

test('native product searches type no more than one key per Maestro command', () => {
	for (const [filename, variable] of flows) {
		const source = readFileSync(
			new URL(`../apps/main/.maestro/flows/${filename}`, import.meta.url),
			'utf8'
		);
		const [config, flow] = parseAllDocuments(source).map((document) => document.toJS());
		const retry = flow.find((command) => command.retry)?.retry.commands;
		const searchCommands = retry.slice(
			retry.findIndex((command) => command === 'eraseText') + 1,
			retry.findIndex((command) => command.assertVisible)
		);
		const context = { ...config.env, output: {} };
		const bursts = [];

		execute(searchCommands, context, bursts);

		assert.equal(bursts.join(''), config.env[variable], filename);
		assert.ok(bursts.every((burst) => [...burst].length === 1), filename);
	}
});
