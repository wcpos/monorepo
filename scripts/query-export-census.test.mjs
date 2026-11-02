/**
 * The export census: `@wcpos/query` exports only what a consumer imports.
 *
 * This fails in the PR that deletes the last import of a query export from core or apps (delete
 * the export in that same PR), or in the PR that exports a name nothing outside query imports.
 * It lives in the script-test lane, not query's suite, because CI runs a package's tests only
 * when that package or something it depends on changes, and a core-only PR can orphan an export.
 *
 * For every name an entry in `packages/query/package.json` `exports` exposes (relative
 * re-exports followed, `./testing` exempt), some tracked non-test source in `packages/*` or
 * `apps/*` outside query must import that name FROM THAT SUBPATH, or the pair must be on
 * EXCEPTIONS with its reason. Whole-module forms (namespace, default, `export *`, dynamic
 * `import()`/`require`, `typeof import(...)`) cannot be counted name by name, so they fail
 * outright, as does a non-relative `export *` or a default export in an entry. A public export
 * with no consumer is deleted, never kept "for compatibility"; delete the symbol too when
 * nothing inside query uses it.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ts = require('typescript');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const QUERY = path.join(ROOT, 'packages/query');
const PACKAGE = '@wcpos/query';

/** `@wcpos/query/testing` is exempt as a whole: its consumers are tests, by design (#2892). */
const EXEMPT_SUBPATHS = new Set(['./testing']);

/**
 * Exported with no consumer outside query, on purpose. Keyed `<subpath> <name>`. An entry that
 * gains a consumer, or stops being exported, fails the census until it is removed from here.
 */
const EXCEPTIONS = {
	// `temporary-order/index.ts` is both the subpath entry and the implementation module: query's
	// local-patch, customer-link and order-birth import these through it, and Metro maps
	// `@wcpos/query/<subpath>` to the directory's index, so the entry cannot be narrowed without
	// splitting the module.
	'./temporary-order temporaryDB$': 'entry is the implementation module (its own test reads it)',
	'./temporary-order getTemporaryOrder':
		'entry is the implementation module (local-patch, customer-link)',
	'./temporary-order removeTemporaryOrder': 'entry is the implementation module (order-birth)',
};

const SOURCE_FILE = /\.(tsx?|mts|cts|m?js|cjs|jsx)$/;
const TEST_FILE = /\.(test|spec|stories)\.|\/(__tests__|__mocks__|tests|e2e|jest)\//;

function parse(file) {
	const kind = /\.[jt]sx$/.test(file) ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
	return ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, kind);
}

function resolveRelative(from, specifier) {
	const base = path.resolve(path.dirname(from), specifier);
	return (
		[`${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts'), path.join(base, 'index.tsx')].find(
			existsSync
		) ?? null
	);
}

const hasModifier = (node, kind) =>
	ts.canHaveModifiers(node) && (ts.getModifiers(node) ?? []).some((m) => m.kind === kind);

/** Every name a module exports, following relative re-exports; records forms the census refuses. */
function exportedNames(file, violations, isEntry = true, seen = new Set()) {
	const names = new Set();
	if (seen.has(file)) return names;
	seen.add(file);
	const where = path.relative(ROOT, file);
	for (const statement of parse(file).statements) {
		if (ts.isExportDeclaration(statement)) {
			const specifier = statement.moduleSpecifier?.text ?? null;
			const target = specifier?.startsWith('.') ? resolveRelative(file, specifier) : null;
			if (!statement.exportClause) {
				if (target) exportedNames(target, violations, false, seen).forEach((n) => names.add(n));
				else violations.push(`${where}: non-relative \`export * from '${specifier}'\``);
			} else if (ts.isNamedExports(statement.exportClause)) {
				statement.exportClause.elements.forEach((element) => names.add(element.name.text));
			} else {
				names.add(statement.exportClause.name.text);
			}
		} else if (ts.isExportAssignment(statement)) {
			if (isEntry) violations.push(`${where}: default export in an entry`);
		} else if (hasModifier(statement, ts.SyntaxKind.ExportKeyword)) {
			if (hasModifier(statement, ts.SyntaxKind.DefaultKeyword)) {
				if (isEntry) violations.push(`${where}: default export in an entry`);
			} else if (ts.isVariableStatement(statement)) {
				for (const declaration of statement.declarationList.declarations) {
					if (ts.isIdentifier(declaration.name)) names.add(declaration.name.text);
				}
			} else if (statement.name) {
				names.add(statement.name.text);
			}
		}
	}
	return names;
}

/** `@wcpos/query` → `.`, `@wcpos/query/user-db` → `./user-db`, anything else → null. */
function subpathOf(specifier) {
	if (specifier === PACKAGE) return '.';
	return specifier.startsWith(`${PACKAGE}/`) ? `./${specifier.slice(PACKAGE.length + 1)}` : null;
}

/** `<subpath> <name>` for every name a consumer imports from a query entry. */
function consumerImports(entries) {
	const imported = new Set();
	const violations = [];
	const files = execFileSync('git', ['ls-files', 'packages', 'apps'], {
		cwd: ROOT,
		encoding: 'utf8',
	})
		.split('\n')
		.filter((file) => SOURCE_FILE.test(file) && !file.startsWith('packages/query/'))
		.filter((file) => !TEST_FILE.test(`/${file}`) && existsSync(path.join(ROOT, file)));

	for (const file of files) {
		const visit = (node) => {
			const at = (form, subpath) => violations.push(`${file}: ${form} of ${subpath}`);
			const count = (subpath, name) => imported.add(`${subpath} ${name}`);
			const specifierNode =
				ts.isImportDeclaration(node) || ts.isExportDeclaration(node)
					? node.moduleSpecifier
					: ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)
						? node.argument.literal
						: ts.isCallExpression(node) &&
							  (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
									(ts.isIdentifier(node.expression) && node.expression.text === 'require'))
							? node.arguments[0]
							: undefined;
			const subpath =
				specifierNode && ts.isStringLiteralLike(specifierNode)
					? subpathOf(specifierNode.text)
					: null;
			if (subpath) {
				if (!(subpath in entries)) at('an import that is not an exports entry', subpath);
				if (ts.isImportDeclaration(node)) {
					const clause = node.importClause;
					if (clause?.name) at('a default import', subpath);
					const bindings = clause?.namedBindings;
					if (bindings && ts.isNamespaceImport(bindings)) at('a namespace import', subpath);
					else bindings?.elements.forEach((e) => count(subpath, (e.propertyName ?? e.name).text));
				} else if (ts.isExportDeclaration(node)) {
					if (node.exportClause && ts.isNamedExports(node.exportClause)) {
						node.exportClause.elements.forEach((e) =>
							count(subpath, (e.propertyName ?? e.name).text)
						);
					} else at('an `export *`', subpath);
				} else if (ts.isImportTypeNode(node)) {
					let qualifier = node.qualifier;
					while (qualifier && ts.isQualifiedName(qualifier)) qualifier = qualifier.left;
					if (qualifier) count(subpath, qualifier.text);
					else at('a whole-module `import(...)` type', subpath);
				} else at('a dynamic import or require', subpath);
			}
			ts.forEachChild(node, visit);
		};
		visit(parse(path.join(ROOT, file)));
	}
	return { imported, violations };
}

const { exports: entries } = JSON.parse(readFileSync(path.join(QUERY, 'package.json'), 'utf8'));
const entryViolations = [];
const exported = Object.entries(entries)
	.filter(([subpath]) => !EXEMPT_SUBPATHS.has(subpath))
	.flatMap(([subpath, entry]) =>
		[...exportedNames(path.join(QUERY, entry), entryViolations)].map((name) => `${subpath} ${name}`)
	);
const { imported, violations: consumerViolations } = consumerImports(entries);

test('query entries and their consumers use only forms the census can count', () => {
	assert.deepEqual([...entryViolations, ...consumerViolations], []);
});

test('every query export is imported from its subpath outside query, or a stated exception', () => {
	console.log(
		`Export census: ${exported.length} exported names; exceptions:\n${Object.entries(EXCEPTIONS)
			.map(([key, reason]) => `  ${key}: ${reason}`)
			.join('\n')}`
	);
	const unconsumed = exported.filter((key) => !imported.has(key) && !(key in EXCEPTIONS));

	// Delete each from its entry file (and the symbol, if nothing inside query uses it).
	assert.deepEqual(unconsumed, []);
});

test('every census exception is still exported and still has no consumer', () => {
	const stale = Object.keys(EXCEPTIONS).filter(
		(key) => !exported.includes(key) || imported.has(key)
	);

	assert.deepEqual(stale, []);
});
