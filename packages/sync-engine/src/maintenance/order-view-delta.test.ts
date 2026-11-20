import { describe, expect, it, vi } from 'vitest';

import type { OrderDocument, WooOrderPayload } from '@wcpos/sync-core';

import { orderBrowserQueryKey } from '../scheduler';
import { wooGmtDate } from '../scheduler/woo-gmt-date';
import { tickOrderViewDelta } from './order-view-delta';

const NOW = Date.parse('2026-11-20T12:00:00Z') / 1_000;
const key = orderBrowserQueryKey;
const payload = (id = 7, seconds = NOW): WooOrderPayload => ({
	id,
	status: 'completed',
	date_modified_gmt: wooGmtDate(seconds),
	_rxdb_revision: 'sha256:b',
	meta_data: [
		{
			key: '_woocommerce_pos_uuid',
			value: `77777777-7777-4777-8777-${String(id).padStart(12, '0')}`,
		},
	],
});

function fixture(viewKeys = [key({ cashierId: 7, store: '3' })]) {
	const repository = {
		upsertMany: vi.fn(async (documents: OrderDocument[]) => documents),
		upsertManifestRows: vi.fn(async () => undefined),
	};
	const input = {
		baseUrl: 'https://example.test/wp-json/wcpos/v2',
		fetcher: vi.fn(async (_url: string) => Response.json([])),
		ingest: vi.fn(() => ({ repository })),
		viewKeys,
		cursors: new Map<string, number>(),
		now: () => NOW * 1_000,
		diagnostics: vi.fn(),
	};
	const urls = () => input.fetcher.mock.calls.map(([url]) => new URL(url));
	return { input, repository, urls };
}

describe('tickOrderViewDelta', () => {
	it('starts five minutes back with one minute overlap, then advances to the greatest modification', async () => {
		const { input, urls } = fixture();
		input.fetcher.mockImplementation(async () =>
			Response.json([payload(7, NOW - 10), payload(8, NOW - 20)])
		);
		expect(await tickOrderViewDelta(input)).toEqual({
			scopes: 1,
			requests: 1,
			documents: 2,
			unsupported: false,
		});
		expect(urls()[0].searchParams.get('modified_after')).toBe(wooGmtDate(NOW - 300 - 60));
		expect(input.cursors.get('cashier=7|store=3')).toBe(NOW - 10);
		await tickOrderViewDelta(input);
		expect(urls()[1].searchParams.get('modified_after')).toBe(wooGmtDate(NOW - 10 - 60));
	});

	it('leaves an existing cursor unchanged on an empty page', async () => {
		const { input } = fixture();
		input.cursors.set('cashier=7|store=3', NOW - 100);
		await tickOrderViewDelta(input);
		expect(input.cursors.get('cashier=7|store=3')).toBe(NOW - 100);
	});

	it.each([false, true])(
		'pages after a full page, bounded at three pages (always full: %s)',
		async (alwaysFull) => {
			const { input, urls } = fixture();
			input.fetcher.mockImplementation(async (url) =>
				Response.json(
					alwaysFull || new URL(url).searchParams.get('page') === '1'
						? Array.from({ length: 100 }, (_, i) => payload(i + 1))
						: []
				)
			);
			const result = await tickOrderViewDelta(input);
			expect(result.requests).toBe(alwaysFull ? 3 : 2);
			expect(input.ingest).toHaveBeenCalledTimes(result.requests);
			expect(urls().map((url) => url.searchParams.get('page'))).toEqual(
				alwaysFull ? ['1', '2', '3'] : ['1', '2']
			);
			expect(urls().every((url) => url.searchParams.get('per_page') === '100')).toBe(true);
		}
	);

	it('skips complete Reports keys, invalid keys and rejected descriptors', async () => {
		const { input } = fixture([
			key({ limit: 'all', afterSeconds: NOW - 3600, beforeSeconds: NOW }),
			'invalid',
			'orders:status=all:search=:limit=0',
		]);
		expect(await tickOrderViewDelta(input)).toEqual({
			scopes: 0,
			requests: 0,
			documents: 0,
			unsupported: false,
		});
		expect(input.fetcher).not.toHaveBeenCalled();
	});

	it('deduplicates scopes in first-seen order and fetches at most four', async () => {
		const { input, urls } = fixture([
			key({ cashierId: 1, status: 'completed' }),
			key({ cashierId: 1, status: 'processing' }),
			...[2, 3, 4, 5].map((cashierId) => key({ cashierId })),
		]);
		input.cursors.set('cashier=5|store=', NOW - 100);
		const result = await tickOrderViewDelta(input);
		expect(result).toMatchObject({ scopes: 4, requests: 4 });
		expect(urls().map((url) => url.searchParams.get('pos_cashier'))).toEqual(['1', '2', '3', '4']);
		expect(input.cursors.has('cashier=5|store=')).toBe(true);
	});

	it('omits every membership filter and asks only for the cashier and store scope', async () => {
		const { input, urls } = fixture([
			key({
				status: 'completed',
				search: 'receipt',
				customerId: 8,
				registerId: '12345678-1234-1234-1234-123456789abc',
				paymentMethod: 'pos_cash',
				afterSeconds: NOW - 7200,
				beforeSeconds: NOW,
				cashierId: 7,
				store: '3',
				limit: 50,
			}),
		]);
		await tickOrderViewDelta(input);
		expect(Object.fromEntries(urls()[0].searchParams)).toEqual({
			pos_cashier: '7',
			pos_store: '3',
			modified_after: wooGmtDate(NOW - 360),
			dates_are_gmt: 'true',
			orderby: 'modified',
			order: 'asc',
			per_page: '100',
			page: '1',
		});
	});

	it.each(['3', 'pos'])('maps numeric and slug store scopes (%s)', async (store) => {
		const { input, urls } = fixture([key({ store })]);
		await tickOrderViewDelta(input);
		expect(urls()[0].searchParams.get(store === '3' ? 'pos_store' : 'created_via')).toBe(store);
		expect(urls()[0].searchParams.has('pos_cashier')).toBe(false);
	});

	it.each(['status-400', 'modified-after-ignored'])(
		'stops on unsupported stores: %s',
		async (reason) => {
			const { input, repository } = fixture([key({ cashierId: 7 }), key({ cashierId: 8 })]);
			input.fetcher.mockImplementation(async () =>
				reason === 'status-400'
					? new Response('unsupported', { status: 400 })
					: Response.json([payload(7), payload(8, NOW - 361)])
			);
			expect(await tickOrderViewDelta(input)).toMatchObject({
				requests: 1,
				documents: 0,
				unsupported: true,
			});
			expect(repository.upsertMany).not.toHaveBeenCalled();
			expect(input.diagnostics).toHaveBeenCalledExactlyOnceWith({
				type: 'engine.guard',
				level: 'warn',
				collection: 'orders',
				message: 'order-view-delta: store does not honour modified_after/orderby=modified',
				fields: { lane: 'order-view-delta', reason },
			});
		}
	);

	it('throws for other unsuccessful responses', async () => {
		const { input } = fixture();
		input.fetcher.mockImplementation(async () => new Response('unavailable', { status: 503 }));
		await expect(tickOrderViewDelta(input)).rejects.toThrow('503');
	});

	it('prunes cursors that no live view uses', async () => {
		const { input } = fixture([]);
		input.cursors.set('cashier=7|store=3', NOW);
		await tickOrderViewDelta(input);
		expect(input.cursors.size).toBe(0);
		expect(input.fetcher).not.toHaveBeenCalled();
	});
});
