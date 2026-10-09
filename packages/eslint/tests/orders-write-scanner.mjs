import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

import ts from 'typescript';

import { ROOT } from './uniwind-scanner.mjs';

export { countSites, ROOT } from './uniwind-scanner.mjs';

// Order document identifiers (the last segment of a member chain): any name that says "order",
// so `freshOrder`, `currentOrderRecord` and `latestOrder` are sites too. A writer that holds an
// order under a name without the word (`document` in temporary-order.ts) escapes this fence;
// the scanner is name-based, not type-based.
const ORDER_DOCUMENT = /order/i;
// Direct document methods that mutate an order.
const DOCUMENT_WRITES = new Set(['incrementalModify', 'incrementalPatch', 'patch', 'update']);
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
	// Payments ledger 9–10: the void route owns the payment's voided order mirror.
	'packages/core/src/screens/main/pos/checkout/payments/use-void-payments.ts',
	// checkout.tender.commit / checkout.complete delegate the order's provenance stamp here.
	'packages/core/src/screens/main/pos/checkout/provenance/persist-provenance.ts',
]);

function memberChain(node) {
	return (
		ts.isIdentifier(node) || (ts.isPropertyAccessExpression(node) && memberChain(node.expression))
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
				const receiver = callee.expression;
				const last = ts.isIdentifier(receiver) ? receiver.text : receiver.name.text;
				if (DOCUMENT_WRITES.has(name) && ORDER_DOCUMENT.test(last)) construct = 'doc-write';
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
				const options = node.arguments[0];
				if (
					options &&
					ts.isObjectLiteralExpression(options) &&
					options.properties.some(
						(property) =>
							ts.isPropertyAssignment(property) &&
							(ts.isIdentifier(property.name) || ts.isStringLiteral(property.name)) &&
							property.name.text === 'document' &&
							ts.isIdentifier(property.initializer) &&
							ORDER_DOCUMENT.test(property.initializer.text)
					)
				)
					construct = 'local-write';
			}
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
