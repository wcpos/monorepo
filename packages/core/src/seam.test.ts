/** ADR 0033 item 7: UI code acquires data only through named reads; this allowlist may only shrink. */
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

import { SEAM_ALLOWLIST_FROZEN_2026_10_16 } from './seam-allowlist';

const ALLOWLIST_FROZEN_2026_10_16 = new Set(SEAM_ALLOWLIST_FROZEN_2026_10_16);
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
	}
	const code = commentsRemoved.replace(trivia, '');
	for (const match of code.matchAll(
		/\.db\$(?:\s*\()?|\.collections\s*[.[]|\.storageInstance\b|\.localDB\b|\{[^}]*\blocalDB\s*:[^}]*\}\s*=\s*useQueryRuntime\s*\(/g
	)) {
		found.push(`storage token: ${match[0]}`);
	}
	return found.map((violation) => violation.replace(/\s+/g, ' '));
}

const violationsByFile = sourceFiles(__dirname).flatMap((path) => {
	const matches = violations(readFileSync(path, 'utf8'));
	return matches.length ? [{ file: relative(__dirname, path), matches }] : [];
});

it('does not add files that cross the UI/data seam', () => {
	expect(
		violationsByFile
			.filter(({ file }) => !ALLOWLIST_FROZEN_2026_10_16.has(file))
			.flatMap(({ file, matches }) => matches.map((match) => `${file}: ${match}`))
	).toEqual([]);
});

it('removes repaired files from the frozen allowlist (the list may only shrink)', () => {
	const violatingFiles = new Set(violationsByFile.map(({ file }) => file));
	expect(
		[...ALLOWLIST_FROZEN_2026_10_16]
			.filter((file) => !violatingFiles.has(file))
			.map((file) => `Remove repaired file from allowlist: ${file}`)
	).toEqual([]);
});

it('never grows the frozen allowlist beyond its original 190 files', () => {
	expect(SEAM_ALLOWLIST_FROZEN_2026_10_16.length).toBeLessThanOrEqual(190);
});
