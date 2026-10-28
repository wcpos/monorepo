import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

import ts from 'typescript';

import { ROOT } from './uniwind-scanner.mjs';

// The type ladder is `Text`'s `variant` axis (`packages/components/src/text/ladder.ts`). A `Text`
// whose classes restate one of these ranks is a site: one site per `className`, local class
// constants followed, every class string anywhere in the attribute (a `cn()` branch included).
const LADDER_LITERALS = [
	['text-muted-foreground', 'text-xs'], // variant="help"
	['text-muted-foreground', 'text-sm'], // variant="key"
	['text-sm', 'font-medium'], // variant="subheading": the legacy 13 that migrates to it
	['text-base', 'font-medium'], // variant="subheading": the rank itself restated
	['text-xs', 'uppercase'], // variant="caption"
];
const TREES = [
	'packages/components/src',
	'packages/core/src',
	'apps/main/app',
	'apps/main/components',
	'apps/main/lib',
];
export const CONSTRUCT = 'text-ladder-literal';

export function scanSource(text, path) {
	const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
	// A local-only checker resolves class constants with lexical scope (no imports or types).
	const host = ts.createCompilerHost({ noLib: true, noResolve: true });
	host.getSourceFile = (filename) => (filename === path ? source : undefined);
	const checker = ts.createProgram([path], { noLib: true, noResolve: true }, host).getTypeChecker();
	const sites = [];
	function classTokens(node, tokens, seen) {
		if (ts.isIdentifier(node)) {
			const declaration = checker.getSymbolAtLocation(node)?.valueDeclaration;
			if (
				declaration &&
				ts.isVariableDeclaration(declaration) &&
				declaration.initializer &&
				!seen.has(declaration)
			)
				classTokens(declaration.initializer, tokens, seen.add(declaration));
		}
		if (ts.isStringLiteral(node) || ts.isTemplateLiteralToken(node))
			for (const token of node.text.split(/\s+/)) tokens.add(token);
		// A truthy callback result stops `forEachChild`, so the walk returns nothing.
		ts.forEachChild(node, (child) => void classTokens(child, tokens, seen));
		return tokens;
	}
	function visit(node) {
		if (
			ts.isJsxAttribute(node) &&
			node.name.getText(source) === 'className' &&
			node.initializer &&
			node.parent.parent.tagName.getText(source) === 'Text'
		) {
			const tokens = classTokens(node.initializer, new Set(), new Set());
			if (LADDER_LITERALS.some((combo) => combo.every((name) => tokens.has(name)))) {
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
				return /^(?:__tests__|__mocks__|fixtures)$/.test(entry.name) ? [] : walk(path);
			if (!/\.[jt]sx?$/.test(entry.name) || /\.(?:test|spec|d)\.[jt]sx?$/.test(entry.name))
				return [];
			return scanSource(readFileSync(path, 'utf8'), relative(ROOT, path));
		});
	}
	return TREES.filter((tree) => existsSync(join(ROOT, tree)))
		.flatMap((tree) => walk(join(ROOT, tree)))
		.sort();
}

/** The baseline file's shape, `{ path: count }`, from scanned sites. */
export function countByPath(sites) {
	const counts = {};
	for (const site of sites) {
		const path = site.slice(0, site.indexOf(':'));
		counts[path] = (counts[path] ?? 0) + 1;
	}
	return Object.fromEntries(
		Object.keys(counts)
			.sort()
			.map((path) => [path, counts[path]])
	);
}
