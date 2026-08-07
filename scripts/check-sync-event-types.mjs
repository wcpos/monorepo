import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { collectEmittedEventTypes, maskLiterals } from './check-event-labels.mjs';

/**
 * Fails when the sync engine emits an event type that is not a member of
 * `SyncEventType` in packages/sync-core/src/telemetry.ts.
 *
 * That union is what makes the cashier-log observer's conformance table TOTAL
 * (`satisfies Record<SyncEventType, …>` in apps/main/lib/sync-log-observer.ts):
 * every type has to carry an explicit row, so a new engine event cannot land in
 * the FAILURE bucket of a merchant's log by inheriting a default. The union can
 * only do that job while it actually lists what the engine emits — nothing in
 * TypeScript notices a `diagnostics({ type: 'brand.new' })` that no one declared,
 * because the emitter is checked AGAINST the union, not the other way round.
 *
 * So this is the other direction, the same trick as the label gate next door
 * (check-event-labels.mjs, whose scanner this reuses): read the emitted literals
 * out of the sources, read the declared members out of the union, and diff.
 *
 * Two findings:
 *   1. Emitted but not declared — a build failure waiting to happen, reported
 *      here with the file that emits it. (Hard error.)
 *   2. Declared but emitted nowhere — a stale member, and with it a stale
 *      conformance row. (Warning: the scanner reads emit sites in the sync
 *      sources only, so a legitimately host-emitted type would false-positive.)
 *
 * It then checks the observer's conformance table against the same union, both
 * ways. That duplicates what `satisfies Record<SyncEventType, …>` already proves
 * to the compiler, on purpose: apps/main has no `typecheck` task in CI (13
 * pre-existing tsc errors keep it out), so nothing would FAIL a merge on the
 * satisfies clause alone. The clause stays as the developer-time signal — it is
 * the one that names the missing key in your editor — and this is the gate that
 * actually blocks, until apps/main earns a typecheck task of its own.
 */

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Where sync events are emitted from. The receipt-email queue is NOT one: its
 *  `email.queue.*` rows are logger rows, never `SyncEvent`s. */
export const SYNC_EVENT_SOURCE_ROOTS = [
	'packages/sync-core/src',
	'packages/sync-engine/src',
	'apps/main/lib',
];

/**
 * Files that NAME the whole vocabulary without emitting any of it: the union
 * itself and the two consumers that switch on it. Every type appears in them, so
 * counting them as emitters would make finding 2 vacuous.
 */
export const MENTION_ONLY_FILES = new Set([
	'packages/sync-core/src/telemetry.ts',
	'apps/main/lib/sync-log-observer.ts',
	'apps/main/lib/sync-status.ts',
]);

export const TELEMETRY_PATH = path.join(repoRoot, 'packages/sync-core/src/telemetry.ts');
export const OBSERVER_PATH = path.join(repoRoot, 'apps/main/lib/sync-log-observer.ts');

const UNION_DECLARATION = 'export type SyncEventType =';
const TABLE_DECLARATION = 'const CONFORMANCE_TABLE = {';

/**
 * The members of the `SyncEventType` union.
 *
 * Read off the literal-blanked twin of the source rather than the raw text: a
 * quote that survives masking is a real string delimiter, so a dotted name
 * written inside a comment in the middle of the union cannot be mistaken for a
 * member. The mask preserves offsets, so the value itself is sliced from the raw
 * source at the same indexes.
 */
export function unionTypesIn(source) {
	const masked = maskLiterals(source);
	const start = masked.indexOf(UNION_DECLARATION);
	if (start === -1) throw new Error(`No \`${UNION_DECLARATION}\` declaration found`);
	const end = masked.indexOf(';', start);
	if (end === -1) throw new Error(`\`${UNION_DECLARATION}\` is unterminated`);
	const types = [];
	for (let index = start; index < end; index += 1) {
		const quote = masked[index];
		if (quote !== "'" && quote !== '"') continue;
		const close = masked.indexOf(quote, index + 1);
		if (close === -1 || close > end) break;
		types.push(source.slice(index + 1, close));
		index = close;
	}
	return types;
}

/**
 * The event types the observer's conformance table maps.
 *
 * Same masking trick as the union, plus brace depth: only a quoted string that
 * sits at the table's own level AND is followed by `:` is a key, so neither a
 * `recordMessage('push failed')` argument nor a `f.status === 'error'` comparison
 * inside a row can be mistaken for one.
 */
export function conformanceKeysIn(source) {
	const masked = maskLiterals(source);
	const declaration = masked.indexOf(TABLE_DECLARATION);
	if (declaration === -1) throw new Error(`No \`${TABLE_DECLARATION}\` declaration found`);
	const open = declaration + TABLE_DECLARATION.length - 1;
	const keys = [];
	let depth = 0;
	for (let index = open; index < masked.length; index += 1) {
		const char = masked[index];
		if ('([{'.includes(char)) depth += 1;
		else if (')]}'.includes(char)) {
			depth -= 1;
			if (depth === 0) return keys;
		} else if (depth === 1 && (char === "'" || char === '"')) {
			const close = masked.indexOf(char, index + 1);
			if (close === -1) break;
			let after = close + 1;
			while (after < masked.length && /\s/.test(masked[after])) after += 1;
			if (masked[after] === ':') keys.push(source.slice(index + 1, close));
			index = close;
		}
	}
	throw new Error(`\`${TABLE_DECLARATION}\` is unterminated`);
}

/** Types emitted somewhere that is not a mention-only file. */
export function emittedTypesIn(emitted) {
	return new Set(
		[...emitted.entries()]
			.filter(([, files]) => files.some((file) => !MENTION_ONLY_FILES.has(file)))
			.map(([type]) => type)
	);
}

export function diffVocabulary(emitted, union) {
	const declared = new Set(union);
	const emittedTypes = emittedTypesIn(emitted);
	return {
		missing: [...emittedTypes].filter((type) => !declared.has(type)).sort(),
		unemitted: union.filter((type) => !emittedTypes.has(type)).sort(),
		duplicates: [...new Set(union.filter((type, index) => union.indexOf(type) !== index))].sort(),
	};
}

/** The union against the observer's table, both ways. */
export function diffConformance(union, keys) {
	const declared = new Set(union);
	const mapped = new Set(keys);
	return {
		unmapped: union.filter((type) => !mapped.has(type)).sort(),
		orphaned: keys.filter((type) => !declared.has(type)).sort(),
		duplicates: [...new Set(keys.filter((type, index) => keys.indexOf(type) !== index))].sort(),
	};
}

export async function checkSyncEventTypes(
	telemetryPath = TELEMETRY_PATH,
	observerPath = OBSERVER_PATH
) {
	const union = unionTypesIn(await readFile(telemetryPath, 'utf8'));
	const emitted = await collectEmittedEventTypes(SYNC_EVENT_SOURCE_ROOTS, union);
	const { missing, unemitted, duplicates } = diffVocabulary(emitted, union);
	if (duplicates.length > 0) {
		throw new Error(
			`SyncEventType lists ${duplicates.length} type(s) twice: ${duplicates.join(', ')}`
		);
	}
	if (unemitted.length > 0) {
		console.warn(
			`⚠ SyncEventType declares ${unemitted.length} type(s) nothing emits: ${unemitted.join(', ')}`
		);
	}
	if (missing.length > 0) {
		const detail = missing
			.map((type) => `  ${type}  (${[...new Set(emitted.get(type))].join(', ')})`)
			.join('\n');
		throw new Error(
			`${missing.length} sync event type(s) are emitted but not declared:\n${detail}\n` +
				'Add each to `SyncEventType` in packages/sync-core/src/telemetry.ts, then give it a ' +
				'conformance row in apps/main/lib/sync-log-observer.ts (the build will insist).'
		);
	}

	const keys = conformanceKeysIn(await readFile(observerPath, 'utf8'));
	const conformance = diffConformance(union, keys);
	if (conformance.duplicates.length > 0) {
		throw new Error(
			`The conformance table maps ${conformance.duplicates.length} type(s) twice — the later row ` +
				`silently wins: ${conformance.duplicates.join(', ')}`
		);
	}
	if (conformance.unmapped.length > 0) {
		throw new Error(
			`${conformance.unmapped.length} sync event type(s) have no conformance row:\n  ` +
				`${conformance.unmapped.join('\n  ')}\n` +
				'Add a row to CONFORMANCE_TABLE in apps/main/lib/sync-log-observer.ts. Without one the ' +
				"event inherits sync.other/'failed' and reads to a merchant as a sync failure."
		);
	}
	if (conformance.orphaned.length > 0) {
		throw new Error(
			`${conformance.orphaned.length} conformance row(s) map a type that is not in ` +
				`SyncEventType:\n  ${conformance.orphaned.join('\n  ')}\n` +
				'Either the row is stale, or the type belongs in the union.'
		);
	}
	console.log(
		`✓ ${union.length} sync event types declared, every emitted type covered, ` +
			`every type mapped by a conformance row`
	);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	checkSyncEventTypes().catch((error) => {
		console.error(error instanceof Error ? error.message : error);
		process.exitCode = 1;
	});
}
