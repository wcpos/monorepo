/**
 * Fence: RxDB `upsert`/`incrementalUpsert` replace an existing document wholesale, so a row
 * narrower than the local document wipes every field it omits (#902, #2705, #2709, #2711).
 * Every raw call in `packages/query/src` is listed here with the reason it writes a full
 * document or creates only; anything else adopts its row through `mergeIntoDocument`.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

import ts from 'typescript';

const SOURCE_ROOT = join(__dirname, '../../src');

const ALLOWED: Record<string, string> = {
	'records/merge-into-document.ts :: mergeIntoDocument :: collection.incrementalUpsert':
		"the primitive's create path, taken only when no live document exists",
	'register-session/session-store.ts :: voidMovement :: movements.incrementalUpsert':
		'create-only: keyed by the claimed reversal id after a findOne found no row',
	'commands/notifications.ts :: upsertNotification :: collection.upsert':
		'full document: a complete NotificationRow, every schema property set',
	'commands/template-printer-overrides.ts :: setTemplatePrinterOverride :: collection.upsert':
		'full document: both of the schema’s two properties set',
};

function sourceFiles(directory: string): string[] {
	return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
		const path = join(directory, entry.name);
		if (entry.isDirectory())
			return /^(?:__tests__|__mocks__)$/.test(entry.name) ? [] : sourceFiles(path);
		return /\.tsx?$/.test(entry.name) && !/\.d\.ts$|\.test\.tsx?$/.test(entry.name) ? [path] : [];
	});
}

/** The name of the nearest enclosing named function, method or function-valued variable. */
function enclosingName(node: ts.Node): string {
	for (let current = node.parent; current; current = current.parent) {
		if ((ts.isFunctionDeclaration(current) || ts.isMethodDeclaration(current)) && current.name)
			return current.name.getText();
		if (
			ts.isVariableDeclaration(current) &&
			current.initializer &&
			(ts.isArrowFunction(current.initializer) || ts.isFunctionExpression(current.initializer))
		)
			return current.name.getText();
	}
	return '';
}

/** `<enclosing name> :: <callee>` for every `.upsert(` / `.incrementalUpsert(` call in `root`. */
function upsertCalls(root: ts.SourceFile): string[] {
	const found: string[] = [];
	const visit = (node: ts.Node) => {
		if (
			ts.isCallExpression(node) &&
			ts.isPropertyAccessExpression(node.expression) &&
			['upsert', 'incrementalUpsert'].includes(node.expression.name.text)
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
	const unexpected = found.filter((fingerprint) => !(fingerprint in ALLOWED));
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
		"// rows.upsert(x)\nconst s = 'rows.upsert(x)';\nconst adopt = () => rows.incrementalUpsert(x);\nrows.upsert(y);"
	);
	expect(upsertCalls(fixture)).toEqual(['adopt :: rows.incrementalUpsert', ' :: rows.upsert']);
});
