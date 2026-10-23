/**
 * @jest-environment node
 */
/**
 * The export census: `@wcpos/query` exports only what a consumer imports.
 *
 * For every name an entry in `package.json` `exports` exposes (relative re-exports followed),
 * some non-test source outside this package (`packages/*`, `apps/*`) must reference it, or the
 * name must be on EXCEPTIONS below with its reason. A public export with no caller in any
 * consumer is deleted, never kept "for compatibility": drop it from the entry file, and drop
 * the symbol too when nothing inside the package uses it either.
 *
 * A reference is any identifier with that name in a consumer's TypeScript AST (imports, mock
 * keys and property reads alike), so the census errs towards keeping a name, never towards
 * deleting a used one.
 */
import fs from 'node:fs';
import path from 'node:path';

import ts from 'typescript';

const repoRoot = path.resolve(__dirname, '../../..');
const queryRoot = path.join(repoRoot, 'packages/query');

/** `@wcpos/query/testing` is exempt as a whole: its consumers are tests, by design (#2892). */
const EXEMPT_SUBPATHS = new Set(['./testing']);

/**
 * Exported with no consumer outside the package, on purpose. Keyed `<subpath> <name>`.
 * An entry that gains a consumer, or stops being exported, fails the census until removed.
 */
const EXCEPTIONS: Record<string, string> = {
	// `temporary-order/index.ts` is both the subpath entry and the implementation module:
	// local-patch, customer-link and order-birth import these through it, and Metro maps
	// `@wcpos/query/<subpath>` to the directory's index, so the entry cannot be narrowed
	// without splitting the module.
	'./temporary-order temporaryDB$': 'entry is the implementation module (its own test reads it)',
	'./temporary-order getTemporaryOrder':
		'entry is the implementation module (local-patch, customer-link)',
	'./temporary-order removeTemporaryOrder': 'entry is the implementation module (order-birth)',
};

const SKIPPED_DIRECTORIES = new Set([
	'node_modules',
	'dist',
	'build',
	'.expo',
	'coverage',
	'web-build',
	'ios',
	'android',
]);
const SOURCE_FILE = /\.(tsx?|mts|cts|js|jsx)$/;
const TEST_FILE = /\.(test|spec|stories)\.|\/(__tests__|__mocks__|tests|e2e|jest)\//;

function parse(file: string): ts.SourceFile {
	const kind =
		file.endsWith('.tsx') || file.endsWith('.jsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
	return ts.createSourceFile(
		file,
		fs.readFileSync(file, 'utf8'),
		ts.ScriptTarget.Latest,
		true,
		kind
	);
}

function resolveRelative(from: string, specifier: string): string | null {
	const base = path.resolve(path.dirname(from), specifier);
	const candidates = [
		`${base}.ts`,
		`${base}.tsx`,
		path.join(base, 'index.ts'),
		path.join(base, 'index.tsx'),
	];
	return candidates.find((candidate) => fs.existsSync(candidate)) ?? null;
}

/** Every name a module exports, following relative re-exports (`export *` included). */
function exportedNames(file: string, seen = new Set<string>()): Set<string> {
	const names = new Set<string>();
	if (seen.has(file)) return names;
	seen.add(file);
	const isExported = (node: ts.Node) =>
		ts.canHaveModifiers(node) &&
		(ts.getModifiers(node) ?? []).some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword);

	for (const statement of parse(file).statements) {
		if (ts.isExportDeclaration(statement)) {
			const specifier =
				statement.moduleSpecifier && ts.isStringLiteral(statement.moduleSpecifier)
					? statement.moduleSpecifier.text
					: null;
			const target = specifier?.startsWith('.') ? resolveRelative(file, specifier) : null;
			if (!statement.exportClause) {
				if (target) exportedNames(target, seen).forEach((name) => names.add(name));
			} else if (ts.isNamedExports(statement.exportClause)) {
				statement.exportClause.elements.forEach((element) => names.add(element.name.text));
			} else {
				names.add(statement.exportClause.name.text);
			}
		} else if (isExported(statement)) {
			if (ts.isVariableStatement(statement)) {
				for (const declaration of statement.declarationList.declarations) {
					if (ts.isIdentifier(declaration.name)) names.add(declaration.name.text);
				}
			} else if (
				(ts.isFunctionDeclaration(statement) ||
					ts.isClassDeclaration(statement) ||
					ts.isInterfaceDeclaration(statement) ||
					ts.isTypeAliasDeclaration(statement) ||
					ts.isEnumDeclaration(statement)) &&
				statement.name
			) {
				names.add(statement.name.text);
			}
		}
	}
	return names;
}

function sourceFiles(directory: string, found: string[] = []): string[] {
	if (!fs.existsSync(directory)) return found;
	for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
		if (SKIPPED_DIRECTORIES.has(entry.name)) continue;
		const entryPath = path.join(directory, entry.name);
		if (entry.isDirectory()) sourceFiles(entryPath, found);
		else if (SOURCE_FILE.test(entry.name)) found.push(entryPath);
	}
	return found;
}

/** Identifiers in every non-test source file outside this package. */
function consumerIdentifiers(): Set<string> {
	const identifiers = new Set<string>();
	const files = [
		...sourceFiles(path.join(repoRoot, 'packages')),
		...sourceFiles(path.join(repoRoot, 'apps')),
	].filter((file) => !file.startsWith(`${queryRoot}/`) && !TEST_FILE.test(file));
	for (const file of files) {
		const visit = (node: ts.Node) => {
			if (ts.isIdentifier(node)) identifiers.add(node.text);
			ts.forEachChild(node, visit);
		};
		visit(parse(file));
	}
	return identifiers;
}

describe('the @wcpos/query export census', () => {
	const { exports: entries } = JSON.parse(
		fs.readFileSync(path.join(queryRoot, 'package.json'), 'utf8')
	) as { exports: Record<string, string> };
	const exported = Object.entries(entries)
		.filter(([subpath]) => !EXEMPT_SUBPATHS.has(subpath))
		.flatMap(([subpath, entry]) =>
			[...exportedNames(path.join(queryRoot, entry))].map((name) => `${subpath} ${name}`)
		);
	const consumed = consumerIdentifiers();
	const nameOf = (key: string) => key.slice(key.indexOf(' ') + 1);

	it('every exported name has a consumer outside the package, or a stated exception', () => {
		console.log(
			`Export census: ${exported.length} exported names; exceptions:\n${Object.entries(EXCEPTIONS)
				.map(([key, reason]) => `  ${key}: ${reason}`)
				.join('\n')}`
		);
		const unconsumed = exported.filter((key) => !consumed.has(nameOf(key)) && !(key in EXCEPTIONS));

		// Delete each from its entry file (and the symbol, if nothing in the package uses it).
		expect(unconsumed).toEqual([]);
	});

	it('every exception is still exported and still has no consumer', () => {
		const stale = Object.keys(EXCEPTIONS).filter(
			(key) => !exported.includes(key) || consumed.has(nameOf(key))
		);

		expect(stale).toEqual([]);
	});
});
