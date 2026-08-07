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

const UNION_DECLARATION = 'export type SyncEventType =';

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

export async function checkSyncEventTypes(telemetryPath = TELEMETRY_PATH) {
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
	console.log(`✓ ${union.length} sync event types declared, every emitted type covered`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	checkSyncEventTypes().catch((error) => {
		console.error(error instanceof Error ? error.message : error);
		process.exitCode = 1;
	});
}
