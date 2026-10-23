/**
 * ADR 0033 item 7: UI code acquires data only through named reads and writes only through
 * commands. The scan asserts zero violations in core production sources; there is no allowlist.
 * A failure names the file, the rule, the enclosing declaration chain and the node text.
 * Raw queries, resident helper writes, engine aliases, an active scope's `database` handle,
 * cross-package relative imports and raw database/collection change streams are fenced
 * syntactically: accidental leaks, not deliberate evasion. Transparent receiver/argument
 * wrappers and baseUrl-rooted package imports do not bypass these checks. TS, TSX, MTS and CTS sources are scanned. A record's own change stream
 * remains allowed (ADR 0028), including element access and destructuring. Stream fences
 * ($, eventBulks$ and collections$) share lifecycle/collection receiver names, including member
 * database handles. Engine aliases include destructuring assignments; helper re-exports are fenced,
 * and collection-named find calls accept only inline callbacks. Resident helpers are allowed only
 * in their defining modules and in `screens/main/<area>/commands/` modules.
 *
 * Four receiver rules keep member-name fences off objects that are not storage:
 * - a parameter binding (`function Row({ collection })`) declares a prop, so it is never a
 *   collection back-reference; every other fenced name stays fenced in parameter patterns;
 * - `count` is raw query construction only on a collection-shaped receiver (`collection`, a
 *   `*Collection` name reached directly or through a member, `collections.x`, `collections[…]`),
 *   the same test `find` with a variable uses;
 * - a record's `.collection` is a back-reference leak when something is reached through it or when
 *   it is destructured, not when its value is read (a log row's `collection` string);
 * - `remove` is a record mutator except on a receiver named `*Subscription` (or
 *   `*SubscriptionRef.current`) or `*Element`, or a member destructured from `useFieldArray(...)`.
 */
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, posix, relative, sep } from 'node:path';

import * as ts from 'typescript';

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
	'observeBinding',
	'observeResidentRead',
	'EngineQueryDescriptor',
	'EngineQueryRelation',
	'CompiledQueryRead',
	'EngineRxDocument',
	'EngineDocument',
	'readLiveProjection',
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
		return /\.(?:tsx?|mts|cts)$/.test(entry.name) && !/\.(?:test|stories)\./.test(entry.name)
			? [path]
			: [];
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
	'removeCollectionDoc',
	'importJSON',
	'addState',
	'bulkWrite',
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
const rawQueryNames = new Set([
	'findOne',
	'findByIds',
	'exportJSON',
	'find$',
	'findOne$',
	'insert$',
	'update$',
	'remove$',
]);
const residentHelperNames = new Set([
	'patchEngineResident',
	'patchAndEnqueueEngineResident',
	'insertEngineResident',
	'useLocalMutation',
	'useMutation',
]);
const genericResidentDoorNames = new Set([
	'applyLocalPatch',
	'createEngineResident',
	'findEngineResident',
]);
const storageNames = new Set(['db$', 'collections', 'storageInstance', 'localDB']);
const COMMAND_MODULE = /^packages\/core\/src\/screens\/main\/[^/]+\/commands\/[^/]+$/;
const SUBSCRIPTION_OR_ELEMENT = /(?:^s|S)ubscription$|Element$/;
const SUBSCRIPTION_REF = /(?:^s|S)ubscriptionRef$/;

function staticName(node: ts.Node | undefined): string | undefined {
	if (!node) return undefined;
	if (ts.isIdentifier(node) || ts.isStringLiteralLike(node)) return node.text;
	if (ts.isComputedPropertyName(node) && ts.isStringLiteralLike(node.expression))
		return node.expression.text;
	return undefined;
}

function unwrap(node: ts.Node | undefined): ts.Node | undefined {
	while (
		node &&
		(ts.isAsExpression(node) ||
			ts.isNonNullExpression(node) ||
			ts.isParenthesizedExpression(node) ||
			ts.isSatisfiesExpression(node) ||
			ts.isTypeAssertionExpression(node))
	)
		node = node.expression;
	return node;
}

function memberReceiver(node: ts.Node | undefined, name: string): ts.Expression | undefined {
	node = unwrap(node);
	if (node && ts.isPropertyAccessExpression(node) && node.name.text === name)
		return node.expression;
	if (
		node &&
		ts.isElementAccessExpression(node) &&
		ts.isStringLiteralLike(node.argumentExpression) &&
		node.argumentExpression.text === name
	)
		return node.expression;
}

function isCollectionReceiver(node: ts.Node | undefined): boolean {
	node = unwrap(node);
	if (!node) return false;
	if (ts.isIdentifier(node)) return node.text === 'collection' || node.text.endsWith('Collection');
	if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
		const name = terminalName(node);
		if (name === 'collection' || name.endsWith('Collection')) return true;
		const owner = unwrap(node.expression)!;
		return (
			(ts.isIdentifier(owner) && owner.text === 'collections') ||
			!!memberReceiver(owner, 'collections')
		);
	}
	return false;
}

/** Identifier text or member name at the end of an (unwrapped) receiver expression. */
function terminalName(node: ts.Node | undefined): string {
	node = unwrap(node);
	if (!node) return '';
	if (ts.isIdentifier(node)) return node.text;
	if (ts.isPropertyAccessExpression(node)) return node.name.text;
	if (ts.isElementAccessExpression(node) && ts.isStringLiteralLike(node.argumentExpression))
		return node.argumentExpression.text;
	return '';
}

/** A native subscription or DOM element, whose `remove()` is not a record mutator. */
function isSubscriptionOrElement(receiver: ts.Node | undefined): boolean {
	const name = terminalName(receiver);
	if (SUBSCRIPTION_OR_ELEMENT.test(name)) return true;
	const unwrapped = unwrap(receiver);
	return (
		name === 'current' &&
		!!unwrapped &&
		(ts.isPropertyAccessExpression(unwrapped) || ts.isElementAccessExpression(unwrapped)) &&
		SUBSCRIPTION_REF.test(terminalName(unwrapped.expression))
	);
}

/** `const { remove } = useFieldArray(...)`: react-hook-form's array helper, not a record. */
function fromUseFieldArray(node: ts.Node): boolean {
	if (!ts.isBindingElement(node) || !ts.isVariableDeclaration(node.parent.parent)) return false;
	const initializer = unwrap(node.parent.parent.initializer);
	return (
		!!initializer &&
		ts.isCallExpression(initializer) &&
		ts.isIdentifier(initializer.expression) &&
		initializer.expression.text === 'useFieldArray'
	);
}

/** Something is reached through the access: `doc.collection.name`, `(doc.collection as X).find()`. */
function isReachedThrough(node: ts.Node): boolean {
	let climbed = node;
	while (
		climbed.parent &&
		(ts.isParenthesizedExpression(climbed.parent) ||
			ts.isAsExpression(climbed.parent) ||
			ts.isNonNullExpression(climbed.parent) ||
			ts.isSatisfiesExpression(climbed.parent) ||
			ts.isTypeAssertionExpression(climbed.parent))
	)
		climbed = climbed.parent;
	const parent = climbed.parent;
	return (
		!!parent &&
		(ts.isPropertyAccessExpression(parent) ||
			ts.isElementAccessExpression(parent) ||
			ts.isCallExpression(parent)) &&
		parent.expression === climbed
	);
}

/** A binding element inside a parameter's pattern: `function Row({ collection })`. */
function isParameterBinding(node: ts.BindingElement): boolean {
	let top: ts.Node = node;
	while (
		ts.isBindingElement(top) ||
		ts.isObjectBindingPattern(top) ||
		ts.isArrayBindingPattern(top)
	)
		top = top.parent;
	return ts.isParameter(top);
}

function isChangeStreamReceiver(node: ts.Node): boolean {
	const receiver = unwrap(node)!;
	const name = ts.isIdentifier(receiver)
		? receiver.text
		: ts.isPropertyAccessExpression(receiver)
			? receiver.name.text
			: ts.isElementAccessExpression(receiver) &&
				  ts.isStringLiteralLike(receiver.argumentExpression)
				? receiver.argumentExpression.text
				: '';
	return isCollectionReceiver(receiver) || LIFECYCLE_RECEIVERS.has(name);
}

function isEngineReceiver(node: ts.Node | undefined): boolean {
	node = unwrap(node);
	return (
		!!node &&
		((ts.isIdentifier(node) && node.text === 'engine') || !!memberReceiver(node, 'engine'))
	);
}

/**
 * `engine.active()` or `await engine.whenActive()`: the active scope, whose `database` member is
 * the storage handle. Accepted loss: the scope held in a local (`const scope = engine.active();
 * scope.database`) is not followed.
 */
function isActiveScope(node: ts.Node | undefined): boolean {
	node = unwrap(node);
	if (node && ts.isAwaitExpression(node)) node = unwrap(node.expression);
	return (
		!!node &&
		ts.isCallExpression(node) &&
		(isEngineReceiver(memberReceiver(node.expression, 'active')) ||
			isEngineReceiver(memberReceiver(node.expression, 'whenActive')))
	);
}

function bindsEngine(name: ts.BindingName): boolean {
	return (
		ts.isObjectBindingPattern(name) &&
		name.elements.some(
			(binding) =>
				!binding.dotDotDotToken &&
				(staticName(binding.propertyName ?? binding.name) === 'engine' || bindsEngine(binding.name))
		)
	);
}

function declarationChain(node: ts.Node): string {
	const names: string[] = [];
	for (let parent = node.parent; parent; parent = parent.parent) {
		if (
			ts.isFunctionDeclaration(parent) ||
			ts.isFunctionExpression(parent) ||
			ts.isMethodDeclaration(parent) ||
			ts.isClassDeclaration(parent) ||
			ts.isClassExpression(parent) ||
			ts.isGetAccessorDeclaration(parent) ||
			ts.isSetAccessorDeclaration(parent)
		)
			names.unshift(parent.name?.getText().replace(/\s+/g, ' ').trim() ?? '<anonymous>');
		else if (ts.isConstructorDeclaration(parent)) names.unshift('constructor');
		else if (
			ts.isArrowFunction(parent) &&
			ts.isVariableDeclaration(parent.parent) &&
			ts.isVariableDeclarationList(parent.parent.parent) &&
			parent.parent.parent.flags & ts.NodeFlags.Const
		)
			names.unshift(parent.parent.name.getText());
	}
	return names.join('>');
}

function violations(source: string, path = 'seam-fixture.tsx') {
	// Accept scan paths (absolute) and fixtures relative to either the repo or core/src.
	const normalizedPath = path.replace(/\\/g, '/');
	const absolute = posix.isAbsolute(normalizedPath) || /^[A-Za-z]:\//.test(normalizedPath);
	// Absolute scan paths are inside core; keep their repo suffix even for foreign drive fixtures.
	const filePath = absolute
		? normalizedPath.slice(normalizedPath.lastIndexOf('/packages/core/') + 1)
		: normalizedPath.startsWith('packages/')
			? normalizedPath
			: posix.join('packages/core/src', normalizedPath);
	const residentHelperModules = [
		'packages/core/src/screens/main/hooks/mutations/use-local-mutation.ts',
		'packages/core/src/screens/main/hooks/mutations/use-mutation.ts',
	];
	const allowsResidentHelpers =
		COMMAND_MODULE.test(filePath) || residentHelperModules.includes(filePath);
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
	const found: { rule: string; declaration: string; text: string }[] = [];
	const report = (rule: string, node: ts.Node, text = node.getText(root)) =>
		found.push({ rule, declaration: declarationChain(node), text });
	const checkImport = (
		node: ts.Node,
		specifier: ts.Node | undefined,
		names: string[],
		wholeModule = false
	) => {
		if (!specifier || !ts.isStringLiteralLike(specifier)) return;
		const reportImport = (rule: string) => report(rule, node, `from '${specifier.text}'`);
		const rootedPackage = specifier.text.startsWith('packages/');
		if (rootedPackage) reportImport('cross-package relative import');
		const module = rootedPackage
			? specifier.text.replace(/^packages\/([^/]+)(?:\/src(?=\/|$))?/, '@wcpos/$1')
			: specifier.text;
		if (module.startsWith('.')) {
			const target = posix.normalize(posix.join(posix.dirname(filePath), module));
			if (target !== 'packages/core' && !target.startsWith('packages/core/'))
				reportImport('cross-package relative import');
		}
		const from = (name: string) => module === name || module.startsWith(`${name}/`);
		const only = (allowed: Set<string>) =>
			!wholeModule && names.length > 0 && names.every((name) => allowed.has(name));
		if (from('rxdb') || from('rxdb-premium') || from('@wcpos/database')) {
			if (module === '@wcpos/database' && only(taxNames)) return;
			if (module === '@wcpos/database/live-tab' && only(liveTabNames)) return;
			reportImport('storage import');
		}
		if (
			from('@wcpos/query') &&
			(wholeModule ||
				names.some(
					(name) =>
						forbiddenQueryNames.has(name) ||
						(module === '@wcpos/query/collection-map' && name !== 'sanitizeVariationAttributesRead')
				))
		)
			reportImport('query escape hatch');
		if (
			from('@wcpos/sync-engine') &&
			(wholeModule || names.includes('MUTATION_QUEUE_RXDB_COLLECTION'))
		)
			reportImport('mutation queue');
	};
	const checkProperty = (node: ts.Node, name: string | undefined, receiver?: ts.Node) => {
		if (!name) return;
		if (
			storageNames.has(name) ||
			(name === 'collections$' && receiver && isChangeStreamReceiver(receiver))
		)
			report('storage token', node);
		// A parameter binding declares a prop named `collection`; only the back-reference check
		// skips it. Every other fenced name stays fenced in parameter patterns.
		const destructured =
			(ts.isBindingElement(node) && !isParameterBinding(node)) ||
			ts.isPropertyAssignment(node) ||
			ts.isShorthandPropertyAssignment(node);
		if (name === 'collection' && (destructured || isReachedThrough(node)))
			report('record collection back-reference', node);
		if (
			mutatorNames.has(name) &&
			!(name === 'remove' && (isSubscriptionOrElement(receiver) || fromUseFieldArray(node)))
		)
			report('record mutator', node);
		if (rawQueryNames.has(name) || (name === 'count' && isCollectionReceiver(receiver)))
			report('raw query construction', node);
		if ((name === '$' || name === 'eventBulks$') && receiver && isChangeStreamReceiver(receiver))
			report('raw change stream', node);
		if (
			(name === 'write' || name === 'resolveConflict' || name === 'adoptOrderSnapshot') &&
			isEngineReceiver(receiver)
		)
			report('write plane outside a command module', node);
		if (name === 'database' && isActiveScope(receiver))
			report('storage handle outside a named read', node);
		if (name === 'require' && isEngineReceiver(receiver))
			report('require plane outside a named read', node);
		if (name === 'resetCollection' && isEngineReceiver(memberReceiver(receiver, 'scope')))
			report('collection reset outside the reset command', node);
	};
	const visit = (node: ts.Node) => {
		if (
			ts.isVariableDeclaration(node) &&
			node.initializer &&
			(isEngineReceiver(node.initializer) ||
				isEngineReceiver(memberReceiver(node.initializer, 'scope')) ||
				bindsEngine(node.name))
		)
			report('engine handle aliased', node);
		if (
			ts.isBinaryExpression(node) &&
			node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
			(isEngineReceiver(node.right) || isEngineReceiver(memberReceiver(node.right, 'scope')))
		)
			report('engine handle aliased', node);
		if (ts.isImportDeclaration(node)) {
			const bindings = node.importClause?.namedBindings;
			if (!allowsResidentHelpers) {
				if (node.importClause?.name && residentHelperNames.has(node.importClause.name.text))
					report('resident helper write', node.importClause.name);
				if (node.importClause?.name && genericResidentDoorNames.has(node.importClause.name.text))
					report('generic resident door', node.importClause.name);
				if (bindings && ts.isNamedImports(bindings)) {
					for (const binding of bindings.elements) {
						if (
							residentHelperNames.has((binding.propertyName ?? binding.name).text) ||
							residentHelperNames.has(binding.name.text)
						)
							report('resident helper write', binding);
						if (
							genericResidentDoorNames.has((binding.propertyName ?? binding.name).text) ||
							genericResidentDoorNames.has(binding.name.text)
						)
							report('generic resident door', binding);
					}
				}
			}
			const names =
				bindings && ts.isNamedImports(bindings)
					? bindings.elements.map((binding) => (binding.propertyName ?? binding.name).text)
					: [];
			if (node.importClause?.name) names.push('default');
			checkImport(node, node.moduleSpecifier, names, !!bindings && ts.isNamespaceImport(bindings));
		} else if (ts.isExportDeclaration(node)) {
			const bindings = node.exportClause;
			if (!allowsResidentHelpers && node.moduleSpecifier) {
				if (bindings && ts.isNamedExports(bindings)) {
					for (const binding of bindings.elements) {
						if (
							residentHelperNames.has((binding.propertyName ?? binding.name).text) ||
							residentHelperNames.has(binding.name.text)
						)
							report('resident helper write', binding);
						if (
							genericResidentDoorNames.has((binding.propertyName ?? binding.name).text) ||
							genericResidentDoorNames.has(binding.name.text)
						)
							report('generic resident door', binding);
					}
				} else if (ts.isStringLiteralLike(node.moduleSpecifier)) {
					const target = posix.join(posix.dirname(filePath), node.moduleSpecifier.text);
					if (
						residentHelperModules.some((module) => target === module || `${target}.ts` === module)
					)
						report('resident helper write', node);
				}
			}
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
			const name = ts.isPropertyAccessExpression(callee)
				? callee.name.text
				: ts.isElementAccessExpression(callee)
					? staticName(callee.argumentExpression)
					: staticName(callee);
			if (!allowsResidentHelpers && name && residentHelperNames.has(name))
				report('resident helper write', callee);
			if (!allowsResidentHelpers && name && genericResidentDoorNames.has(name))
				report('generic resident door', callee);
			const findReceiver = memberReceiver(callee, 'find');
			const argument = unwrap(node.arguments[0]);
			if (
				findReceiver &&
				(!argument ||
					ts.isObjectLiteralExpression(argument) ||
					(isCollectionReceiver(findReceiver) &&
						!ts.isFunctionExpression(argument) &&
						!ts.isArrowFunction(argument)))
			)
				report('raw query construction', node);
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
				const receiver = unwrap(callee.expression)!;
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
			) {
				if (staticName(node.name) === 'engine') report('engine handle aliased', node);
				checkProperty(
					node,
					staticName(node.name),
					pattern === node.parent ? assignment.right : undefined
				);
			}
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

const REMEDY = [
	'Route each access through a named read or command in @wcpos/query (resident helpers: a',
	'screens/main/<area>/commands/ module), adding the read or command if none exists. If the',
	'access touches no storage, rename the receiver to *Subscription / *Element or destructure it',
	'from useFieldArray(...); otherwise add a receiver rule to seam.test.ts with one allowed and',
	'one fenced fixture. There is no list to add it to.',
].join('\n');

function formatViolations(byFile: typeof violationsByFile): string {
	const lines = byFile.flatMap(({ file, matches }) =>
		matches.map(
			({ rule, declaration, text }) =>
				`${file}: ${rule} — ${text.replace(/\s+/g, ' ').trim()} (${declaration || 'top level'})`
		)
	);
	return [`ADR 0033 seam violations in packages/core:`, ...lines, '', REMEDY].join('\n');
}

it('finds no seam violation in packages/core production sources', () => {
	if (violationsByFile.length) throw new Error(formatViolations(violationsByFile));
});

it('formats a failing scan as one line per match followed by the remedy', () => {
	const byFile = [
		{ file: 'a.ts', matches: violations('function save() {\n doc.remove(); }\ndoc.patch;') },
	];
	expect(formatViolations(byFile)).toBe(
		[
			'ADR 0033 seam violations in packages/core:',
			'a.ts: record mutator — doc.remove (save)',
			'a.ts: record mutator — doc.patch (top level)',
			'',
			REMEDY,
		].join('\n')
	);
});

it('names the enclosing declaration chain, outermost first', () => {
	const source = `function outer() {
		class Store { refresh() { const reload = () => {
			function inner() { doc.remove(); }
		}; } }
	}`;
	expect(violations(source)[0].declaration).toBe('outer>Store>refresh>reload>inner');
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

it.each(['doc.patch({});', 'doc.incrementalPatch({});', 'result.patch({});'])(
	'fences a mutator call: %s',
	(source) => {
		expect(violations(source).map(({ rule }) => rule)).toEqual(['record mutator']);
	}
);

it.each([
	'const mutate = order.incrementalPatch; mutate({});',
	'const { patch } = order; patch({});',
])('fences an extracted mutator: %s', (source) => {
	expect(violations(source).map(({ rule }) => rule)).toEqual(['record mutator']);
});

it('fences a mutator bound for a later call', () => {
	expect(violations('wpUser.incrementalPatch.bind(wpUser);').map(({ rule }) => rule)).toEqual([
		'record mutator',
	]);
});

// Every mutator spelling is fenced across calls, extraction and binding patterns.
it.each(
	(
		'incrementalPatch incrementalModify incrementalRemove incrementalUpsert incrementalUpdate ' +
		'modify update patch remove insert upsert insertIfNotExists putAttachment putAttachments ' +
		'putAttachmentBase64 save updateCRDT insertCRDT addState bulkInsert bulkUpsert bulkRemove ' +
		'bulkWrite insertLocal upsertLocal getLocal getLocal$ atomicUpdate atomicPatch'
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

it.each(['db$', 'collections', 'storageInstance', 'localDB'])(
	'fences all storage accesses of %s',
	(name) => {
		for (const source of [`doc?.${name};`, `doc?.['${name}'];`, `const { ${name}: value } = doc;`])
			expect(violations(source).map(({ rule }) => rule)).toEqual(['storage token']);
	}
);

it('fences a record collection back-reference only when chained or destructured', () => {
	for (const source of [
		'doc?.collection.name;',
		"doc?.['collection']?.name;",
		'const { collection: value } = doc;',
		'({ collection: value } = doc);',
	])
		expect(violations(source).map(({ rule }) => rule)).toEqual([
			'record collection back-reference',
		]);
	// A query through the back-reference is also a raw query: the receiver is collection-shaped.
	expect(violations("doc?.['collection']?.find(query);").map(({ rule }) => rule)).toEqual([
		'raw query construction',
		'record collection back-reference',
	]);
	for (const source of ['doc?.collection;', "doc?.['collection'];"])
		expect(violations(source)).toEqual([]);
});

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
	).toEqual([{ rule: 'record mutator', declaration: '', text: 'doc.save' }]);
});

it('reports the full accessed AST text so failures name long accesses', () => {
	const source = `${'receiver'.repeat(20)}.remove`;
	expect(violations(`${source}()`)).toEqual([
		{ rule: 'record mutator', declaration: '', text: source },
	]);
});

// Engine methods are fenced by receiver, not on unrelated objects with the same names.
it.each(['write', 'resolveConflict', 'adoptOrderSnapshot'])(
	'fences engine %s calls and extraction',
	(name) => {
		for (const receiver of [
			'engine',
			'object.engine',
			"runtime['engine']",
			"runtime?.['engine']",
		]) {
			for (const source of [
				`${receiver}.${name}({});`,
				`${receiver}['${name}']({});`,
				`${receiver}?.['${name}']?.({});`,
				`const fn = ${receiver}.${name};`,
				`const fn = ${receiver}['${name}'];`,
				`const { ${name} } = ${receiver};`,
				`const { ['${name}']: fn } = ${receiver};`,
			])
				expect(violations(source).map(({ rule }) => rule)).toContain(
					'write plane outside a command module'
				);
		}
	}
);

it.each([
	['require', 'require plane outside a named read'],
	['resetCollection', 'collection reset outside the reset command'],
])('fences receiver-aware %s calls and extraction', (name, rule) => {
	for (const engine of ['engine', 'runtime.engine', "runtime['engine']", "runtime?.['engine']"]) {
		const receivers =
			name === 'require'
				? [engine]
				: [`${engine}.scope`, `${engine}['scope']`, `${engine}?.['scope']`];
		for (const receiver of receivers) {
			for (const source of [
				`${receiver}.${name}();`,
				`${receiver}['${name}']();`,
				`${receiver}?.['${name}']?.();`,
				`const fn = ${receiver}.${name};`,
				`const fn = ${receiver}['${name}'];`,
				`const { ${name}: fn } = ${receiver};`,
				`const { ['${name}']: fn } = ${receiver};`,
			])
				expect(violations(source).map(({ rule }) => rule)).toContain(rule);
		}
	}
});

it.each([
	'other.require();',
	'const { require: fn } = other;',
	"runtime[engine]['require']();",
	'other.scope.resetCollection();',
	'engine.resetCollection();',
	'engine.other.resetCollection();',
	"engine[scope]['resetCollection']();",
	'const { resetCollection } = other.scope;',
])('allows unrelated require/reset receivers in %s', (source) => {
	expect(violations(source)).toEqual([]);
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
	"runtime['writer'].write();",
	"const { resolveConflict } = runtime['other'];",
	'runtime[engine].write();',
	'const { write, resolveConflict } = other;',
	"const fn = other['resolveConflict'];",
	'other.adoptOrderSnapshot({});',
])('allows unrelated receivers in %s', (source) => {
	expect(violations(source)).toEqual([]);
});

it('parses TypeScript assertions and generic arrows as TS, not TSX', () => {
	expect(violations('const fn = <T>(doc: T) => (<T>doc).remove;', 'fixture.ts')).toEqual([
		{ rule: 'record mutator', declaration: 'fn', text: '(<T>doc).remove' },
	]);
});

it.each(['fixture.ts', 'fixture.tsx'])('fails the scan on parse errors in %s', (path) => {
	expect(() => violations('const broken = ; doc.remove();', path)).toThrow(path);
});

it.each([
	'findOne',
	'findByIds',
	'exportJSON',
	'find$',
	'findOne$',
	'insert$',
	'update$',
	'remove$',
])('fences raw query member %s including extraction', (name) => {
	for (const source of [
		`alias.${name}({});`,
		`alias['${name}']();`,
		`alias?.['${name}']?.();`,
		`const query = alias.${name};`,
		`const query = alias['${name}'];`,
		`const { ${name}: query } = alias;`,
		`const { ['${name}']: query } = alias;`,
		`({ ${name}: query } = alias);`,
	]) {
		expect(violations(source).map(({ rule }) => rule)).toEqual(['raw query construction']);
	}
});

it.each([
	'collection',
	'ordersCollection',
	'collections.orders',
	"collections['orders']",
	'collections[name]',
	'db.collections.orders',
])('fences raw query member count on collection receiver %s including extraction', (receiver) => {
	for (const source of [
		`${receiver}.count({});`,
		`${receiver}['count']();`,
		`${receiver}?.['count']?.();`,
		`const query = ${receiver}.count;`,
		`const { count: query } = ${receiver};`,
		`({ count: query } = ${receiver});`,
	])
		expect(violations(source).filter(({ rule }) => rule === 'raw query construction')).toHaveLength(
			1
		);
});

it.each([
	'alias.find({ selector: {} });',
	"alias['find']({});",
	"alias?.['find']?.({});",
	'alias.find();',
	"alias['find']();",
	"alias?.['find']?.();",
])('fences raw find construction in %s', (source) => {
	expect(violations(source).map(({ rule }) => rule)).toEqual(['raw query construction']);
});

it.each([
	'items.find((x) => x.id);',
	'items.find(predicateFn);',
	"items['find'](predicateFn);",
	"str.indexOf('x');",
	'insert(value);',
	'const { db } = other;',
])('allows unrelated collection/helper/handle syntax in %s', (source) => {
	expect(violations(source)).toEqual([]);
});

it.each([
	'patchEngineResident',
	'patchAndEnqueueEngineResident',
	'insertEngineResident',
	'useLocalMutation',
	'useMutation',
])('fences resident helper %s imports and calls outside command modules', (name) => {
	for (const source of [
		`import { ${name} } from './helpers';`,
		`import { ${name} as helper } from './helpers';`,
		`${name}({});`,
		`helpers.${name}({});`,
		`helpers['${name}']({});`,
	]) {
		expect(violations(source, 'screens/main/example.tsx').map(({ rule }) => rule)).toEqual([
			'resident helper write',
		]);
	}
});

it.each([
	'screens/main/hooks/mutations/use-local-mutation.ts',
	'screens/main/hooks/mutations/use-mutation.ts',
	'screens/main/pos/commands/example.ts',
])('allows resident helpers in defining/command module %s', (path) => {
	expect(
		violations("import { patchEngineResident } from './helpers'; patchEngineResident({});", path)
	).toEqual([]);
});

it.each([
	'extensions/commands/example.ts',
	'screens/main/commands/example.ts',
	'screens/main/pos/commands/nested/example.ts',
	'screens/main/pos/other/commands/example.ts',
])('fences resident helpers outside screens/main/<area>/commands/: %s', (path) => {
	expect(violations('patchEngineResident({});', path).map(({ rule }) => rule)).toEqual([
		'resident helper write',
	]);
});

it('does not exempt other modules alongside the defining mutation helpers', () => {
	expect(
		violations('patchEngineResident({});', 'screens/main/hooks/mutations/other.ts').map(
			({ rule }) => rule
		)
	).toEqual(['resident helper write']);
});

it.each([
	'const writer = engine;',
	'const writer = runtime.engine;',
	"const writer = runtime['engine'];",
	"const writer = runtime?.['engine'];",
	'const { engine } = runtime;',
	'const { engine: writer } = runtime;',
	"const { ['engine']: writer } = runtime;",
	'const { nested: { engine } } = runtime;',
	'const { safe } = engine;',
	'const [writer] = runtime.engine;',
	'const scope = engine.scope;',
	"const scope = runtime['engine']['scope'];",
	'const { safe } = runtime.engine.scope;',
])('fences an engine handle stored in a local: %s', (source) => {
	expect(violations(source).map(({ rule }) => rule)).toEqual(['engine handle aliased']);
});

it.each([
	"import { value } from '../../database/src';",
	"export { value } from '../../database/src';",
	"const value = import('../../database/src');",
	"const value = require('../../database/src');",
	"type Value = import('../../database/src').Value;",
])('fences cross-package relative imports: %s', (source) => {
	for (const path of ['packages/core/src/example.ts', 'example.ts', `${__dirname}/example.ts`]) {
		expect(violations(source, path).map(({ rule }) => rule)).toEqual([
			'cross-package relative import',
		]);
	}
});

it.each(['./helpers', '../utils', '../../core/src/helpers'])(
	'allows relative imports within core: %s',
	(specifier) => {
		expect(
			violations(`import { value } from '${specifier}';`, 'packages/core/src/example.ts')
		).toEqual([]);
	}
);

it.each(['doc.getLocal$;', "doc['getLocal$']();", 'const { getLocal$ } = doc;'])(
	'fences getLocal$ in %s',
	(source) => {
		expect(violations(source).map(({ rule }) => rule)).toEqual(['record mutator']);
	}
);

it.each([
	['collection.$.subscribe(listener);', 'collection.$'],
	['db.$.pipe(operator);', 'db.$'],
	['database.$;', 'database.$'],
	['ordersCollection.$;', 'ordersCollection.$'],
	['collections.orders.$;', 'collections.orders.$'],
	["collections['orders'].$;", "collections['orders'].$"],
	['db.collections.orders.$;', 'db.collections.orders.$'],
	["db.collections['orders'].$;", "db.collections['orders'].$"],
	['collection?.$?.subscribe(listener);', 'collection?.$'],
])('fences raw change streams in %s', (source, text) => {
	expect(violations(source).filter(({ rule }) => rule === 'raw change stream')).toEqual([
		{ rule: 'raw change stream', declaration: '', text },
	]);
});

it.each(['order.$;', 'doc.$;', 'record.$;', 'this.$;'])(
	'allows record change streams in %s',
	(source) => {
		expect(violations(source)).toEqual([]);
	}
);

// Round 6: transparent syntax must not hide receiver-aware fences.
it.each(
	[
		'(runtime.engine as X)',
		'runtime.engine!',
		'(runtime.engine)',
		'(runtime.engine satisfies X)',
		'(<X>runtime.engine)',
	].flatMap((receiver) => [
		[`${receiver}.write();`, 'write plane outside a command module'],
		[`${receiver}.require();`, 'require plane outside a named read'],
	])
)('fences engine methods through transparent wrappers: %s', (source, rule) => {
	expect(violations(source, 'fixture.ts').map(({ rule }) => rule)).toEqual([rule]);
});

it.each(
	[
		'(collection as X)',
		'collection!',
		'(collection)',
		'(collection satisfies X)',
		'(<X>collection)',
	].flatMap((receiver) => [
		[`${receiver}.$;`, 'raw change stream'],
		[`${receiver}.close();`, 'database or collection lifecycle (close) outside the data layer'],
	])
)('fences collection receivers through transparent wrappers: %s', (source, rule) => {
	expect(violations(source, 'fixture.ts').map(({ rule }) => rule)).toEqual([rule]);
});

it.each([
	'runtime.engine.active()?.database;',
	'(engine.active() as Scope).database;',
	'const { database } = runtime.engine.active()!;',
	'(await runtime.engine.whenActive()).database;',
	'const { database } = await engine.whenActive();',
])('fences the storage handle on an active scope: %s', (source) => {
	expect(violations(source, 'fixture.ts').map(({ rule }) => rule)).toEqual([
		'storage handle outside a named read',
	]);
});

it('allows a database member on anything but an active scope', () => {
	expect(violations('site.database; error.database; runtime.engine.active()?.name;')).toEqual([]);
});

it('unwraps nested engine scope receivers', () => {
	expect(
		violations('((runtime.engine!).scope as Scope).resetCollection();').map(({ rule }) => rule)
	).toEqual(['collection reset outside the reset command']);
});

it.each([
	'collection.find(query);',
	'collections.orders.find(q);',
	"collections['orders']['find'](options.query);",
	'ordersCollection.find(options.query);',
	"ordersCollection?.['find']?.(options['query']);",
	'(collection as X).find(query);',
])('fences collection-named find with a query variable: %s', (source) => {
	expect(violations(source).filter(({ rule }) => rule === 'raw query construction')).toHaveLength(
		1
	);
});

it.each([
	'collection.find((x) => x.id);',
	'collection.find(function predicate(x) { return x.id; });',
	'items.find(pred);',
	'items.find(options.predicate);',
	'(record as X).$;',
	'(dialog as X).close();',
	'(other as X).write();',
])('keeps unrelated/callback receiver syntax allowed: %s', (source) => {
	expect(violations(source)).toEqual([]);
});

it.each(['C:/repo/packages/core/src/x.ts', 'C:\\repo\\packages\\core\\src\\x.ts'])(
	'resolves Windows absolute scan paths before checking relative imports: %s',
	(path) => {
		expect(violations("import '../../database/src';", path).map(({ rule }) => rule)).toEqual([
			'cross-package relative import',
		]);
		expect(violations("import './helpers';", path)).toEqual([]);
	}
);

it.each([
	[
		"import { Database } from 'packages/database/src';",
		['cross-package relative import', 'storage import'],
	],
	["export * from 'packages/query/src';", ['cross-package relative import', 'query escape hatch']],
	[
		"import { EngineCollection } from 'packages/query';",
		['cross-package relative import', 'query escape hatch'],
	],
	[
		"import { MUTATION_QUEUE_RXDB_COLLECTION } from 'packages/sync-engine/src';",
		['cross-package relative import', 'mutation queue'],
	],
	[
		"const module = import('packages/database/src');",
		['cross-package relative import', 'storage import'],
	],
	["import { helper } from 'packages/utils/src';", ['cross-package relative import']],
])('fences baseUrl-rooted package imports: %s', (source, rules) => {
	expect(violations(source).map(({ rule }) => rule)).toEqual(rules);
});

// Round 7: transparent arguments, assignments and alternate access/file spellings.
it.each(['VALUE as Query', 'VALUE satisfies Query', '(VALUE)', 'VALUE!', '<Query>VALUE'])(
	'unwraps find arguments before classifying them: %s',
	(wrapper) => {
		for (const argument of ['{}', 'query', 'options.query', "options['query']"]) {
			const source = `collection.find((${wrapper.replace('VALUE', argument)}));`;
			expect(violations(source, 'fixture.ts').map(({ rule }) => rule)).toEqual([
				'raw query construction',
			]);
		}
		expect(
			violations(`items.find((${wrapper.replace('VALUE', '{}')}));`, 'fixture.ts').map(
				({ rule }) => rule
			)
		).toEqual(['raw query construction']);
		for (const argument of ['(x => x.id)', '(function(x) { return x.id; })'])
			expect(
				violations(`collection.find((${wrapper.replace('VALUE', argument)}));`, 'fixture.ts')
			).toEqual([]);
		expect(
			violations(`items.find((${wrapper.replace('VALUE', 'predicateFn')}));`, 'fixture.ts')
		).toEqual([]);
	}
);

it.each([
	'writer = engine;',
	'writer = runtime.engine;',
	"writer = runtime['engine'];",
	'scope = engine.scope;',
	"scope = runtime['engine']['scope'];",
	'holder.writer = (runtime.engine as Engine);',
])('fences an engine handle assigned to an existing target: %s', (source) => {
	expect(violations(source).map(({ rule }) => rule)).toEqual(['engine handle aliased']);
});

it.each(['writer = other;', 'scope = other.scope;', 'writer === runtime.engine;'])(
	'allows unrelated assignments and engine comparisons: %s',
	(source) => expect(violations(source)).toEqual([])
);

it.each([
	['observeBinding', 'engine-query'],
	['observeResidentRead', 'resident-read'],
])('fences query primitive %s at the root and every subpath', (name, subpath) => {
	for (const module of ['@wcpos/query', `@wcpos/query/${subpath}`, '@wcpos/query/other']) {
		for (const source of [
			`import { ${name} as read } from '${module}';`,
			`export { ${name} as read } from '${module}';`,
		])
			expect(violations(source).map(({ rule }) => rule)).toEqual(['query escape hatch']);
	}
});

it.each([
	'collection',
	'db',
	'database',
	'ordersCollection',
	'collections.orders',
	"collections['orders']",
])('fences element and destructured change streams on %s', (receiver) => {
	for (const source of [
		`${receiver}['$'];`,
		`${receiver}?.['$'];`,
		`const { $: changes } = ${receiver};`,
		`const { ['$']: changes } = ${receiver};`,
		`({ $: changes } = ${receiver});`,
	])
		expect(violations(source).filter(({ rule }) => rule === 'raw change stream')).toHaveLength(1);
});

it.each(['order', 'record', 'this'])(
	'allows element and destructured record change streams on %s',
	(receiver) => {
		for (const source of [`${receiver}['$'];`, `const { $: changes } = ${receiver};`])
			expect(violations(source)).toEqual([]);
	}
);

it('walks ts/tsx/mts/cts sources while excluding tests, stories and test directories', () => {
	const directory = mkdtempSync(join(__dirname, '.seam-walker-'));
	try {
		for (const extension of ['ts', 'tsx', 'mts', 'cts', 'js']) {
			for (const name of ['source', 'source.test', 'source.stories'])
				writeFileSync(join(directory, `${name}.${extension}`), 'doc.remove();');
		}
		for (const name of ['nested', '__tests__', '__mocks__', 'jest']) {
			mkdirSync(join(directory, name));
			writeFileSync(join(directory, name, 'source.mts'), '(<Record>doc).remove();');
		}
		const paths = sourceFiles(directory);
		expect(paths.map((path) => relative(directory, path).split(sep).join('/')).sort()).toEqual([
			'nested/source.mts',
			'source.cts',
			'source.mts',
			'source.ts',
			'source.tsx',
		]);
		for (const path of paths)
			expect(violations(readFileSync(path, 'utf8'), path).map(({ rule }) => rule)).toEqual([
				'record mutator',
			]);
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
});

// Round 8: non-callback queries, helper barrels and shared stream receiver names.
it.each([
	'collection.find(buildQuery());',
	'collections.orders.find(`selector`);',
	"collections['orders']['find'](new Query());",
	'ordersCollection.find(query ?? fallback);',
	'collection.find((buildQuery() as Query));',
	'collection.find(null);',
])('fences every non-callback query on collection receivers: %s', (source) => {
	expect(violations(source).filter(({ rule }) => rule === 'raw query construction')).toHaveLength(
		1
	);
});

it.each([
	"export { useMutation as mutate } from './hooks/mutations/use-mutation';",
	"export { helper as useMutation } from './helpers';",
	"export { patchEngineResident } from './helpers';",
	"export * from './hooks/mutations/use-mutation';",
	"export * from './hooks/mutations/use-local-mutation';",
	"export * as mutations from './hooks/mutations/use-local-mutation';",
])('fences resident helper re-exports outside defining/command modules: %s', (source) => {
	expect(violations(source, 'screens/main/example.ts').map(({ rule }) => rule)).toEqual([
		'resident helper write',
	]);
	for (const path of [
		'screens/main/hooks/mutations/use-mutation.ts',
		'screens/main/hooks/mutations/use-local-mutation.ts',
		'screens/main/pos/commands/example.ts',
	]) {
		expect(violations(source, path)).toEqual([]);
	}
});

it.each([
	"export * from './helpers';",
	"export { insert } from './helpers';",
	"export * from './unrelated/use-mutation';",
])('allows unrelated helper barrels: %s', (source) => {
	expect(violations(source, 'screens/main/example.ts')).toEqual([]);
});

it.each(['localDB', 'storeDB', 'userDB', 'fastStoreDB'])(
	'fences change streams on lifecycle receiver %s',
	(receiver) => {
		for (const source of [
			`${receiver}.$;`,
			`${receiver}['$'];`,
			`const { $: changes } = ${receiver};`,
			`(${receiver} as Database).$;`,
		]) {
			expect(violations(source).map(({ rule }) => rule)).toEqual(['raw change stream']);
		}
	}
);

it.each([
	'db',
	'database',
	'localDB',
	'storeDB',
	'userDB',
	'fastStoreDB',
	'collection',
	'ordersCollection',
	'collections.orders',
	"collections['orders']",
])('fences collections$ on database/collection receiver %s', (receiver) => {
	for (const source of [
		`${receiver}.collections$;`,
		`${receiver}['collections$'];`,
		`const { collections$: changes } = ${receiver};`,
	]) {
		expect(violations(source).filter(({ rule }) => rule === 'storage token')).toHaveLength(1);
	}
});

it.each(['order', 'doc', 'record', 'this'])('allows unrelated collections$ on %s', (receiver) => {
	for (const source of [
		`${receiver}.collections$;`,
		`${receiver}['collections$'];`,
		`const { collections$: changes } = ${receiver};`,
	]) {
		expect(violations(source)).toEqual([]);
	}
});

// Round 9: assignment bindings, member database handles and existing storage APIs.
it.each([
	'({ engine: writer } = runtime);',
	'({ engine } = runtime);',
	"({ ['engine']: writer } = runtime);",
	'({ engine: writer = fallback } = runtime);',
	'({ nested: { engine: writer } } = runtime);',
])('fences engine aliases in destructuring assignments: %s', (source) => {
	expect(violations(source).map(({ rule }) => rule)).toEqual(['engine handle aliased']);
});

it.each(['({ db: writer } = runtime);', '({ engine: writer });', '({ [key]: writer } = runtime);'])(
	'allows unrelated assignment patterns and object literals: %s',
	(source) => {
		expect(violations(source)).toEqual([]);
	}
);

it.each(['db', 'database', 'localDB', 'storeDB', 'userDB', 'fastStoreDB'])(
	'fences streams on member database handle %s',
	(name) => {
		for (const receiver of [`manager.${name}`, `manager['${name}']`, `manager.active()?.${name}`]) {
			for (const [member, rule] of [
				['$', 'raw change stream'],
				['collections$', 'storage token'],
			]) {
				for (const source of [
					`${receiver}.${member};`,
					`${receiver}['${member}'];`,
					`const { ${member}: changes } = ${receiver};`,
				])
					expect(
						violations(source).filter((match) => match.rule === rule && match.text.includes(member))
					).toHaveLength(1);
			}
		}
	}
);

it.each([
	'database.removeCollectionDoc("orders");',
	"database['removeCollectionDoc']('orders');",
	'const remove = database.removeCollectionDoc;',
	'const { removeCollectionDoc: remove } = database;',
	'({ removeCollectionDoc: remove } = database);',
])('fences database collection removal: %s', (source) => {
	expect(violations(source).map(({ rule }) => rule)).toEqual(['record mutator']);
});

it.each(['collection', 'db', 'ordersCollection', 'collections.orders', "collections['orders']"])(
	'fences eventBulks$ on database/collection receiver %s',
	(receiver) => {
		for (const source of [
			`${receiver}.eventBulks$.pipe(operator);`,
			`${receiver}['eventBulks$'];`,
			`const { eventBulks$: changes } = ${receiver};`,
			`({ eventBulks$: changes } = ${receiver});`,
		])
			expect(violations(source).filter(({ rule }) => rule === 'raw change stream')).toHaveLength(1);
	}
);

it.each(['order', 'record', 'this', 'manager.record', "manager['record']", 'manager[database]'])(
	'allows streams on unrelated or dynamic receivers: %s',
	(receiver) => {
		for (const member of ['$', 'eventBulks$', 'collections$'])
			expect(violations(`${receiver}['${member}'];`)).toEqual([]);
	}
);

it.each(['applyLocalPatch', 'createEngineResident', 'findEngineResident'])(
	'fences the generic resident door %s independently of the module',
	(name) => {
		for (const source of [
			`import { ${name} as alias } from '@wcpos/query/mutations';`,
			`import { safe as ${name} } from './other';`,
			`import ${name} from './other';`,
			`${name}(manager, input);`,
			`helpers['${name}'](manager, input);`,
			`export { ${name} as alias } from './other';`,
		]) {
			expect(violations(source).map(({ rule }) => rule)).toEqual(['generic resident door']);
			for (const path of [
				'screens/main/hooks/mutations/use-local-mutation.ts',
				'screens/main/hooks/mutations/use-mutation.ts',
				'screens/main/pos/commands/write.ts',
			])
				expect(violations(source, path)).toEqual([]);
		}
	}
);

// Member-name false positives the receiver rules recognise (the 56 retired with the allowlist).
it.each([
	'term.count;',
	'React.Children.count(children);',
	'hit.record.payload.count;',
	'function Row({ count, collection }) {}',
	'const f = ({ status, count }) => count;',
	'label(first.collection);',
	'const s = `${stuck.collection}`;',
	"typeof context.collection === 'string';",
	'subscription.remove();',
	'subscriptionRef.current?.remove();',
	'hardwareSubscription?.remove();',
	'anchorElement.remove();',
	'const { fields, append, remove } = useFieldArray({ control, name });',
	// Intended asymmetry: see the fenced `const { collection } = props;` fixture below.
	'function P({ collection }) {}',
])('allows a member that shares a fenced name but touches no storage: %s', (source) => {
	expect(violations(source)).toEqual([]);
});

// The historic true positives stay fenced under the receiver rules.
it.each([
	['logsCollection.count();', 'raw query construction'],
	['collection.count({ selector: {} });', 'raw query construction'],
	['collections.orders.count();', 'raw query construction'],
	['collections[name].count();', 'raw query construction'],
	['db.collections.orders.count();', 'raw query construction'],
	['const { count } = ordersCollection;', 'raw query construction'],
	['doc.collection.name;', 'record collection back-reference'],
	['doc.collection?.find(query);', 'record collection back-reference'],
	['(doc.collection as X).insert({});', 'record collection back-reference'],
	["doc['collection']['name'];", 'record collection back-reference'],
	['const { collection } = doc;', 'record collection back-reference'],
	['doc.remove();', 'record mutator'],
	['latest(doc).remove();', 'record mutator'],
	['profile.getLatest().remove();', 'record mutator'],
	['const { remove } = doc;', 'record mutator'],
	['const { remove } = useRecord();', 'record mutator'],
	['hardware?.remove();', 'record mutator'],
	['function Row({ doc: { remove } }) {}', 'record mutator'],
	['const f = ({ collections }) => 0;', 'storage token'],
	['function Row({ patch }) {}', 'record mutator'],
	['promise.then(({ collections }) => 0);', 'storage token'],
	['runtime.logsCollection.count();', 'raw query construction'],
	['this.ordersCollection.count();', 'raw query construction'],
	['rows[anchorElement].remove();', 'record mutator'],
	// Intended asymmetry: a `collection` prop is a declaration, destructuring it from a value reads it.
	['function P(props) { const { collection } = props; }', 'record collection back-reference'],
])('still fences %s', (source, rule) => {
	expect(violations(source, 'fixture.ts').map((match) => match.rule)).toContain(rule);
});
