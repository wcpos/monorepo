import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateRegistry } from './generate-event-labels.mjs';

/**
 * Fails when a sync-engine event type is emitted without a merchant-readable
 * label in packages/utils/src/logger/event-registry.json (monorepo#912).
 *
 * The Logs UI titles every row from the event's stable dotted type, translated
 * at render time. A type with no registry entry falls back to the raw code —
 * `coverage.existence-prime` in front of a merchant — so the closed set of
 * emitted types has to stay covered by construction rather than by whack-a-mole.
 *
 * Three rules, all checked here:
 *   1. Every emitted event type has a registry entry.
 *   2. Event types are quoted literals. Anything computed — `${lane}.tick`,
 *      `namespace + '.tick'`, a bare identifier — mints names no registry can
 *      enumerate, so it is rejected at source.
 *   3. Every registry entry carries a nonblank label. A `type` with no `label`
 *      is not coverage; it renders blank.
 *   4. Descriptions are optional, but a present description must be nonblank.
 */

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Sources that emit engine telemetry. Test files are excluded — fixtures invent types freely. */
export const EVENT_SOURCE_ROOTS = [
	'packages/sync-core/src',
	'packages/sync-engine/src',
	'apps/main/lib',
	// The receipt-email queue writes `context.type` rows the Logs UI titles the
	// same way (#165). Scoped to the queue directory rather than to all of
	// packages/core: every event this feature emits lives here by design, so the
	// gate stays enforcing instead of degrading to an unused-label warning.
	'packages/core/src/screens/main/receipt/email-queue',
];

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx']);
const TEST_FILE = /\.(test|spec)\.[jt]sx?$/;
/** A dotted event name in single or double quotes. */
const QUOTED_TYPE = /(['"])([a-z][a-z0-9_-]*(?:\.[a-z0-9_-]+)+)\1/g;
/** The two `SyncEvent` properties this script reads, wherever they are written. */
const EVENT_PROPERTY = /\b(type|level)\s*:/g;
/** A `SyncEvent` level as spelled at an emit site — the marker of an event literal. */
const EVENT_LEVEL = /(['"])(debug|info|warn|error)\1/;
/** A masked expression that is exactly one quoted string (its body is blanked). */
const MASKED_STRING = /^(['"]) *\1$/;
const OPENERS = '([{';
const CLOSERS = ')]}';

function quotedTypesIn(text) {
	const found = [];
	QUOTED_TYPE.lastIndex = 0;
	let match;
	while ((match = QUOTED_TYPE.exec(text)) !== null) found.push(match[2]);
	return found;
}

/** Index just past the string literal opening at `start`, or the line end if unterminated. */
function endOfQuoted(source, start) {
	const quote = source[start];
	for (let index = start + 1; index < source.length; index += 1) {
		if (source[index] === '\\') index += 1;
		else if (source[index] === quote) return index + 1;
		else if (source[index] === '\n') return index;
	}
	return source.length;
}

/** Index just past the template literal opening at `start`, `${…}` holes and all. */
function endOfTemplate(source, start) {
	let index = start + 1;
	while (index < source.length) {
		const char = source[index];
		if (char === '\\') index += 2;
		else if (char === '`') return index + 1;
		else if (char === '$' && source[index + 1] === '{') {
			let depth = 1;
			index += 2;
			while (index < source.length && depth > 0) {
				const inner = source[index];
				if (inner === '\\') index += 2;
				else if (inner === "'" || inner === '"') index = endOfQuoted(source, index);
				else if (inner === '`') index = endOfTemplate(source, index);
				else {
					if (inner === '{') depth += 1;
					else if (inner === '}') depth -= 1;
					index += 1;
				}
			}
		} else index += 1;
	}
	return source.length;
}

/**
 * A `/` here opens a regex literal rather than dividing — no value can precede
 * it. A bare `<` or `>` is deliberately NOT such an operator: in a .tsx source
 * it closes a JSX tag, and reading `</Text>` as a regex would blank a whole span
 * of real code. `=>` is the exception — `(url) => /…/.test(url)` is ordinary.
 */
function opensRegex(source, index) {
	const before = source.slice(0, index).trimEnd();
	if (before === '') return true;
	const last = before[before.length - 1];
	if ('([{,;:=!&|?+-*%~^'.includes(last)) return true;
	if (last === '>' && before[before.length - 2] === '=') return true;
	return /\b(return|typeof|case|in|of|do|else|yield|await|delete|void)$/.test(before.slice(-8));
}

/** Index just past the regex literal opening at `start`. A `/` inside a `[…]` class does not close it. */
function endOfRegex(source, start) {
	let inClass = false;
	for (let index = start + 1; index < source.length; index += 1) {
		const char = source[index];
		if (char === '\\') index += 1;
		else if (char === '[') inClass = true;
		else if (char === ']') inClass = false;
		else if (char === '/' && !inClass) return index + 1;
		else if (char === '\n') return index;
	}
	return source.length;
}

/**
 * The source with the *contents* of every comment, string, template and regex
 * blanked to spaces. Offsets, newlines and the quote delimiters survive, so an
 * index into the mask is the same index in the original text — which is what
 * lets a brace or property scan run without ever matching inside a literal.
 */
export function maskLiterals(source) {
	const masked = source.split('');
	const blank = (from, to) => {
		for (let index = from; index < to && index < masked.length; index += 1) {
			if (masked[index] !== '\n') masked[index] = ' ';
		}
	};
	let index = 0;
	while (index < source.length) {
		const char = source[index];
		if (char === "'" || char === '"') {
			const end = endOfQuoted(source, index);
			blank(index + 1, end - 1);
			index = end;
		} else if (char === '`') {
			const end = endOfTemplate(source, index);
			blank(index + 1, end - 1);
			index = end;
		} else if (char === '/' && source[index + 1] === '/') {
			const end = source.indexOf('\n', index);
			blank(index, end === -1 ? source.length : end);
			index = end === -1 ? source.length : end;
		} else if (char === '/' && source[index + 1] === '*') {
			const end = source.indexOf('*/', index + 2);
			blank(index, end === -1 ? source.length : end + 2);
			index = end === -1 ? source.length : end + 2;
		} else if (char === '/' && opensRegex(source, index)) {
			const end = endOfRegex(source, index);
			blank(index, end);
			index = end;
		} else index += 1;
	}
	return masked.join('');
}

/** Index of the bracket closing the one at `start`, or -1. */
function closingBracket(masked, start) {
	let depth = 0;
	for (let index = start; index < masked.length; index += 1) {
		if (OPENERS.includes(masked[index])) depth += 1;
		else if (CLOSERS.includes(masked[index])) {
			depth -= 1;
			if (depth === 0) return index;
		}
	}
	return -1;
}

/** Where a property value starting at `start` ends: the next top-level `,`, `;` or closer. */
function endOfValue(masked, start) {
	let depth = 0;
	for (let index = start; index < masked.length; index += 1) {
		const char = masked[index];
		if (OPENERS.includes(char)) depth += 1;
		else if (CLOSERS.includes(char)) {
			if (depth === 0) return index;
			depth -= 1;
		} else if (depth === 0 && (char === ',' || char === ';')) return index;
	}
	return masked.length;
}

/** The `?` of a ternary at the top level of `masked` — never `?.` or `??`. */
function ternaryQuestion(masked, from = 0) {
	let depth = 0;
	for (let index = from; index < masked.length; index += 1) {
		const char = masked[index];
		if (OPENERS.includes(char)) depth += 1;
		else if (CLOSERS.includes(char)) depth -= 1;
		else if (depth === 0 && char === '?') {
			if (masked[index + 1] === '?') index += 1;
			else if (masked[index + 1] !== '.') return index;
		}
	}
	return -1;
}

/** The `:` pairing with the ternary `?` at `question`, skipping nested ternaries. */
function ternaryColon(masked, question) {
	let depth = 0;
	let nested = 0;
	for (let index = question + 1; index < masked.length; index += 1) {
		const char = masked[index];
		if (OPENERS.includes(char)) depth += 1;
		else if (CLOSERS.includes(char)) depth -= 1;
		else if (depth === 0 && char === '?') {
			if (masked[index + 1] === '?') index += 1;
			else if (masked[index + 1] !== '.') nested += 1;
		} else if (depth === 0 && char === ':') {
			if (nested === 0) return index;
			nested -= 1;
		}
	}
	return -1;
}

/** An expression carried as the raw text plus its literal-blanked twin. */
const expressionOf = (source, masked, start, end) => ({
	raw: source.slice(start, end),
	masked: masked.slice(start, end),
});
const cut = (expression, start, end) => ({
	raw: expression.raw.slice(start, end),
	masked: expression.masked.slice(start, end),
});
/** Trim by the mask, so a leading comment goes with the whitespace. */
function trimExpression(expression) {
	const start = expression.masked.length - expression.masked.trimStart().length;
	return cut(expression, start, expression.masked.trimEnd().length);
}

/**
 * Every value the expression can produce, or `null` when any of them is
 * computed. A quoted literal yields one value and a ternary of literals yields
 * both branches (the condition is free to be computed — it picks between a
 * finite set of names, it does not mint one). A template, a concatenation, an
 * identifier or a `??` fallback yields `null`.
 */
export function literalValuesOf(expression) {
	const trimmed = trimExpression(expression);
	const { raw, masked } = trimmed;
	if (masked === '') return null;
	// Parentheses wrap a value, they do not compute one.
	if (masked.startsWith('(') && closingBracket(masked, 0) === masked.length - 1) {
		return literalValuesOf(cut(trimmed, 1, masked.length - 1));
	}
	// `'push.error' as const` narrows a literal; it stays a literal.
	const assertion = /\s+as\s+const$/.exec(masked);
	if (assertion) return literalValuesOf(cut(trimmed, 0, assertion.index));
	const question = ternaryQuestion(masked);
	if (question === -1) {
		if (!MASKED_STRING.test(masked)) return null;
		return [raw.slice(1, -1).replace(/\\(.)/g, '$1')];
	}
	const colon = ternaryColon(masked, question);
	if (colon === -1) return null;
	const consequent = literalValuesOf(cut(trimmed, question + 1, colon));
	const alternate = literalValuesOf(cut(trimmed, colon + 1, masked.length));
	return consequent && alternate ? [...consequent, ...alternate] : null;
}

/**
 * Every `type:` property in a source, paired with its value expression and with
 * whether it sits in a `SyncEvent` object literal — which is what a sibling
 * `level: 'info' | 'warn' | …` marks. Discriminating on the sibling matters
 * because these roots are full of unrelated `type:` properties: RxDB JSON
 * schemas (`type: 'object'`), scope-manager unions (`type: row.type`) and plain
 * TypeScript annotations (`type: string`). Rule 2 must fire on emitters only.
 */
export function typePropertiesIn(source) {
	const masked = maskLiterals(source);
	const stack = [];
	let cursor = 0;
	const properties = [];
	const eventLiterals = new Set();
	EVENT_PROPERTY.lastIndex = 0;
	let match;
	while ((match = EVENT_PROPERTY.exec(masked)) !== null) {
		for (; cursor < match.index; cursor += 1) {
			const char = masked[cursor];
			// Only `{` can open an object literal; `(` and `[` are recorded so the
			// stack stays balanced, and mark "the enclosing thing is not a literal".
			if (OPENERS.includes(char)) stack.push(char === '{' ? cursor : -1);
			else if (CLOSERS.includes(char)) stack.pop();
		}
		const enclosing = stack.length === 0 ? -1 : stack[stack.length - 1];
		const start = match.index + match[0].length;
		const expression = expressionOf(source, masked, start, endOfValue(masked, start));
		const line = source.slice(0, match.index).split('\n').length;
		if (match[1] === 'level') {
			if (enclosing !== -1 && EVENT_LEVEL.test(expression.raw)) eventLiterals.add(enclosing);
		} else properties.push({ enclosing, expression, line });
	}
	return properties.map((property) => ({
		expression: property.expression,
		line: property.line,
		isEvent: eventLiterals.has(property.enclosing),
	}));
}

/** Roots may be repo-relative (the real sources) or absolute (test fixtures). */
const resolveRoot = (root) => (path.isAbsolute(root) ? root : path.join(repoRoot, root));

async function listSourceFiles(root) {
	const entries = await readdir(resolveRoot(root), { withFileTypes: true });
	const files = await Promise.all(
		entries.map(async (entry) => {
			const child = path.join(root, entry.name);
			if (entry.isDirectory()) return listSourceFiles(child);
			if (!SOURCE_EXTENSIONS.has(path.extname(entry.name))) return [];
			if (TEST_FILE.test(entry.name)) return [];
			return [child];
		})
	);
	return files.flat();
}

/**
 * Every event type emitted under `roots`, mapped to the files that emit it.
 * Throws on a computed type so rule 2 fails loudly at its source line.
 *
 * Two passes, because emitters do not all spell the type out at the `type:`
 * property — `emitCount('apply.pull', …)` passes it to a helper:
 *   1. every `type:` right-hand side (covers ternaries such as
 *      `type: aborted ? 'push.aborted' : 'push.error'`), which establishes the
 *      event namespaces in use;
 *   2. every dotted string literal in a namespace pass 1 or the registry knows,
 *      which catches the helper-argument form.
 * A type invented in a brand-new namespace AND passed only through a helper is
 * the one shape that escapes; the `type:` form used everywhere today does not.
 */
export async function collectEmittedEventTypes(roots = EVENT_SOURCE_ROOTS, knownTypes = []) {
	const emitted = new Map();
	const computed = [];
	const sources = [];
	const record = (type, file) => emitted.set(type, [...(emitted.get(type) ?? []), file]);
	for (const root of roots) {
		for (const file of await listSourceFiles(root)) {
			const source = await readFile(resolveRoot(file), 'utf8');
			sources.push([file, source]);
			for (const property of typePropertiesIn(source)) {
				const values = literalValuesOf(property.expression);
				// A template literal is computed wherever it is written; anywhere else
				// only an emitter's `type:` is held to rule 2.
				const template = property.expression.masked.includes('`');
				if (values === null && (template || property.isEvent)) {
					computed.push(`${file}:${property.line}  type: ${property.expression.raw.trim()}`);
					continue;
				}
				for (const type of quotedTypesIn(property.expression.raw)) record(type, file);
			}
		}
	}
	if (computed.length > 0) {
		throw new Error(
			`Computed event types are not allowed — they cannot be labelled:\n  ${computed.join(
				'\n  '
			)}\nEmit a literal type and put the variable part in \`fields\`.`
		);
	}

	const namespaces = new Set(
		[...emitted.keys(), ...knownTypes].map((type) => type.slice(0, type.indexOf('.')))
	);
	for (const [file, source] of sources) {
		for (const type of quotedTypesIn(source)) {
			if (namespaces.has(type.slice(0, type.indexOf('.')))) record(type, file);
		}
	}
	return emitted;
}

export const REGISTRY_PATH = path.join(repoRoot, 'packages/utils/src/logger/event-registry.json');

export async function readRegistry(registryPath = REGISTRY_PATH) {
	return JSON.parse(await readFile(registryPath, 'utf8'));
}

/**
 * Missing labels (a failure) and registry entries nothing emits (a warning).
 * An entry counts as labelled only when it actually carries label text — a bare
 * `type` with no `label` would otherwise buy a type out of rule 1 while still
 * rendering blank in front of a merchant.
 */
export function diffAgainstRegistry(emitted, registry) {
	const labelled = new Set(
		registry
			.filter((entry) => typeof entry?.label === 'string' && entry.label.trim() !== '')
			.map((entry) => entry.type)
	);
	const missing = [...emitted.keys()].filter((type) => !labelled.has(type)).sort();
	const unused = registry
		.map((entry) => entry?.type)
		.filter((type) => !emitted.has(type))
		.sort();
	return { missing, unused };
}

export async function checkEventLabels(registryPath = REGISTRY_PATH) {
	const registry = await readRegistry(registryPath);
	// Rule 3. The generator validates on its way to the generated catalogue, but
	// `pnpm test:scripts` runs this checker on its own — so a registry that would
	// never generate must not pass here either.
	validateRegistry(registry);
	const emitted = await collectEmittedEventTypes(
		EVENT_SOURCE_ROOTS,
		registry.map((entry) => entry.type)
	);
	const { missing, unused } = diffAgainstRegistry(emitted, registry);
	if (unused.length > 0) {
		console.warn(
			`⚠ event-registry.json labels ${unused.length} type(s) nothing emits: ${unused.join(', ')}`
		);
	}
	if (missing.length > 0) {
		const detail = missing
			.map((type) => `  ${type}  (${[...new Set(emitted.get(type))].join(', ')})`)
			.join('\n');
		throw new Error(
			`${missing.length} sync event type(s) have no merchant-readable label:\n${detail}\n` +
				'Add an entry to packages/utils/src/logger/event-registry.json, then run `pnpm generate:event-labels`.'
		);
	}
	console.log(`✓ ${emitted.size} sync event types all have labels`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	if (process.argv.includes('--list')) {
		collectEmittedEventTypes()
			.then((emitted) => {
				for (const type of [...emitted.keys()].sort()) {
					console.log(`${type}\t${[...new Set(emitted.get(type))].join(' ')}`);
				}
			})
			.catch((error) => {
				console.error(error instanceof Error ? error.message : error);
				process.exitCode = 1;
			});
	} else {
		const flag = process.argv.indexOf('--registry');
		const registryPath = flag === -1 ? REGISTRY_PATH : path.resolve(process.argv[flag + 1]);
		checkEventLabels(registryPath).catch((error) => {
			console.error(error instanceof Error ? error.message : error);
			process.exitCode = 1;
		});
	}
}
