/**
 * Fence: RxDB `upsert`/`incrementalUpsert` replace an existing document wholesale, so a row
 * narrower than the local document wipes every field it omits (#902, #2705, #2709, #2711).
 * Every raw call in `packages/query/src` is listed here with the reason it writes a full
 * document or creates only; anything else adopts its row through `mergeIntoDocument`.
 * Out of scope on purpose: `packages/core` (the ADR 0033 seam test pins its raw mutators) and
 * `packages/sync-engine` (writes complete documents by construction).
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

import ts from 'typescript';

const SOURCE_ROOT = join(__dirname, '../../src');

const ALLOWED: Record<string, string> = {
	'commands/notifications.ts :: upsertNotification :: collection.upsert':
		'full document by design: with preserveLocalState false, a complete NotificationRow replaces local read/seen state on purpose',
	'commands/template-printer-overrides.ts :: setTemplatePrinterOverride :: collection.upsert':
		'full document: both of the schema\u2019s two properties set',
	'store-local/templates-sync.ts :: syncTemplates :: collection.bulkUpsert':
		'full documents: each row is the server\u2019s complete template (parsed per row through parseRestResponse); templates have no local-only fields, and the closure prune removes rows the server no longer serves',
};

function sourceFiles(directory: string): string[] {
	return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
		const path = join(directory, entry.name);
		if (entry.isDirectory())
			return /^(?:__tests__|__mocks__)$/.test(entry.name) ? [] : sourceFiles(path);
		return /\.tsx?$/.test(entry.name) && !/\.d\.ts$|\.test\.tsx?$/.test(entry.name) ? [path] : [];
	});
}

const RAW_UPSERTS = ['upsert', 'incrementalUpsert', 'bulkUpsert', 'bulkIncrementalUpsert'];

const isFunction = (node: ts.Node | undefined) =>
	!!node && (ts.isArrowFunction(node) || ts.isFunctionExpression(node));

/**
 * The name of the nearest enclosing named function: a declaration, a method, or a variable,
 * object property or class field whose value is a function.
 */
function enclosingName(node: ts.Node): string {
	for (let current = node.parent; current; current = current.parent) {
		if ((ts.isFunctionDeclaration(current) || ts.isMethodDeclaration(current)) && current.name)
			return current.name.getText();
		if (
			(ts.isVariableDeclaration(current) ||
				ts.isPropertyAssignment(current) ||
				ts.isPropertyDeclaration(current)) &&
			isFunction(current.initializer)
		)
			return current.name.getText();
	}
	return '';
}

/** `<enclosing name> :: <callee>` for every raw (bulk) upsert call in `root`. */
function upsertCalls(root: ts.SourceFile): string[] {
	const found: string[] = [];
	const visit = (node: ts.Node) => {
		if (
			ts.isCallExpression(node) &&
			ts.isPropertyAccessExpression(node.expression) &&
			RAW_UPSERTS.includes(node.expression.name.text)
		)
			found.push(`${enclosingName(node)} :: ${node.expression.getText(root)}`);
		ts.forEachChild(node, visit);
	};
	visit(root);
	return found;
}

const parse = (file: string, text: string) =>
	ts.createSourceFile(
		file,
		text,
		ts.ScriptTarget.Latest,
		true,
		file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
	);

function rawUpserts(): string[] {
	return sourceFiles(SOURCE_ROOT).flatMap((file) =>
		upsertCalls(parse(file, readFileSync(file, 'utf8'))).map(
			(call) => `${relative(SOURCE_ROOT, file)} :: ${call}`
		)
	);
}

it('allows a raw upsert only where it writes a full document or creates only', () => {
	const found = rawUpserts().sort();
	// An allowlist entry covers ONE call: a second raw call in the same function is unexpected.
	const unexpected = found.flatMap((fingerprint, index) => {
		if (!(fingerprint in ALLOWED)) return [fingerprint];
		return found.indexOf(fingerprint) < index
			? [`${fingerprint} (another raw call in an allowlisted function)`]
			: [];
	});
	const stale = Object.keys(ALLOWED).filter((fingerprint) => !found.includes(fingerprint));
	if (unexpected.length || stale.length)
		throw new Error(
			[
				'a raw upsert replaces an existing document wholesale; adopt a narrower row with ' +
					'mergeIntoDocument (packages/query/src/records/merge-into-document.ts), or add this ' +
					'call to the allowlist with a reason if it writes a full document or creates only',
				...unexpected.map((fingerprint) => `  not allowed: ${fingerprint}`),
				...stale.map((fingerprint) => `  allowlisted but gone: ${fingerprint}`),
			].join('\n')
		);
	expect(found).toEqual(Object.keys(ALLOWED).sort());
});

it('sees calls in code, not in comments or strings, under their enclosing name', () => {
	const fixture = parse(
		'fixture.ts',
		[
			'// rows.upsert(x)',
			"const s = 'rows.upsert(x)';",
			'const adopt = () => rows.incrementalUpsert(x);',
			'rows.upsert(y);',
			'const commands = { seed: async () => rows.bulkUpsert(xs) };',
			'class Store { refill = () => rows.bulkIncrementalUpsert(xs); }',
		].join('\n')
	);
	expect(upsertCalls(fixture)).toEqual([
		'adopt :: rows.incrementalUpsert',
		' :: rows.upsert',
		'seed :: rows.bulkUpsert',
		'refill :: rows.bulkIncrementalUpsert',
	]);
});
