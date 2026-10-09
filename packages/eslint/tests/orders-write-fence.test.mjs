/**
 * Burn-down: wcpos/roadmap#421. Each allowlisted writer becomes a reserved event
 * (discount apply, customer set, coupon, fee/shipping lines, order meta, settlement)
 * or moves behind a bottom handler. The allowlist shrinks as they do, never grows.
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

import { prContext, readBlob, readEvent } from '../../../scripts/check-test-removal.mjs';
import {
	BOTTOM_HANDLERS,
	countSites,
	ROOT,
	scanRepository,
	scanSource,
} from './orders-write-scanner.mjs';
import { ratchetErrors } from './uniwind-scanner.mjs';

const allowlist = JSON.parse(
	readFileSync(`${ROOT}/packages/eslint/orders-write-allowlist.json`, 'utf8')
);
const sites = scanRepository();
// Reuse the Lint job's immutable PR base; local edits compare with HEAD. No fetch.
const base = readEvent(prContext()?.eventPath)?.pull_request?.base?.sha ?? 'HEAD';
const prior = readBlob(base, 'packages/eslint/orders-write-allowlist.json', ROOT);
// Bootstrap only: today's exceptions must already exist in the base source.
const baseline = prior
	? JSON.parse(prior)
	: countSites(
			Object.keys(allowlist).flatMap((path) => scanSource(readBlob(base, path, ROOT), path))
		);
const path = 'packages/core/src/screens/main/pos/new-file.ts';

test('orders writes match the shrinking allowlist exactly', () => {
	assert.deepEqual(ratchetErrors(sites, allowlist, baseline), []);
});

test('a direct incrementalModify on an order in a new file is a violation', () => {
	const live = scanSource('order.incrementalModify(fn)', path);
	assert.deepEqual(live, [`${path}:1:1:doc-write`]);
	assert.deepEqual(ratchetErrors(live, {}), [
		`New violation: ${path}:doc-write (1 > 0) at lines 1`,
	]);
});

test('localPatch on an order document is a violation; on another document it is not', () => {
	const live = scanSource('localPatch({ document: order, data: changes })', path);
	assert.deepEqual(live, [`${path}:1:1:local-write`]);
	assert.match(ratchetErrors(live, {})[0], /New violation/);
	assert.deepEqual(scanSource('localPatch({ document: product, data: changes })', path), []);
});

test('a collection insert on orders is a violation', () => {
	const live = scanSource('db.collections.orders.insert(data)', path);
	assert.deepEqual(live, [`${path}:1:1:collection-write`]);
	assert.match(ratchetErrors(live, {})[0], /New violation/);
});

test('a bottom handler is exempt', () => {
	assert.deepEqual(
		scanSource(
			'order.incrementalPatch(data)',
			'packages/core/src/screens/main/pos/hooks/use-add-item-to-order.ts'
		),
		[]
	);
});

test('the exempt list names only files that exist', () => {
	for (const path of BOTTOM_HANDLERS) assert.ok(existsSync(`${ROOT}/${path}`), path);
});

test('recognizes each document name and write method on identifiers and member chains', () => {
	for (const name of [
		'order',
		'orders',
		'orderDoc',
		'currentOrderRecord',
		'freshOrder',
		'latestOrder',
	]) {
		for (const method of ['incrementalModify', 'incrementalPatch', 'patch', 'update']) {
			for (const receiver of [name, `ctx.current.${name}`]) {
				assert.deepEqual(scanSource(`${receiver}.${method}(data)`, path), [
					`${path}:1:1:doc-write`,
				]);
			}
		}
	}
});

test('recognizes both local mutation helpers and their context member forms', () => {
	for (const helper of ['localPatch', 'localModify', 'ctx.localPatch', 'ctx.localModify']) {
		for (const name of [
			'order',
			'orders',
			'orderDoc',
			'currentOrderRecord',
			'freshOrder',
			'latestOrder',
		]) {
			assert.deepEqual(scanSource(`${helper}({ document: ${name}, data })`, path), [
				`${path}:1:1:local-write`,
			]);
		}
	}
});

test('recognizes each orders collection write method', () => {
	for (const method of ['insert', 'bulkUpsert', 'upsert', 'bulkInsert', 'incrementalUpsert']) {
		assert.deepEqual(scanSource(`db.collections.orders.${method}(data)`, path), [
			`${path}:1:1:collection-write`,
		]);
	}
});

test('ignores comments, strings, reads, unrelated receivers and non-chain expressions', () => {
	assert.deepEqual(
		scanSource(
			`
		// order.incrementalModify(fn)
		const prose = 'collections.orders.insert(data)';
		product.patch(data);
		widget.update(data);
		border.patch(data);
		recorder.update(data);
		patchEngineResident({ collection: 'products', data });
		observeEngineQuery({ collection: 'orders', where });
		runtime.engine.require({ collection: 'orders', uuid });
		readEngineOrders({ collection: 'orders' });
		socket.write({ collection: 'orders' });
		order.getLatest();
		getContext().order.patch(data);
		collections.products.insert(data);
	`,
			path
		),
		[]
	);
});

test('scans services, but excludes test files and paths outside the fence', () => {
	const source = 'order.patch(data)';
	assert.deepEqual(scanSource(source, 'packages/core/src/services/example.tsx'), [
		'packages/core/src/services/example.tsx:1:1:doc-write',
	]);
	for (const excluded of [
		path.replace('.ts', '.test.ts'),
		path.replace('.ts', '.spec.tsx'),
		'packages/core/src/screens/main/orders/example.ts',
		path.replace('.ts', '.js'),
	]) {
		assert.deepEqual(scanSource(source, excluded), []);
	}
});

test('reports call positions and counts separate sites on the same line', () => {
	assert.deepEqual(scanSource('\n  order.patch(data); order.update(data)', path), [
		`${path}:2:22:doc-write`,
		`${path}:2:3:doc-write`,
	]);
});

test('an engine helper or engine.write naming the orders collection is a violation', () => {
	for (const call of [
		"patchEngineResident({ manager, collection: 'orders', data })",
		"insertEngineResident({ manager, collection: 'orders', document })",
		"manager.engine.write({ collection: 'orders', mutation })",
		"requestServerDelete(manager.engine, { collection: 'orders', recordId })",
		"patchAndEnqueueEngineResident({ manager, collection: 'orders', data })",
		"runtime.engine.write({ collection: 'orders', mutation })",
	]) {
		assert.deepEqual(scanSource(call, path), [`${path}:1:1:engine-write`]);
	}
});

test('a cast, a non-null assertion or parentheses do not hide an order write', () => {
	for (const receiver of [
		'(order as MutationDocument)',
		'order!',
		'(order)',
		'ctx.current.order!',
	]) {
		assert.deepEqual(scanSource(`${receiver}.incrementalPatch(data)`, path), [
			`${path}:1:1:doc-write`,
		]);
	}
	assert.deepEqual(
		scanSource('localPatch({ document: freshOrder as MutationDocument, data })', path),
		[`${path}:1:1:local-write`]
	);
	assert.deepEqual(scanSource('order.remove()', path), [`${path}:1:1:doc-write`]);
	assert.deepEqual(scanSource('localModify({ document: ctx.order, data })', path), [
		`${path}:1:1:local-write`,
	]);
});

test('an order read that names the collection is not a site', () => {
	for (const call of [
		"observeEngineQuery({ manager, collection: 'orders', where })",
		"runtime.engine.require({ collection: 'orders', uuid })",
		"runtime.engine.require({ collection: 'orders', uuid }).then(use)",
	]) {
		assert.deepEqual(scanSource(call, path), []);
	}
});
