import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

import ts from 'typescript';

import { ROOT } from './uniwind-scanner.mjs';

// `scripts/extract-js-strings.js` reads a key only from `t('literal')` (or `ctx.t('literal')`).
// A key built from a template or passed through a variable is invisible to it and drops out
// of the catalog sent to translators. A site is any `t(…)` / `….t(…)` call whose first
// argument is not a plain string literal; the fix is a table or switch of literal calls.
const TREES = ['apps/main', 'packages'];
const SKIP_DIRS =
	/^(?:node_modules|dist|build|web-build|public|ios|android|__tests__|__mocks__|fixtures|tests?)$/;
export const CONSTRUCT = 'i18n-computed-key';

export function scanSource(text, path) {
	// A `.ts` file parses as TS: read as TSX, an angle-bracket cast swallows the code after it.
	const kind = /\.[jt]s$/.test(path) ? ts.ScriptKind.TS : ts.ScriptKind.TSX;
	const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, kind);
	const sites = [];
	function visit(node) {
		if (ts.isCallExpression(node)) {
			const callee = node.expression;
			const name = ts.isPropertyAccessExpression(callee) ? callee.name : callee;
			const key = node.arguments[0];
			if (
				ts.isIdentifier(name) &&
				name.text === 't' &&
				key &&
				!ts.isStringLiteral(key) &&
				!ts.isNoSubstitutionTemplateLiteral(key)
			) {
				const { line } = source.getLineAndCharacterOfPosition(node.getStart(source));
				sites.push(`${path}:${line + 1}:1:${CONSTRUCT}`);
			}
		}
		ts.forEachChild(node, visit);
	}
	visit(source);
	return sites.sort();
}

export function scanRepository() {
	function walk(directory) {
		return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
			const path = join(directory, entry.name);
			if (entry.isDirectory())
				return SKIP_DIRS.test(entry.name) || entry.name.startsWith('.') ? [] : walk(path);
			if (!/\.[jt]sx?$/.test(entry.name) || /\.(?:test|spec|d)\.[jt]sx?$/.test(entry.name))
				return [];
			return scanSource(readFileSync(path, 'utf8'), relative(ROOT, path));
		});
	}
	return TREES.flatMap((tree) => walk(join(ROOT, tree))).sort();
}
