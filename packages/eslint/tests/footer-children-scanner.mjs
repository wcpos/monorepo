import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

import ts from 'typescript';

import { ROOT } from './uniwind-scanner.mjs';
export { countSites, ROOT } from './uniwind-scanner.mjs';

const SOURCE_ROOTS = [
	'packages/core/src/',
	'packages/components/src/',
	'apps/main/app/',
	'apps/main/components/',
	'apps/main/lib/',
];
const SKIP = /^(node_modules|__tests__|__mocks__|ios|android|dist)$/;
const BUTTONS =
	/^(Button|IconButton|Pressable|DialogClose|DialogAction|AlertDialogAction|AlertDialogCancel)$/;
const included = (path) =>
	SOURCE_ROOTS.some((root) => path.startsWith(root)) &&
	path.endsWith('.tsx') &&
	!path.endsWith('.test.tsx') &&
	!path.endsWith('/gallery.tsx');

export function scanSource(text, path) {
	if (!text || !included(path)) return [];
	const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
	const sites = [];
	function hasButton(node) {
		if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
			if (BUTTONS.test(node.tagName.getText(source))) return true;
		}
		return ts.forEachChild(node, hasButton);
	}
	function visit(node) {
		if (
			(ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) &&
			['DialogFooter', 'AlertDialogFooter'].includes(node.tagName.getText(source))
		) {
			const { line, character } = source.getLineAndCharacterOfPosition(node.getStart(source));
			const children = ts.isJsxOpeningElement(node) ? node.parent.children : [];
			let legacy = children.some((child) =>
				ts.isJsxText(child)
					? child.text.trim() !== ''
					: !ts.isJsxExpression(child) || !!child.expression
			);
			for (const attr of node.attributes.properties) {
				if (ts.isJsxSpreadAttribute(attr) || attr.name.getText(source) === 'children')
					legacy = true;
				else if (
					attr.name.getText(source) === 'aside' &&
					attr.initializer &&
					hasButton(attr.initializer)
				)
					sites.push(`${path}:${line + 1}:${character + 1}:footer-aside-button`);
			}
			if (legacy) sites.push(`${path}:${line + 1}:${character + 1}:footer-children`);
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
			if (entry.isDirectory()) return SKIP.test(entry.name) ? [] : walk(path);
			const name = relative(ROOT, path);
			return included(name) ? scanSource(readFileSync(path, 'utf8'), name) : [];
		});
	}
	return SOURCE_ROOTS.flatMap((root) => walk(join(ROOT, root))).sort();
}
