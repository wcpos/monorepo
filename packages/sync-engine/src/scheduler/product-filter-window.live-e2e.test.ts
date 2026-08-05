import { afterAll, describe, expect, it } from 'vitest';
import { setPremiumFlag } from 'rxdb-premium/plugins/shared';

import { log } from '@wcpos/utils/logger';

import { createRxdbSyncEngine, type RxdbSyncEngine } from '../create-rxdb-sync-engine';
import { memoryEngineStorage } from '../testing';

const LIVE_SYNC_BASE = process.env['LIVE_SYNC_BASE']?.trim();
const LIVE_BASIC_AUTH = process.env['LIVE_BASIC_AUTH']?.trim();
const LIVE_BEARER_TOKEN = process.env['LIVE_BEARER_TOKEN']?.trim();
const LIVE_ENABLED = Boolean(LIVE_SYNC_BASE && (LIVE_BEARER_TOKEN || LIVE_BASIC_AUTH));

if (!LIVE_ENABLED) {
	log.info(
		'[product-filter-window] skipped: set LIVE_SYNC_BASE and LIVE_BEARER_TOKEN (or LIVE_BASIC_AUTH) to run the real-server gate'
	);
}

const liveDescribe = LIVE_ENABLED ? describe : describe.skip;

liveDescribe('LIVE product filter browse window', () => {
	let engine: RxdbSyncEngine | null = null;

	afterAll(async () => {
		if (engine) await engine.dispose();
	});

	it('returns only in-stock payloads through the sync transport', async () => {
		setPremiumFlag();
		const syncBaseUrl = (LIVE_SYNC_BASE as string).replace(/\/+$/, '');
		const authorization = LIVE_BEARER_TOKEN
			? `Bearer ${LIVE_BEARER_TOKEN}`
			: `Basic ${LIVE_BASIC_AUTH as string}`;
		const fetcher = async (url: string, init?: RequestInit): Promise<Response> => {
			const headers = new Headers(init?.headers ?? {});
			headers.set('X-WCPOS', '1');
			headers.set('Authorization', authorization);
			return globalThis.fetch(url, { ...init, headers });
		};
		const namespace = '/wcpos/v2';
		if (!syncBaseUrl.endsWith(namespace)) {
			throw new Error(`LIVE_SYNC_BASE must end in "${namespace}"`);
		}
		const wpJsonRoot = `${syncBaseUrl.slice(0, -namespace.length)}/`;
		const scopeSite = wpJsonRoot.replace(/\/wp-json\/$/, '');

		engine = createRxdbSyncEngine(
			{
				site: { syncBaseUrl, wpJsonRoot },
				storage: memoryEngineStorage(),
				fetcher,
				mode: 'manual',
				multiInstance: false,
			},
			{
				site: scopeSite,
				storeId: `product-filter-window-${globalThis.crypto.randomUUID()}`,
				cashierId: 'product-filter-window',
			}
		);
		await engine.ready;
		await engine.require({
			id: 'live-product-filter-window',
			collection: 'products',
			kind: 'query',
			queryKey: 'products:browse-window:limit=100:stock_status=instock',
			forceRefresh: true,
			priority: 700,
		}).ready;

		const scope = engine.active();
		if (!scope) throw new Error('live gate has no active engine scope');
		const documents = await scope.database.collections.products.find().exec();
		const payloads = documents.map(
			(document) => document.toJSON()['payload'] as Record<string, unknown>
		);
		expect(payloads.length).toBeGreaterThan(0);
		expect(payloads.every((payload) => payload['stock_status'] === 'instock')).toBe(true);
	}, 120_000);
});
