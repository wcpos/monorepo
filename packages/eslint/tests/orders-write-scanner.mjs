import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

import ts from 'typescript';

import { ROOT } from './uniwind-scanner.mjs';

export { countSites, ROOT } from './uniwind-scanner.mjs';

// Order document identifiers (the last segment of a member chain): any name with "order" or
// "orders" as a camel-case word, so `freshOrder`, `currentOrderRecord` and `latestOrder` are
// sites while `border` and `recorder` are not. Name-based, not type-based: a writer that holds
// an order under another name (`document`, `latest`) or behind a helper escapes this fence.
const isOrderName = (name) => name.split(/(?=[A-Z])|_/).some((word) => /^orders?$/i.test(word));
// Direct document methods that mutate or delete an order.
const DOCUMENT_WRITES = new Set([
	'incrementalModify',
	'incrementalPatch',
	'patch',
	'update',
	'remove',
]);
// Engine write helpers and `engine.write` name the collection in an options argument. Reads
// (`observeEngineQuery`, `engine.require`) name it the same way and are not sites.
const ENGINE_WRITES = new Set([
	'patchEngineResident',
	'patchAndEnqueueEngineResident',
	'insertEngineResident',
	'requestServerDelete',
	'write',
]);
const ENGINE_COLLECTION_KEY = 'collection';
// Local mutation helpers take the order in their document property.
const LOCAL_WRITES = new Set(['localPatch', 'localModify']);
// Collection methods that create or replace orders.
const COLLECTION_WRITES = new Set([
	'insert',
	'bulkUpsert',
	'upsert',
	'bulkInsert',
	'incrementalUpsert',
]);
const SOURCE_ROOTS = ['packages/core/src/screens/main/pos/', 'packages/core/src/services/'];

export const BOTTOM_HANDLERS = new Set([
	// cart.line.add: the queued cart-line writer.
	'packages/core/src/screens/main/pos/hooks/use-add-item-to-order.ts',
	// cart.line.update: the queued line-update writer.
	'packages/core/src/screens/main/pos/hooks/use-update-line-item.ts',
	// checkout.tender.commit: the tender sequence, including zero-balance completion.
	'packages/core/src/screens/main/pos/checkout/tender/use-tender-flow.ts',
	// checkout.complete: finishSale is the completion writer (actions ledger 23).
	'packages/core/src/screens/main/pos/checkout/sale-completion.ts',
	// checkout.tender.commit delegates the manual leg's order writes here (actions ledger 22).
	'packages/core/src/screens/main/pos/checkout/payments/use-record-manual-payment.ts',
	// checkout.tender.commit delegates terminal leg persistence and mirroring here.
	'packages/core/src/screens/main/pos/checkout/payments/server/use-terminal-payments-service.ts',
	// checkout.tender.commit / checkout.complete delegate the order's provenance stamp here.
	'packages/core/src/screens/main/pos/checkout/provenance/persist-provenance.ts',
]);

// `order as X`, `order!`, `(order)` and `<X>order` are the same receiver.
function unwrap(node) {
	while (
		ts.isAsExpression(node) ||
		ts.isNonNullExpression(node) ||
		ts.isParenthesizedExpression(node) ||
		ts.isTypeAssertionExpression(node) ||
		ts.isSatisfiesExpression?.(node)
	)
		node = node.expression;
	return node;
}

function memberChain(node) {
	node = unwrap(node);
	return (
		ts.isIdentifier(node) || (ts.isPropertyAccessExpression(node) && memberChain(node.expression))
	);
}

function lastSegment(node) {
	node = unwrap(node);
	return ts.isIdentifier(node) ? node.text : node.name.text;
}

function propertyNamed(options, key) {
	if (!options || !ts.isObjectLiteralExpression(options)) return undefined;
	return options.properties.find(
		(property) =>
			ts.isPropertyAssignment(property) &&
			(ts.isIdentifier(property.name) || ts.isStringLiteral(property.name)) &&
			property.name.text === key
	);
}

export function scanSource(text, path) {
	if (
		!SOURCE_ROOTS.some((root) => path.startsWith(root)) ||
		!/\.tsx?$/.test(path) ||
		/\.(test|spec)\./.test(path) ||
		BOTTOM_HANDLERS.has(path)
	)
		return [];
	const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
	const sites = [];
	function visit(node) {
		if (ts.isCallExpression(node)) {
			const callee = node.expression;
			const member = ts.isPropertyAccessExpression(callee);
			const name = ts.isIdentifier(callee) ? callee.text : member ? callee.name.text : undefined;
			let construct;
			if (member && memberChain(callee.expression)) {
				const receiver = unwrap(callee.expression);
				const last = lastSegment(receiver);
				if (DOCUMENT_WRITES.has(name) && isOrderName(last)) construct = 'doc-write';
				if (
					COLLECTION_WRITES.has(name) &&
					ts.isPropertyAccessExpression(receiver) &&
					last === 'orders'
				)
					construct = 'collection-write';
			}
			if (
				LOCAL_WRITES.has(name) &&
				(ts.isIdentifier(callee) ||
					(member && ts.isIdentifier(callee.expression) && callee.expression.text === 'ctx'))
			) {
				const document = propertyNamed(node.arguments[0], 'document');
				if (document) {
					const value = unwrap(document.initializer);
					if (memberChain(value) && isOrderName(lastSegment(value))) construct = 'local-write';
				}
			}
			// patchEngineResident({ collection: 'orders' }), manager.engine.write({ collection: 'orders' }),
			// requestServerDelete(engine, { collection: 'orders' }): the options object may be any argument.
			// `write` counts only on an `engine` receiver (`engine.write`, `runtime.engine!.write`,
			// `(runtime.engine as E).write`), so an unrelated `write` is not a site.
			const engineWrite =
				ENGINE_WRITES.has(name) &&
				(name !== 'write' ||
					(member &&
						memberChain(callee.expression) &&
						lastSegment(unwrap(callee.expression)) === 'engine'));
			const namesOrders =
				engineWrite &&
				node.arguments.some((argument) => {
					const collection = propertyNamed(argument, ENGINE_COLLECTION_KEY);
					return (
						collection &&
						ts.isStringLiteral(collection.initializer) &&
						collection.initializer.text === 'orders'
					);
				});
			if (namesOrders) construct = 'engine-write';
			if (construct) {
				const { line, character } = source.getLineAndCharacterOfPosition(node.getStart(source));
				sites.push(`${path}:${line + 1}:${character + 1}:${construct}`);
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
			if (entry.isDirectory()) return walk(path);
			if (!/\.tsx?$/.test(entry.name) || /\.(test|spec)\./.test(entry.name)) return [];
			return scanSource(readFileSync(path, 'utf8'), relative(ROOT, path));
		});
	}
	return SOURCE_ROOTS.flatMap((root) => walk(join(ROOT, root))).sort();
}
