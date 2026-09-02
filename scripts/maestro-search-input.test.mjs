import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { parseAllDocuments } from 'yaml';

const flows = [
	['04-cash-sale.yml', 'PRODUCT_SEARCH'],
	['06-cart-quantity-editing.yml', 'PRODUCT_SEARCH'],
	['07-variation-add-to-cart.yml', 'VARIABLE_PRODUCT_SEARCH'],
];

const urlFlows = [
	['01-clean-launch-connect.yml', 'INVALID_URL'],
	['02-auth-setup.yml', 'STORE_URL'],
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
		// Flows carry more than one retry block (the relaunch login-tab guard wraps
		// its readiness wait in one, PR #1750) — the typing loop is the retry that
		// starts by erasing the search field.
		const retry = flow
			.map((command) => command?.retry?.commands)
			.find((commands) => Array.isArray(commands) && commands.includes('eraseText'));
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

test('native URL assertions treat every regex metacharacter literally', () => {
	const literal = 'https://store.test/a+b?(c)[d]{2}|^$';
	const escaped = literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

	for (const [filename, variable] of urlFlows) {
		const source = readFileSync(
			new URL(`../apps/main/.maestro/flows/${filename}`, import.meta.url),
			'utf8'
		);
		const [config, flow] = parseAllDocuments(source).map((document) => document.toJS());
		const retry = flow
			.map((command) => command?.retry?.commands)
			.find((commands) =>
				commands?.some((command) => command.repeat?.while?.true?.includes(variable))
			);
		const selector = retry.find((command) => command.assertVisible?.text).assertVisible.text;
		const pattern = evaluate(selector, { ...config.env, [variable]: literal });

		assert.equal(pattern, escaped, filename);
		assert.match(literal, new RegExp(`^(?:${pattern})$`), filename);
	}
});
