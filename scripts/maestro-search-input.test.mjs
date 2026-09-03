import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
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
	return Function(
		...Object.keys(context),
		`"use strict"; return (${source});`
	)(...Object.values(context));
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

function maestroInterpolations(source) {
	const expressions = [];
	let start = source.indexOf('${');

	while (start !== -1) {
		let depth = 1;
		let end = start + 2;
		while (end < source.length && depth > 0) {
			if (source[end] === '{') depth++;
			if (source[end] === '}') depth--;
			end++;
		}
		if (depth > 0) break;
		expressions.push(source.slice(start, end));
		start = source.indexOf('${', end);
	}

	return expressions;
}

/**
 * The typed-URL assert: a direct `assertVisible` in the retry, or (flow 02) the
 * same assert wrapped in a conditional `runFlow` that skips it when the sign-in
 * consent alert is already over the field. Returns the assert command or null.
 */
function urlAssert(command) {
	if (command?.assertVisible?.text) return command.assertVisible;
	const nested = command?.runFlow?.commands?.find((inner) => inner?.assertVisible?.text);
	return nested ? nested.assertVisible : null;
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
			retry.findIndex((command) => urlAssert(command))
		);
		const context = { ...config.env, output: {} };
		const bursts = [];

		execute(searchCommands, context, bursts);

		assert.equal(bursts.join(''), config.env[variable], filename);
		assert.ok(
			bursts.every((burst) => [...burst].length === 1),
			filename
		);
	}
});

// Maestro evaluates `${...}` with `(?<!\\)\$\{([^$]*)}` (Env.kt, cli-2.6.1): the
// script body may not contain a `$`, or the expression is left unevaluated and a
// text selector becomes literal garbage. The general-purpose escape
// `/[.*+?^${}()|[\]\\]/g` + `'\\$&'` therefore cannot be used here; the two URLs
// carry dots as their only metacharacter, so dots are what get escaped.
test('native URL retries clear existing text and safely assert the typed URL', () => {
	const literal = 'https://dev-pro.wcpos.com';

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
		assert.equal(retry[0]?.runFlow?.when?.visible?.id, 'store-url-clear', filename);
		assert.equal(
			retry[0]?.runFlow?.commands?.[0]?.tapOn?.id,
			'store-url-clear',
			filename
		);
		assert.equal(retry[1]?.tapOn?.id, 'store-url-input', filename);
		assert.equal(retry[2], 'eraseText', filename);
		const selector = retry.map(urlAssert).find(Boolean).text;
		const pattern = evaluate(selector, { ...config.env, [variable]: literal });

		assert.equal(pattern, 'https://dev-pro\\.wcpos\\.com', filename);
		assert.match(literal, new RegExp(`^(?:${pattern})$`), filename);
		assert.doesNotMatch('https://dev-proXwcposYcom', new RegExp(`^(?:${pattern})$`), filename);
	}
});

test('no Maestro interpolation carries a `$` inside `${...}`', () => {
	const offenders = [];
	for (const dir of ['flows', 'subflows']) {
		const base = new URL(`../apps/main/.maestro/${dir}/`, import.meta.url);
		for (const name of readdirSync(base).filter((entry) => entry.endsWith('.yml'))) {
			const source = readFileSync(new URL(name, base), 'utf8');
			for (const expression of maestroInterpolations(source)) {
				if (expression.slice(2, -1).includes('$')) {
					offenders.push(`${dir}/${name}: ${expression}`);
				}
			}
		}
	}
	assert.deepEqual(offenders, [], 'Maestro leaves such an expression unevaluated');
});

test('Maestro interpolation scanner consumes nested braces', () => {
	const expression = "${STORE_URL.replace(/a{2}$/, '')}";
	const [interpolation] = maestroInterpolations(expression);

	assert.equal(interpolation, expression);
	assert.equal(interpolation.slice(2, -1).includes('$'), true);
});
