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
			[`\t\tcase ${quote(entry.type)}:`, `\t\t\treturn t(${quote(labelKey(entry.type))});`].join(
				'\n'
			)
		)
		.join('\n');
	return `${BANNER}
import type { SyncEventType } from '@wcpos/utils/logger/generated/event-labels.generated';

/** The translate function shape \`useT()\` returns. */
type TranslateEvent = (key: string) => string;

/**
 * Merchant-readable title for an engine event, translated at render time.
 * One literal \`t()\` call per type — a dynamic key is invisible to the string
 * extractor, so translators would never see it.
 *
 * No \`defaultValue\`: the English catalogue is bundled statically and is the
 * fallback language, and this generator writes those strings into it from the
 * registry. A defaultValue here would be a third copy of every label that
 * nothing renders — and one this generator could silently drift from.
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

/**
 * The English source strings the generated `t()` calls resolve against. The
 * registry owns this block of the catalogue, so editing a label and running the
 * generator is all it takes for the change to reach the screen.
 *
 * Only `health.logs.event.*` keys are touched: every other key keeps its value
 * AND its position, and the block itself is rewritten where it already sits, so
 * the diff stays to the labels that actually changed.
 */
export function renderLocale(registry, source) {
	const existing = Object.entries(source);
	const anchor = existing.findIndex(([key]) => key.startsWith(KEY_PREFIX));
	const untouched = existing.filter(([key]) => !key.startsWith(KEY_PREFIX));
	const block = registry.map((entry) => [labelKey(entry.type), entry.label]);
	const at = anchor === -1 ? untouched.length : anchor;
	const merged = [...untouched.slice(0, at), ...block, ...untouched.slice(at)];
	return `${JSON.stringify(Object.fromEntries(merged), null, '\t')}\n`;
}

function parseArguments(args) {
	const localePath = path.join(
		repoRoot,
		'packages/core/src/contexts/translations/locales/en/core.json'
	);
	const options = {
		registry: path.join(repoRoot, 'packages/utils/src/logger/event-registry.json'),
		catalogueDirectory: path.join(repoRoot, 'packages/utils/src/logger/generated'),
		titlesDirectory: path.join(repoRoot, 'packages/core/src/screens/main/logs/generated'),
		localeSource: localePath,
		localeOutput: localePath,
	};
	for (let index = 0; index < args.length; index += 2) {
		if (args[index] === '--registry') options.registry = path.resolve(args[index + 1]);
		else if (args[index] === '--output-dir') {
			// Test mode: every artifact lands in one throwaway directory, and the
			// real English catalogue is read but never written.
			const directory = path.resolve(args[index + 1]);
			options.catalogueDirectory = directory;
			options.titlesDirectory = directory;
			options.localeOutput = path.join(directory, 'core.json');
		} else throw new Error(`Unknown argument: ${args[index]}`);
	}
	return options;
}

export async function generateEventLabels(options = parseArguments([])) {
	const registry = JSON.parse(await readFile(options.registry, 'utf8'));
	validateRegistry(registry);
	const locale = JSON.parse(await readFile(options.localeSource, 'utf8'));
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
		writeFile(options.localeOutput, renderLocale(registry, locale)),
	]);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	generateEventLabels(parseArguments(process.argv.slice(2))).catch((error) => {
		console.error(error instanceof Error ? error.message : error);
		process.exitCode = 1;
	});
}
