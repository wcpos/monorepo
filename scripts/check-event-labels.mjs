import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Fails when a sync-engine event type is emitted without a merchant-readable
 * label in packages/utils/src/logger/event-registry.json (monorepo#912).
 *
 * The Logs UI titles every row from the event's stable dotted type, translated
 * at render time. A type with no registry entry falls back to the raw code —
 * `coverage.existence-prime` in front of a merchant — so the closed set of
 * emitted types has to stay covered by construction rather than by whack-a-mole.
 *
 * Two rules, both checked here:
 *   1. Every emitted event type has a registry entry.
 *   2. Event types are string literals. A computed type (`${lane}.tick`) mints
 *      names no registry can enumerate, so it is rejected at source.
 */

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Sources that emit engine telemetry. Test files are excluded — fixtures invent types freely. */
export const EVENT_SOURCE_ROOTS = [
	'packages/sync-core/src',
	'packages/sync-engine/src',
	'apps/main/lib',
];

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx']);
const TEST_FILE = /\.(test|spec)\.[jt]sx?$/;
/** The `type:` property's right-hand side, up to the end of its line. */
const TYPE_EXPRESSION = /\btype:\s*([^\n]*)/g;
/** A dotted event name in single or double quotes. */
const QUOTED_TYPE = /(['"])([a-z][a-z0-9_-]*(?:\.[a-z0-9_-]+)+)\1/g;
/** `type: \`…\`` — a computed event type. */
const TEMPLATE_TYPE = /\btype:\s*`/g;

function quotedTypesIn(text) {
	const found = [];
	QUOTED_TYPE.lastIndex = 0;
	let match;
	while ((match = QUOTED_TYPE.exec(text)) !== null) found.push(match[2]);
	return found;
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
	for (const root of roots) {
		for (const file of await listSourceFiles(root)) {
			const source = await readFile(resolveRoot(file), 'utf8');
			sources.push([file, source]);
			TEMPLATE_TYPE.lastIndex = 0;
			let template;
			while ((template = TEMPLATE_TYPE.exec(source)) !== null) {
				const line = source.slice(0, template.index).split('\n').length;
				computed.push(`${file}:${line}`);
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

	const record = (type, file) => emitted.set(type, [...(emitted.get(type) ?? []), file]);
	for (const [file, source] of sources) {
		TYPE_EXPRESSION.lastIndex = 0;
		let match;
		while ((match = TYPE_EXPRESSION.exec(source)) !== null) {
			for (const type of quotedTypesIn(match[1])) record(type, file);
		}
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

/** Missing labels (a failure) and registry entries nothing emits (a warning). */
export function diffAgainstRegistry(emitted, registry) {
	const labelled = new Set(registry.map((entry) => entry.type));
	const missing = [...emitted.keys()].filter((type) => !labelled.has(type)).sort();
	const unused = [...labelled].filter((type) => !emitted.has(type)).sort();
	return { missing, unused };
}

export async function checkEventLabels(registryPath = REGISTRY_PATH) {
	const registry = await readRegistry(registryPath);
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
