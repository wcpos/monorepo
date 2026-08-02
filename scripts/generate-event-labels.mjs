import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Generates the sync event-label catalogue from event-registry.json (monorepo#912).
 *
 * The Logs UI persists the stable dotted event type and titles the row at
 * RENDER time, so a log written on a Spanish till reads in whatever language
 * the till runs later. Two artifacts come out of the registry:
 *
 *   packages/utils/src/logger/generated/event-labels.generated.ts
 *     the type union + machine-readable catalogue (English label, i18n key).
 *
 *   packages/core/src/screens/main/logs/generated/event-titles.generated.ts
 *     one literal `t()` call per event type. Literal, because the string
 *     extractor (scripts/extract-js-strings.js) only sees `t('literal')` — a
 *     dynamic key would never reach translators.
 */

const BANNER = '// GENERATED — do not edit by hand; run pnpm generate:event-labels';
const DOMAINS = ['AUTH', 'SYNC', 'CHECKOUT', 'PAYMENT', 'PRINT', 'PRODUCT', 'LICENSE', 'CLIENT'];
const FIELDS = ['type', 'domain', 'label', 'introducedIn'];
const KEY_PREFIX = 'health.logs.event.';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** `queue.write.tick.error` → `health.logs.event.queue_write_tick_error`. */
export function labelKey(type) {
	return `${KEY_PREFIX}${type.replace(/[.-]/g, '_')}`;
}

const quote = (value) => `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;

export function validateRegistry(registry) {
	if (!Array.isArray(registry)) throw new Error('Registry must be a JSON array');
	const types = new Set();
	const keys = new Set();
	let previous = '';
	for (const [index, entry] of registry.entries()) {
		if (!entry || typeof entry !== 'object') throw new Error(`Entry ${index} must be an object`);
		for (const field of FIELDS) {
			if (typeof entry[field] !== 'string' || !entry[field].trim()) {
				throw new Error(`Entry ${index} is missing required field ${field}`);
			}
		}
		if (!DOMAINS.includes(entry.domain)) {
			throw new Error(`Entry ${entry.type} has unknown domain: ${entry.domain}`);
		}
		if (!/^[a-z][a-z0-9_-]*(\.[a-z0-9_-]+)+$/.test(entry.type)) {
			throw new Error(`Entry ${entry.type} is not a dotted event type`);
		}
		if (types.has(entry.type)) throw new Error(`Duplicate type: ${entry.type}`);
		const key = labelKey(entry.type);
		if (keys.has(key)) throw new Error(`Duplicate translation key: ${key}`);
		// Sorted by type so the registry diffs cleanly as it grows.
		if (entry.type < previous) throw new Error(`Registry is not sorted: ${entry.type}`);
		previous = entry.type;
		types.add(entry.type);
		keys.add(key);
	}
}

function renderCatalogue(registry) {
	const types = registry.map((entry) => `\t${quote(entry.type)},`).join('\n');
	const entries = registry
		.map((entry) =>
			[
				`\t${quote(entry.type)}: {`,
				`\t\ttype: ${quote(entry.type)},`,
				`\t\tdomain: ${quote(entry.domain)},`,
				`\t\tkey: ${quote(labelKey(entry.type))},`,
				`\t\tlabel: ${quote(entry.label)},`,
				`\t\tintroducedIn: ${quote(entry.introducedIn)},`,
				'\t},',
			].join('\n')
		)
		.join('\n');
	return `${BANNER}

/**
 * Every sync-engine event type, as persisted in a log row's \`context.type\`.
 * The set is closed by construction: scripts/check-event-labels.mjs fails CI
 * when the engine emits a type this registry does not label.
 */
export const SYNC_EVENT_TYPES = [
${types}
] as const;

export type SyncEventType = (typeof SYNC_EVENT_TYPES)[number];

export interface EventLabelEntry {
	type: SyncEventType;
	domain: string;
	/** i18n key the UI translates at render time. */
	key: string;
	/** Source-of-truth English, mirrored as the \`t()\` call's defaultValue. */
	label: string;
	introducedIn: string;
}

export const EVENT_LABELS: Record<SyncEventType, EventLabelEntry> = {
${entries}
};

const EVENT_TYPE_SET: ReadonlySet<string> = new Set(SYNC_EVENT_TYPES);

/** Narrows a persisted \`context.type\` — unknown types keep their raw code on screen. */
export function isSyncEventType(value: unknown): value is SyncEventType {
	return typeof value === 'string' && EVENT_TYPE_SET.has(value);
}
`;
}

function renderTitles(registry) {
	const cases = registry
		.map((entry) =>
			[
				`\t\tcase ${quote(entry.type)}:`,
				`\t\t\treturn t(${quote(labelKey(entry.type))}, {`,
				`\t\t\t\tdefaultValue: ${quote(entry.label)},`,
				'\t\t\t});',
			].join('\n')
		)
		.join('\n');
	return `${BANNER}
import type { SyncEventType } from '@wcpos/utils/logger/generated/event-labels.generated';

/** The translate function shape \`useT()\` returns. */
type TranslateEvent = (key: string, options: { defaultValue: string }) => string;

/**
 * Merchant-readable title for an engine event, translated at render time.
 * One literal \`t()\` call per type — a dynamic key is invisible to the string
 * extractor, so translators would never see it.
 */
export function translateEventTitle(t: TranslateEvent, type: SyncEventType): string {
	switch (type) {
${cases}
		default: {
			const exhaustive: never = type;
			return exhaustive;
		}
	}
}
`;
}

function parseArguments(args) {
	const options = {
		registry: path.join(repoRoot, 'packages/utils/src/logger/event-registry.json'),
		catalogueDirectory: path.join(repoRoot, 'packages/utils/src/logger/generated'),
		titlesDirectory: path.join(repoRoot, 'packages/core/src/screens/main/logs/generated'),
	};
	for (let index = 0; index < args.length; index += 2) {
		if (args[index] === '--registry') options.registry = path.resolve(args[index + 1]);
		else if (args[index] === '--output-dir') {
			options.catalogueDirectory = path.resolve(args[index + 1]);
			options.titlesDirectory = path.resolve(args[index + 1]);
		} else throw new Error(`Unknown argument: ${args[index]}`);
	}
	return options;
}

export async function generateEventLabels(options = parseArguments([])) {
	const registry = JSON.parse(await readFile(options.registry, 'utf8'));
	validateRegistry(registry);
	await mkdir(options.catalogueDirectory, { recursive: true });
	await mkdir(options.titlesDirectory, { recursive: true });
	await Promise.all([
		writeFile(
			path.join(options.catalogueDirectory, 'event-labels.generated.ts'),
			renderCatalogue(registry)
		),
		writeFile(
			path.join(options.titlesDirectory, 'event-titles.generated.ts'),
			renderTitles(registry)
		),
	]);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	generateEventLabels(parseArguments(process.argv.slice(2))).catch((error) => {
		console.error(error instanceof Error ? error.message : error);
		process.exitCode = 1;
	});
}
