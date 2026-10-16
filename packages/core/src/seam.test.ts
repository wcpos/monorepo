/**
 * ADR 0033 item 7: UI code acquires data only through named reads and writes only through
 * commands. Frozen fingerprints pin individual violations, not per-file counts. Every current
 * violation must be frozen; vanished fingerprints are progress and need no bookkeeping.
 */
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

import * as ts from 'typescript';

import { SEAM_FROZEN_VIOLATIONS_2026_10_16 } from './seam-allowlist';

/** Receiver names that mean an RxDatabase or RxCollection handle for the `close()` fence. */
const LIFECYCLE_RECEIVERS = new Set([
	'db',
	'database',
	'localDB',
	'storeDB',
	'userDB',
	'fastStoreDB',
	'collection',
]);

const FROZEN_LENGTH = 553;
const FROZEN_DIGEST = '396395d78e7068b66b96ce6920d32ae8c7750a5dad181862104bc19c9fce166a';
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
	'importJSON',
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
	const root = ts.createSourceFile(
		path,
		source,
		ts.ScriptTarget.Latest,
		true,
		path.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
	);
	const diagnostics: ts.Diagnostic[] = (root as any).parseDiagnostics;
	if (diagnostics.length)
		throw new Error(
			`${path}: ${diagnostics.map((d) => ts.flattenDiagnosticMessageText(d.messageText, ' ')).join('; ')}`
		);
	const found: { rule: string; text: string }[] = [];
	const report = (rule: string, node: ts.Node) => found.push({ rule, text: node.getText(root) });
	const checkImport = (
		node: ts.Node,
		specifier: ts.Node | undefined,
		names: string[],
		wholeModule = false
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
	const checkProperty = (node: ts.Node, name: string | undefined, receiver?: ts.Node) => {
		if (!name) return;
		if (storageNames.has(name)) report('storage token', node);
		if (name === 'collection') report('record collection back-reference', node);
		if (mutatorNames.has(name)) report('record mutator', node);
		if (
			(name === 'write' || name === 'resolveConflict') &&
			receiver &&
			((ts.isIdentifier(receiver) && receiver.text === 'engine') ||
				(ts.isPropertyAccessExpression(receiver) && receiver.name.text === 'engine'))
		)
			report('write plane outside a command module', node);
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
				!bindings || ts.isNamespaceExport(bindings)
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
			// `close()` is too common a name to fence everywhere (dialogs, sockets); fence it on a
			// receiver that is named like a database or collection handle, or is a `.collections[…]`.
			if (
				(ts.isPropertyAccessExpression(callee) && callee.name.text === 'close') ||
				(ts.isElementAccessExpression(callee) &&
					ts.isStringLiteralLike(callee.argumentExpression) &&
					callee.argumentExpression.text === 'close')
			) {
				const receiver = callee.expression;
				const named = ts.isIdentifier(receiver)
					? receiver.text
					: ts.isPropertyAccessExpression(receiver)
						? receiver.name.text
						: '';
				const viaCollections =
					ts.isElementAccessExpression(receiver) &&
					ts.isPropertyAccessExpression(receiver.expression) &&
					receiver.expression.name.text === 'collections';
				if (LIFECYCLE_RECEIVERS.has(named) || viaCollections)
					report('database or collection lifecycle (close) outside the data layer', node);
			}
		}
		if (ts.isPropertyAccessExpression(node)) checkProperty(node, node.name.text, node.expression);
		if (ts.isElementAccessExpression(node) && ts.isStringLiteralLike(node.argumentExpression))
			checkProperty(node, node.argumentExpression.text, node.expression);
		if (ts.isBindingElement(node) && ts.isObjectBindingPattern(node.parent) && !node.dotDotDotToken)
			checkProperty(
				node,
				staticName(node.propertyName ?? node.name),
				ts.isVariableDeclaration(node.parent.parent) ? node.parent.parent.initializer : undefined
			);
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

function fingerprints(file: string, matches: { rule: string; text: string }[]): string[] {
	const occurrences = new Map<string, number>();
	return matches.map(({ rule, text }) => {
		const key = `${rule} :: ${text.replace(/\s+/g, ' ').trim()}`;
		const occurrence = (occurrences.get(key) ?? 0) + 1;
		occurrences.set(key, occurrence);
		return `${file} :: ${key} :: ${occurrence}`;
	});
}

const current = violationsByFile.flatMap(({ file, matches }) => fingerprints(file, matches)).sort();
const frozen = new Set(SEAM_FROZEN_VIOLATIONS_2026_10_16);
const currentSet = new Set(current);
const progress = [...frozen].filter((fingerprint) => !currentSet.has(fingerprint));
console.log(
	`Seam progress: ${progress.length}/${frozen.size} frozen violations removed; ${current.length} remain`
);
if (process.env.SEAM_PROGRESS === '1') console.log(current.join('\n'));

// `SEAM_DUMP=<path>` writes sorted current fingerprints as JSON for an explicit re-freeze.
if (process.env.SEAM_DUMP)
	writeFileSync(process.env.SEAM_DUMP, JSON.stringify(current, null, '\t'));

function unfrozenViolations(current: string[], frozen: ReadonlySet<string>): string[] {
	return current
		.filter((fingerprint) => !frozen.has(fingerprint))
		.map((fingerprint) => `${fingerprint} — route this access through a named read or command`);
}

it('requires every current violation to belong to the frozen set', () => {
	expect(unfrozenViolations(current, frozen)).toEqual([]);
});

it('keeps the frozen fingerprints immutable', () => {
	expect(SEAM_FROZEN_VIOLATIONS_2026_10_16.length).toBe(FROZEN_LENGTH);
	expect(
		createHash('sha256').update(SEAM_FROZEN_VIOLATIONS_2026_10_16.join('\n')).digest('hex')
	).toBe(FROZEN_DIGEST);
});

it('normalises whitespace and numbers repeated rule/text pairs independently per file', () => {
	const matches = [
		{ rule: 'storage import', text: "import {\n Thing\t} from 'storage';" },
		{ rule: 'other rule', text: "import { Thing } from 'storage';" },
		{ rule: 'storage import', text: "import { Thing } from 'storage';" },
	];
	expect(fingerprints('file.ts', matches)).toEqual([
		"file.ts :: storage import :: import { Thing } from 'storage'; :: 1",
		"file.ts :: other rule :: import { Thing } from 'storage'; :: 1",
		"file.ts :: storage import :: import { Thing } from 'storage'; :: 2",
	]);
	expect(fingerprints('other.ts', matches.slice(2))).toEqual([
		"other.ts :: storage import :: import { Thing } from 'storage'; :: 1",
	]);
});

it('rejects same-count substitutions and extra occurrences but accepts removals', () => {
	const frozen = new Set(['file.ts :: record mutator :: doc.remove :: 1']);
	for (const source of ['doc.save;', 'doc.remove; doc.remove;']) {
		const issues = unfrozenViolations(fingerprints('file.ts', violations(source)), frozen);
		expect(issues).toHaveLength(1);
		expect(issues[0]).toContain('route this access through a named read or command');
	}
	expect(unfrozenViolations([], frozen)).toEqual([]);
	expect(unfrozenViolations(fingerprints('file.ts', violations('\n doc.remove;')), frozen)).toEqual(
		[]
	);
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
	"type Q = import('@wcpos/query').QueryState;",
	"// doc.remove();\nconst text = 'doc.collections';",
	'const text = `doc.remove() and doc.collection`; // engine.write()',
	'const shape: { collections: string; remove(): void } = value;',
	'const { safe: collections, ...remove } = value;',
	'const options = { collections, remove: fn, collection: name };',
])('allows non-seam syntax in %s', (source) => {
	expect(violations(source)).toEqual([]);
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
		`export type * from '${module}';`,
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
		`export type * from '${module}';`,
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

it('reports the full accessed AST text so fingerprints distinguish long accesses', () => {
	const source = `${'receiver'.repeat(20)}.remove`;
	expect(violations(source)).toEqual([{ rule: 'record mutator', text: source }]);
});

// Engine methods are fenced by receiver, not on unrelated objects with the same names.
it.each(['write', 'resolveConflict'])('fences engine %s calls and extraction', (name) => {
	for (const receiver of ['engine', 'object.engine']) {
		for (const source of [
			`${receiver}.${name}({});`,
			`${receiver}?.['${name}']?.({});`,
			`const fn = ${receiver}.${name};`,
			`const fn = ${receiver}['${name}'];`,
			`const { ${name} } = ${receiver};`,
			`const { ['${name}']: fn } = ${receiver};`,
		])
			expect(violations(source).map(({ rule }) => rule)).toEqual([
				'write plane outside a command module',
			]);
	}
});

it.each([
	"database['close']();",
	"db?.['close']?.();",
	"object.database['close']();",
	"object.collections['orders']['close']();",
])('fences database lifecycle calls in %s', (source) => {
	expect(violations(source).map(({ rule }) => rule)).toContain(
		'database or collection lifecycle (close) outside the data layer'
	);
});

it.each([
	"dialog['close']();",
	"socket?.['close']?.();",
	'writer.write();',
	'const { write, resolveConflict } = other;',
	"const fn = other['resolveConflict'];",
])('allows unrelated receivers in %s', (source) => {
	expect(violations(source)).toEqual([]);
});

it('parses TypeScript assertions and generic arrows as TS, not TSX', () => {
	expect(violations('const fn = <T>(doc: T) => (<T>doc).remove;', 'fixture.ts')).toEqual([
		{ rule: 'record mutator', text: '(<T>doc).remove' },
	]);
});

it.each(['fixture.ts', 'fixture.tsx'])('fails the scan on parse errors in %s', (path) => {
	expect(() => violations('const broken = ; doc.remove();', path)).toThrow(path);
});
