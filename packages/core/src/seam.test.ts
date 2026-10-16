/**
 * ADR 0033 item 7: UI code acquires data only through named reads and writes only through
 * commands. Storage imports, storage tokens and RxDB record-mutator calls are reported; the frozen
 * allowlist is immutable and the effective list (frozen minus repaired) may only shrink.
 */
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

import { SEAM_ALLOWLIST_FROZEN_2026_10_16, SEAM_REPAIRED_SINCE_FREEZE } from './seam-allowlist';

const FROZEN_LENGTH = 195;
const FROZEN_DIGEST = '8254c65e39b2be1a51938324829711874b0508d5281ef2b9581e5015772faaae';
const repaired = new Set(SEAM_REPAIRED_SINCE_FREEZE);
const effectiveAllowlist = new Set(
	SEAM_ALLOWLIST_FROZEN_2026_10_16.filter((file) => !repaired.has(file))
);
const forbiddenQueryNames = new Set([
	'engineCollection',
	'observeEngineCollection',
	'observeEngineDatabases',
	'EngineCollection',
	'useLocalCollection$',
	'useFollowedCollection',
	'useFollowedCollection$',
	'useLocalQuery$',
	'observeEngineQuery',
	'EngineQueryDescriptor',
	'EngineQueryRelation',
	'CompiledQueryRead',
	'EngineRxDocument',
	'storageQueryProjectionReader',
	'openOrdersSelector',
	'OPEN_ORDERS_SORT',
	'promotedColumnsFor',
	'WRITEABLE_REMOTE_ID_FIELD',
	'LocalDatabaseWithReset',
	'LocalCollectionReset',
]);
const taxNames = new Set(['TAX_ID_TYPES', 'TaxId', 'TaxIdType', 'TaxIdVerified']);
const liveTabNames = new Set(['holdLiveTab', 'LiveTabNotOwnedError']);

function sourceFiles(directory: string): string[] {
	return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
		const path = join(directory, entry.name);
		if (entry.isDirectory())
			return /^(?:__tests__|__mocks__|jest)$/.test(entry.name) ? [] : sourceFiles(path);
		return /\.tsx?$/.test(entry.name) && !/\.(?:test|stories)\./.test(entry.name) ? [path] : [];
	});
}

// Preserve quoted strings while stripping comments, then mask strings for the token check.
const trivia = /\/\*[\s\S]*?\*\/|\/\/[^\n]*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`/g;
function violations(source: string): string[] {
	const commentsRemoved = source.replace(trivia, (match) => (match.startsWith('/') ? ' ' : match));
	const found: string[] = [];
	const imports =
		/\b(?:import|export)\s+(?:type\s+)?([^;]*?)\s+from\s*['"]([^'"]+)['"]|\b(?:import|require)\s*\(\s*['"]([^'"]+)['"]\s*\)|\bimport\s*['"]([^'"]+)['"]/g;
	for (const match of commentsRemoved.matchAll(imports)) {
		const [, clause = '', from, dynamic, bare] = match;
		const specifier = from ?? dynamic ?? bare;
		const braces = clause.match(/^\s*\{([^}]*)\}\s*$/);
		const names =
			braces?.[1]
				.split(',')
				.map(
					(name) =>
						name
							.trim()
							.replace(/^type\s+/, '')
							.split(/\s+as\s+/)[0]
				)
				.filter(Boolean) ?? [];
		const only = (allowed: Set<string>) =>
			!!braces && names.length > 0 && names.every((name) => allowed.has(name));
		if (/^(?:rxdb(?:-premium)?|@wcpos\/database)(?:\/|$)/.test(specifier)) {
			if (specifier === '@wcpos/database' && only(taxNames)) continue;
			if (specifier === '@wcpos/database/live-tab' && only(liveTabNames)) continue;
			found.push(`storage import: ${match[0]}`);
		}
		for (const name of names) {
			if (specifier === '@wcpos/query' && forbiddenQueryNames.has(name))
				found.push(`query escape hatch: ${name}`);
			if (specifier === '@wcpos/sync-engine' && name === 'MUTATION_QUEUE_RXDB_COLLECTION')
				found.push(`mutation queue: ${name}`);
		}
		// `import * as query from '@wcpos/query'` binds the whole module: check its member accesses.
		const namespace = clause.match(/^\s*\*\s+as\s+(\w+)\s*$/);
		if (specifier === '@wcpos/query' && namespace) {
			for (const access of commentsRemoved.matchAll(
				// `ns.name`, `ns?.name`, `ns['name']`; namespace[1] is \w+ so the built pattern is linear.
				new RegExp(`\\b${namespace[1]}\\s*(?:\\?\\.|\\.|\\[\\s*['"])\\s*(\\w+)`, 'g')
			)) {
				if (forbiddenQueryNames.has(access[1])) found.push(`query escape hatch: ${access[0]}`);
			}
		}
	}
	// `import('@wcpos/query').Name` in a type position binds nothing; check the accessed name.
	for (const access of commentsRemoved.matchAll(
		/import\s*\(\s*['"]@wcpos\/query['"]\s*\)\s*\.\s*(\w+)/g
	)) {
		if (forbiddenQueryNames.has(access[1])) found.push(`query escape hatch: ${access[0]}`);
	}
	const code = commentsRemoved.replace(trivia, '');
	for (const match of code.matchAll(
		/\.db\$(?:\s*\()?|\.collections\b|\.collection\s*(?:\?\.|\.|\[)|\.storageInstance\b|\.localDB\b|\{[^}]*\blocalDB\b[^}]*\}\s*=\s*useQueryRuntime\s*\(|\.(?:incrementalPatch|incrementalModify|incrementalRemove|incrementalUpsert|incrementalUpdate|modify|update|upsert|bulkInsert|bulkUpsert|bulkRemove|insertLocal|upsertLocal|getLocal\$?|atomicUpdate|atomicPatch)\s*\(/g
	)) {
		found.push(
			`${/^\.(?:incremental|modify|update|upsert|bulk|insertLocal|upsertLocal|getLocal|atomic)/.test(match[0]) ? 'record mutator (writes go through commands)' : 'storage token'}: ${match[0]}`
		);
	}
	return found.map((violation) => violation.replace(/\s+/g, ' '));
}

const violationsByFile = sourceFiles(__dirname).flatMap((path) => {
	const matches = violations(readFileSync(path, 'utf8'));
	return matches.length ? [{ file: relative(__dirname, path).split(sep).join('/'), matches }] : [];
});

it('does not add files that cross the UI/data seam', () => {
	expect(
		violationsByFile
			.filter(({ file }) => !effectiveAllowlist.has(file))
			.flatMap(({ file, matches }) => matches.map((match) => `${file}: ${match}`))
	).toEqual([]);
});

it('records repaired files in SEAM_REPAIRED_SINCE_FREEZE (the effective list may only shrink)', () => {
	const violatingFiles = new Set(violationsByFile.map(({ file }) => file));
	expect(
		[...effectiveAllowlist]
			.filter((file) => !violatingFiles.has(file))
			.map((file) => `No longer crosses the seam; add to SEAM_REPAIRED_SINCE_FREEZE: ${file}`)
	).toEqual([]);
});

it('keeps the frozen allowlist immutable and the repaired list inside it', () => {
	expect(SEAM_ALLOWLIST_FROZEN_2026_10_16.length).toBe(FROZEN_LENGTH);
	expect(
		createHash('sha256').update(SEAM_ALLOWLIST_FROZEN_2026_10_16.join('\n')).digest('hex')
	).toBe(FROZEN_DIGEST);
	const frozen = new Set(SEAM_ALLOWLIST_FROZEN_2026_10_16);
	expect(SEAM_REPAIRED_SINCE_FREEZE.filter((file) => !frozen.has(file))).toEqual([]);
	expect(
		SEAM_REPAIRED_SINCE_FREEZE.filter(
			(file) => !violationsByFile.every(({ file: f }) => f !== file)
		)
	).toEqual([]);
});
