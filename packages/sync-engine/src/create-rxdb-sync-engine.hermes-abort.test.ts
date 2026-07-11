/**
 * Hermes/RN regression (post-#430 Codex review finding): AbortSignal.any does
 * not exist on RN/Expo fetch polyfills, and the StoreScopeManager contract
 * forbids passing init.signal into a bound fetcher (which would force it
 * inside scopedFetch). These tests DELETE AbortSignal.any to emulate Hermes
 * and drive the drains through the public handle — any code path that
 * creates AbortSignal.any, or leaks a signal into a bound fetcher, throws.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setPremiumFlag } from 'rxdb-premium/plugins/shared';

import {
	createRxdbSyncEngine,
	type RxdbSyncEngine,
	type StoreScopeIdentity,
} from './create-rxdb-sync-engine';
import { memoryEngineStorage } from './testing';

setPremiumFlag();

const SITE = 'https://lab.example.test';
const SYNC_BASE = `${SITE}/wp-json/wc-rxdb-sync/v1`;
const UUID_1 = '11111111-1111-4111-8111-111111111111';
let uniqueStore = 0;

function freshIdentity(): StoreScopeIdentity {
	uniqueStore += 1;
	return { site: SITE, storeId: 11, cashierId: `hermes-${uniqueStore}` };
}

function scriptedOrderProxy() {
	const state = { pulls: 0, sawSignal: false };
	const fetch = async (url: string, init?: { signal?: AbortSignal }): Promise<Response> => {
		if (init?.signal) state.sawSignal = true; // the composite MUST still reach the transport
		const u = new URL(url);
		if (u.pathname.endsWith('/orders')) {
			state.pulls += 1;
			return new Response(
				JSON.stringify([
					{
						id: 1,
						number: '1001',
						status: 'processing',
						total: '5.00',
						date_created_gmt: '2026-07-10T00:00:00',
						date_modified_gmt: '2026-07-10T00:00:01',
						customer_id: 0,
						meta_data: [{ id: 1, key: '_woocommerce_pos_uuid', value: UUID_1 }],
					},
				]),
				{ status: 200, headers: { 'content-type': 'application/json' } }
			);
		}
		throw new Error(`scripted proxy: unexpected ${u.pathname}`);
	};
	return { state, fetch };
}

function engineWith(
	fetch: (url: string, init?: { signal?: AbortSignal }) => Promise<Response>
): RxdbSyncEngine {
	return createRxdbSyncEngine(
		{
			site: { syncBaseUrl: SYNC_BASE, wpJsonRoot: `${SITE}/wp-json` },
			storage: memoryEngineStorage(),
			fetcher: (url, init) => fetch(url, init),
			mode: 'manual',
		},
		freshIdentity()
	);
}

describe('engine drains without AbortSignal.any (Hermes/RN emulation)', () => {
	let originalAny: any;

	beforeEach(() => {
		// Emulate Hermes: the static simply does not exist. Any engine code path
		// that calls AbortSignal.any (directly, or via scopedFetch receiving an
		// init.signal) now throws TypeError.

		originalAny = (AbortSignal as any).any;

		delete (AbortSignal as any).any;
	});

	afterEach(() => {
		(AbortSignal as any).any = originalAny;
	});

	it('seed → scheduler drain pulls and applies with a caller signal, on a runtime without AbortSignal.any', async () => {
		const server = scriptedOrderProxy();
		const engine = engineWith(server.fetch);
		await engine.ready;

		expect((await engine.sync('order-window-seed')).status).toBe('ran');
		const controller = new AbortController();
		const drained = await engine.sync('scheduler-drain', { signal: controller.signal });
		expect(drained.status).toBe('ran');
		expect(drained.error).toBeUndefined();
		expect(server.state.pulls).toBeGreaterThan(0);
		expect(server.state.sawSignal).toBe(true); // the manual composite reached the transport

		const scope = engine.active();
		if (!scope) throw new Error('no active scope');
		const orders = await (
			scope.database.collections.orders as { find(): { exec(): Promise<unknown[]> } }
		)
			.find()
			.exec();
		expect(orders).toHaveLength(1);
		await engine.dispose();
	});

	it('require() pulls an order on a runtime without AbortSignal.any', async () => {
		const server = scriptedOrderProxy();
		const engine = engineWith(server.fetch);
		await engine.ready;

		await expect(
			engine.require({
				id: 'hermes-required-order',
				collection: 'orders',
				kind: 'targeted-records',
				wooIds: [1],
			}).ready
		).resolves.toMatchObject({ action: 'fetched', missingRecordIds: [1] });
		expect(server.state.pulls).toBeGreaterThan(0);
		expect(server.state.sawSignal).toBe(true);
		await engine.dispose();
	});

	it('the write drain pushes with a caller signal, on a runtime without AbortSignal.any', async () => {
		let pushes = 0;
		const engine = engineWith(async (url: string, init?: { signal?: AbortSignal }) => {
			const u = new URL(url);
			if (u.pathname.includes('/push/')) {
				pushes += 1;
				expect(init?.signal).toBeDefined(); // composite present, single signal
				const body = { results: [{ mutationId: 'unknown' }] };
				return new Response(JSON.stringify(body), {
					status: 200,
					headers: { 'content-type': 'application/json' },
				});
			}
			throw new Error(`unexpected ${u.pathname}`);
		});
		await engine.ready;
		const scope0 = engine.active();
		if (!scope0) throw new Error('no active scope');
		await (scope0.database.collections.orders as { insert(doc: unknown): Promise<unknown> }).insert(
			{
				id: UUID_1,
				wooOrderId: null,
				number: '',
				dateCreatedGmt: '2026-07-10T00:00:00',
				status: 'pos-open',
				total: '0.00',
				customerId: 0,
				payload: {
					status: 'pos-open',
					meta_data: [{ key: '_woocommerce_pos_uuid', value: UUID_1 }],
				},
				sync: { revision: '', partial: false, source: 'skeleton' },
				local: { dirty: true, pendingMutationIds: [] },
			}
		);
		await engine.write({
			collection: 'orders',
			operation: 'create',
			recordId: UUID_1,
			payload: { status: 'pos-open', meta_data: [{ key: '_woocommerce_pos_uuid', value: UUID_1 }] },
		});
		const controller = new AbortController();
		const report = await engine.sync('write-drain', { signal: controller.signal });
		// The scripted ack is intentionally malformed — what matters here is that
		// the push REACHED the transport without an AbortSignal.any throw.
		expect(pushes).toBeGreaterThan(0);
		expect(report.error ?? '').not.toContain('AbortSignal.any');
		await engine.dispose();
	});

	it('a caller abort mid-flight still cancels the request through the manual composite', async () => {
		let sawAbort = false;
		const engine = engineWith(
			(url: string, init?: { signal?: AbortSignal }) =>
				new Promise<Response>((_resolve, reject) => {
					init?.signal?.addEventListener('abort', () => {
						sawAbort = true;
						reject(new DOMException('Aborted', 'AbortError'));
					});
				})
		);
		await engine.ready;
		await engine.sync('order-window-seed');
		const controller = new AbortController();
		const pending = engine.sync('scheduler-drain', { signal: controller.signal });
		await new Promise((resolve) => setTimeout(resolve, 20));
		controller.abort();
		await pending;
		expect(sawAbort).toBe(true);
		await engine.dispose();
	});
});
