/**
 * ADR 0033 item 7: UI code acquires data only through named reads and writes only through
 * commands. Storage imports, storage tokens and RxDB record-mutator calls are reported; the frozen
 * allowlist is immutable and the effective list (frozen minus repaired) may only shrink.
 */
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

import * as ts from 'typescript';

import {
	SEAM_ALLOWLIST_FROZEN_2026_10_16,
	SEAM_CEILINGS,
	SEAM_REPAIRED_FLOOR,
	SEAM_REPAIRED_PREFIX_DIGEST,
	SEAM_REPAIRED_SINCE_FREEZE,
} from './seam-allowlist';

const frozenCount = new Map(SEAM_ALLOWLIST_FROZEN_2026_10_16);

const FROZEN_LENGTH = 215;
const FROZEN_DIGEST = '6b21fd395cbb56517dfb68f9bf23c449008dca3dd6ce1d4e7ba3f42703d46aaf';
const repaired = new Set(SEAM_REPAIRED_SINCE_FREEZE);
const effectiveAllowlist = new Set(
	SEAM_ALLOWLIST_FROZEN_2026_10_16.map(([file]) => file).filter((file) => !repaired.has(file))
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
	'EngineDocument',
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

const mutatorNames = new Set([
	'incrementalPatch',
	'incrementalModify',
	'incrementalRemove',
	'incrementalUpsert',
	'incrementalUpdate',
	'modify',
	'update',
	'patch',
	'remove',
	'insert',
	'upsert',
	'insertIfNotExists',
	'putAttachment',
	'putAttachments',
	'putAttachmentBase64',
	'save',
	'updateCRDT',
	'insertCRDT',
	'cleanup',
	'addCollections',
	'addState',
	'bulkInsert',
	'bulkUpsert',
	'bulkRemove',
	'insertLocal',
	'upsertLocal',
	'getLocal',
	'getLocal$',
	'atomicUpdate',
	'atomicPatch',
]);
const storageNames = new Set(['db$', 'collections', 'storageInstance', 'localDB']);

function staticName(node: ts.Node | undefined): string | undefined {
	if (!node) return undefined;
	if (ts.isIdentifier(node) || ts.isStringLiteralLike(node)) return node.text;
	if (ts.isComputedPropertyName(node) && ts.isStringLiteralLike(node.expression))
		return node.expression.text;
	return undefined;
}

function violations(source: string, path = 'seam-fixture.tsx'): { rule: string; text: string }[] {
	const root = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
	const found: { rule: string; text: string }[] = [];
	const report = (rule: string, node: ts.Node) =>
		found.push({ rule, text: node.getText(root).slice(0, 120) });
	const checkImport = (
		node: ts.Node,
		specifier: ts.Node | undefined,
		names: string[],
		wholeModule = false,
		typeWildcard = false
	) => {
		if (!specifier || !ts.isStringLiteralLike(specifier)) return;
		const module = specifier.text;
		const from = (name: string) => module === name || module.startsWith(`${name}/`);
		const only = (allowed: Set<string>) =>
			!wholeModule && names.length > 0 && names.every((name) => allowed.has(name));
		if (from('rxdb') || from('rxdb-premium') || from('@wcpos/database')) {
			if (module === '@wcpos/database' && only(taxNames)) return;
			if (module === '@wcpos/database/live-tab' && only(liveTabNames)) return;
			report('storage import', node);
		}
		if (from('@wcpos/query')) {
			if (typeWildcard) return;
			if (wholeModule) report('query escape hatch', node);
			for (const name of names) {
				if (
					forbiddenQueryNames.has(name) ||
					(module === '@wcpos/query/collection-map' && name !== 'sanitizeVariationAttributesRead')
				)
					report('query escape hatch', node);
			}
		}
		if (from('@wcpos/sync-engine')) {
			if (wholeModule) report('mutation queue', node);
			for (const name of names) {
				if (name === 'MUTATION_QUEUE_RXDB_COLLECTION') report('mutation queue', node);
			}
		}
	};
	const checkProperty = (node: ts.Node, name: string | undefined) => {
		if (!name) return;
		if (storageNames.has(name)) report('storage token', node);
		if (name === 'collection') report('record collection back-reference', node);
		if (mutatorNames.has(name)) report('record mutator', node);
	};
	const visit = (node: ts.Node) => {
		if (ts.isImportDeclaration(node)) {
			const bindings = node.importClause?.namedBindings;
			const names =
				bindings && ts.isNamedImports(bindings)
					? bindings.elements.map((binding) => (binding.propertyName ?? binding.name).text)
					: [];
			if (node.importClause?.name) names.push('default');
			checkImport(node, node.moduleSpecifier, names, !!bindings && ts.isNamespaceImport(bindings));
		} else if (ts.isExportDeclaration(node)) {
			const bindings = node.exportClause;
			checkImport(
				node,
				node.moduleSpecifier,
				bindings && ts.isNamedExports(bindings)
					? bindings.elements.map((binding) => (binding.propertyName ?? binding.name).text)
					: [],
				!bindings || ts.isNamespaceExport(bindings),
				node.isTypeOnly && !bindings
			);
		} else if (
			ts.isImportEqualsDeclaration(node) &&
			ts.isExternalModuleReference(node.moduleReference)
		) {
			checkImport(node, node.moduleReference.expression, [], true);
		} else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) {
			let qualifier = node.qualifier;
			while (qualifier && ts.isQualifiedName(qualifier)) qualifier = qualifier.left;
			checkImport(node, node.argument.literal, qualifier ? [qualifier.text] : [], !qualifier);
		} else if (ts.isCallExpression(node)) {
			const callee = node.expression;
			if (
				callee.kind === ts.SyntaxKind.ImportKeyword ||
				(ts.isIdentifier(callee) && callee.text === 'require')
			)
				checkImport(node, node.arguments[0], [], true);
			if (ts.isPropertyAccessExpression(callee) && callee.name.text === 'write') {
				const receiver = callee.expression;
				if (
					(ts.isIdentifier(receiver) && receiver.text === 'engine') ||
					(ts.isPropertyAccessExpression(receiver) && receiver.name.text === 'engine')
				)
					report('write plane outside a command module', node);
			}
		}
		if (ts.isPropertyAccessExpression(node)) checkProperty(node, node.name.text);
		if (ts.isElementAccessExpression(node) && ts.isStringLiteralLike(node.argumentExpression))
			checkProperty(node, node.argumentExpression.text);
		if (ts.isBindingElement(node) && ts.isObjectBindingPattern(node.parent) && !node.dotDotDotToken)
			checkProperty(node, staticName(node.propertyName ?? node.name));
		// Assignment destructuring uses object literals, not ObjectBindingPattern nodes.
		if (ts.isPropertyAssignment(node) || ts.isShorthandPropertyAssignment(node)) {
			let pattern: ts.Node = node.parent;
			while (
				pattern.parent &&
				(ts.isPropertyAssignment(pattern.parent) ||
					ts.isObjectLiteralExpression(pattern.parent) ||
					ts.isArrayLiteralExpression(pattern.parent))
			)
				pattern = pattern.parent;
			const assignment = pattern.parent;
			if (
				assignment &&
				ts.isBinaryExpression(assignment) &&
				assignment.left === pattern &&
				assignment.operatorToken.kind === ts.SyntaxKind.EqualsToken
			)
				checkProperty(node, staticName(node.name));
		}
		ts.forEachChild(node, visit);
	};
	visit(root);
	return found;
}

const violationsByFile = sourceFiles(__dirname).flatMap((path) => {
	const matches = violations(readFileSync(path, 'utf8'), path);
	return matches.length ? [{ file: relative(__dirname, path).split(sep).join('/'), matches }] : [];
});

// `SEAM_DUMP=<path>` writes the current violations as JSON (used to freeze or re-freeze the allowlist).
if (process.env.SEAM_DUMP) {
	writeFileSync(
		process.env.SEAM_DUMP,
		JSON.stringify(
			violationsByFile.map(({ file, matches }) => [file, matches.length]),
			null,
			'\t'
		)
	);
}

it('does not add files that cross the UI/data seam', () => {
	expect(
		violationsByFile
			.filter(({ file }) => !effectiveAllowlist.has(file))
			.flatMap(({ file, matches }) => matches.map(({ rule, text }) => `${file}: ${rule}: ${text}`))
	).toEqual([]);
});

function ceilingIssue(
	file: string,
	current: number,
	frozen: number,
	recorded = Infinity
): string[] {
	const ceiling = Math.min(frozen, recorded);
	if (current > ceiling)
		return [
			`${file}: ${current} violations, ceiling ${ceiling} — route the new access through a named read or command`,
		];
	if (current > 0 && current < ceiling) return [`record the new ceiling for ${file}: ${current}`];
	return [];
}

it('never lets a frozen file gain violations (the per-file count only ratchets down)', () => {
	const ceilings = new Map(SEAM_CEILINGS);
	expect(
		violationsByFile.flatMap(({ file, matches }) =>
			frozenCount.has(file)
				? ceilingIssue(file, matches.length, frozenCount.get(file)!, ceilings.get(file))
				: []
		)
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
		createHash('sha256')
			.update(
				SEAM_ALLOWLIST_FROZEN_2026_10_16.map(([file, count]) => `${file}:${count}`).join('\n')
			)
			.digest('hex')
	).toBe(FROZEN_DIGEST);
	const frozen = new Set(SEAM_ALLOWLIST_FROZEN_2026_10_16.map(([file]) => file));
	expect(SEAM_REPAIRED_SINCE_FREEZE.filter((file) => !frozen.has(file))).toEqual([]);
	// Pin identities, not just length: substitution must not silently re-admit a repaired file.
	expect(SEAM_REPAIRED_SINCE_FREEZE.length).toBeGreaterThanOrEqual(SEAM_REPAIRED_FLOOR);
	expect(
		createHash('sha256')
			.update(SEAM_REPAIRED_SINCE_FREEZE.slice(0, SEAM_REPAIRED_FLOOR).join('\n'))
			.digest('hex')
	).toBe(SEAM_REPAIRED_PREFIX_DIGEST);
	expect(
		SEAM_REPAIRED_SINCE_FREEZE.filter(
			(file) => !violationsByFile.every(({ file: f }) => f !== file)
		)
	).toEqual([]);
});

// These fixtures catch syntax bypasses without executing imported modules or mutators.
it.each([
	"export { engineCollection as read } from '@wcpos/query/subpath';",
	"import { EngineDocument } from '@wcpos/query';",
	"import { other } from '@wcpos/query/collection-map';",
	"export { MUTATION_QUEUE_RXDB_COLLECTION as queue } from '@wcpos/sync-engine/subpath';",
	"type Q = import('@wcpos/query/subpath').EngineCollection;",
	"type Q = import('@wcpos/sync-engine').MUTATION_QUEUE_RXDB_COLLECTION;",
	"const q = (await import('@wcpos/query')).SafeName;",
	'engine?.write?.({});',
	'object.engine.write({});',
	'({ collections } = db);',
	'({ nested: { storageInstance: storage } } = db);',
	'({ collection: owner, remove: fn } = doc);',
])('detects the seam access in %s', (source) => {
	expect(violations(source).length).toBeGreaterThan(0);
});

it.each([
	"import { TaxId, type TaxIdType as Id } from '@wcpos/database';",
	"import { holdLiveTab, LiveTabNotOwnedError } from '@wcpos/database/live-tab';",
	"import { sanitizeVariationAttributesRead } from '@wcpos/query/collection-map';",
	"export type * from '@wcpos/query';",
	"type Q = import('@wcpos/query').QueryState;",
	"// doc.remove();\nconst text = 'doc.collections';",
	'const text = `doc.remove() and doc.collection`; // engine.write()',
	'const shape: { collections: string; remove(): void } = value;',
	'const { safe: collections, ...remove } = value;',
	'const options = { collections, remove: fn, collection: name };',
])('allows non-seam syntax in %s', (source) => {
	expect(violations(source)).toEqual([]);
});

it.each([
	[5, undefined, []],
	[4, undefined, ['record the new ceiling for file.ts: 4']],
	[3, 4, ['record the new ceiling for file.ts: 3']],
	[4, 4, []],
	[0, 4, []], // Zero is handled by the repaired-file assertion, not a ceiling entry.
])('records decreases from the effective ceiling: %s / %s', (current, recorded, expected) => {
	expect(ceilingIssue('file.ts', current, 5, recorded)).toEqual(expected);
});
it.each([
	[6, undefined],
	[5, 4],
	[6, 7],
])('rejects a count above either ceiling: %s / %s', (current, recorded) => {
	expect(ceilingIssue('file.ts', current!, 5, recorded)).toHaveLength(1);
});

// Every mutator spelling is fenced across calls, extraction and binding patterns.
it.each(
	(
		'incrementalPatch incrementalModify incrementalRemove incrementalUpsert incrementalUpdate ' +
		'modify update patch remove insert upsert insertIfNotExists putAttachment putAttachments ' +
		'putAttachmentBase64 save updateCRDT insertCRDT addState bulkInsert bulkUpsert bulkRemove ' +
		'insertLocal upsertLocal getLocal getLocal$ atomicUpdate atomicPatch'
	).split(' ')
)('fences all accesses of %s', (name) => {
	for (const source of [
		`doc.${name}();`,
		`doc?.${name}?.();`,
		`doc['${name}']();`,
		`doc?.['${name}']?.();`,
		`const fn = doc.${name};`,
		`const { ${name} } = doc;`,
		`const { ['${name}']: fn } = doc;`,
	])
		expect(violations(source).map(({ rule }) => rule)).toEqual(['record mutator']);
});

it.each(['db$', 'collections', 'storageInstance', 'localDB', 'collection'])(
	'fences all storage accesses of %s',
	(name) => {
		for (const source of [`doc?.${name};`, `doc?.['${name}'];`, `const { ${name}: value } = doc;`])
			expect(violations(source).map(({ rule }) => rule)).toEqual([
				name === 'collection' ? 'record collection back-reference' : 'storage token',
			]);
	}
);

it.each([
	'rxdb',
	'rxdb/plugins/query',
	'rxdb-premium',
	'rxdb-premium/plugins/storage',
	'@wcpos/database/subpath',
])('fences every import form from %s', (module) => {
	for (const source of [
		`import '${module}';`,
		`import type { Record } from '${module}';`,
		`export type { Record } from '${module}';`,
		`export * from '${module}';`,
		`import db = require('${module}');`,
		`require('${module}');`,
		`import('${module}');`,
		`type R = import('${module}').Record;`,
	])
		expect(violations(source).map(({ rule }) => rule)).toEqual(['storage import']);
});

it.each([
	'@wcpos/query',
	'@wcpos/query/subpath',
	'@wcpos/sync-engine',
	'@wcpos/sync-engine/subpath',
])('fences whole-module access to %s', (module) => {
	for (const source of [
		`import * as q from '${module}';`,
		`import type * as q from '${module}';`,
		`export * from '${module}';`,
		`export * as q from '${module}';`,
		`import q = require('${module}');`,
		`require('${module}');`,
		`const q = import('${module}').SafeName;`,
		`type Q = typeof import('${module}');`,
	])
		expect(violations(source)).toHaveLength(1);
});

it('walks TSX and nested template expressions but ignores string and comment contents', () => {
	expect(
		violations('<View title={`literal doc.remove() ${(() => { return `${doc.save}`; })()}`} />')
	).toEqual([{ rule: 'record mutator', text: 'doc.save' }]);
});

it('reports the accessed AST text, truncated to 120 characters', () => {
	const source = `${'receiver'.repeat(20)}.remove`;
	expect(violations(source)).toEqual([{ rule: 'record mutator', text: source.slice(0, 120) }]);
});
