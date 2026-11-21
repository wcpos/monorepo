import { describe, expect, it, vi } from 'vitest';

import type { OrderDocument, WooOrderPayload } from '@wcpos/sync-core';

import { orderBrowserQueryKey } from '../scheduler';
import { wooGmtDate } from '../scheduler/woo-gmt-date';
import { type OrderViewDeltaCursor, tickOrderViewDelta } from './order-view-delta';

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
		cursors: new Map<string, OrderViewDeltaCursor>(),
		now: () => NOW * 1_000,
		diagnostics: vi.fn(),
	};
	const urls = () => input.fetcher.mock.calls.map(([url]) => new URL(url));
	return { input, repository, urls };
}

describe('tickOrderViewDelta', () => {
	it('continues a burst with a one-second overlap and delivers the next edit within two passes', async () => {
		const { input, repository, urls } = fixture();
		const rows = Array.from({ length: 300 }, (_, i) =>
			payload(i + 1, NOW - 59 + Math.floor(i / 5))
		);
		input.fetcher.mockImplementation(async (url) => {
			const query = new URL(url).searchParams;
			const bound = Date.parse(`${query.get('modified_after')}Z`) / 1_000;
			const start = (Number(query.get('page')) - 1) * 100;
			const matching = rows.filter(
				(row) => Date.parse(`${row.date_modified_gmt}Z`) / 1_000 > bound
			);
			return Response.json(matching.slice(start, start + 100));
		});
		expect((await tickOrderViewDelta(input)).requests).toBe(3);
		rows.push(payload(301, NOW + 30));
		expect((await tickOrderViewDelta(input)).requests).toBeLessThanOrEqual(3);
		expect(urls()[3].searchParams.get('modified_after')).toBe(wooGmtDate(NOW - 1));
		expect(repository.upsertMany.mock.calls.flatMap(([documents]) => documents)).toContainEqual(
			expect.objectContaining({ remoteId: '301' })
		);
	});

	it('advances a continuing cursor past three full pages at the same second', async () => {
		const { input, urls } = fixture();
		input.cursors.set('cashier=7|store=3', { cursorSeconds: NOW, continuing: true });
		const rows = Array.from({ length: 300 }, (_, i) => payload(i + 1, NOW));
		for (let start = 0; start < rows.length; start += 100) {
			input.fetcher.mockResolvedValueOnce(Response.json(rows.slice(start, start + 100)));
		}
		expect(await tickOrderViewDelta(input)).toMatchObject({ requests: 3, documents: 300 });
		expect(input.cursors.get('cashier=7|store=3')).toEqual({
			cursorSeconds: NOW + 1,
			continuing: true,
		});
		await tickOrderViewDelta(input);
		expect(urls()[3].searchParams.get('modified_after')).toBe(wooGmtDate(NOW));
	});

	it('advances idle bounds with the last response Date, including an empty pass', async () => {
		const { input, urls } = fixture();
		input.fetcher
			.mockResolvedValueOnce(
				Response.json([payload(7, NOW - 20)], {
					headers: { Date: new Date(NOW * 1_000).toUTCString() },
				})
			)
			.mockResolvedValueOnce(
				Response.json([], { headers: { Date: new Date((NOW + 60) * 1_000).toUTCString() } })
			);
		await tickOrderViewDelta(input);
		await tickOrderViewDelta(input);
		expect(urls()[1].searchParams.get('modified_after')).toBe(wooGmtDate(NOW - 60));
		await tickOrderViewDelta(input);
		expect(urls()[2].searchParams.get('modified_after')).toBe(wooGmtDate(NOW));
	});

	it('ingests a null-date row without marking the store unsupported or poisoning the cursor', async () => {
		const { input, repository } = fixture();
		input.fetcher.mockResolvedValue(
			Response.json([{ ...payload(7), date_modified_gmt: null }, payload(8, NOW - 10)])
		);
		expect(await tickOrderViewDelta(input)).toMatchObject({ unsupported: false, documents: 2 });
		expect(repository.upsertMany.mock.calls.flatMap(([documents]) => documents)).toContainEqual(
			expect.objectContaining({ remoteId: '7' })
		);
		expect(Number.isFinite(input.cursors.get('cashier=7|store=3')?.cursorSeconds)).toBe(true);
		expect(input.diagnostics).not.toHaveBeenCalled();
	});

	it('treats a 400 on page 2 as incomplete without an unsupported warning', async () => {
		const { input } = fixture();
		input.fetcher
			.mockResolvedValueOnce(
				Response.json(Array.from({ length: 100 }, (_, i) => payload(i + 1, NOW - 99 + i)))
			)
			.mockResolvedValueOnce(new Response('out of pages', { status: 400 }));
		expect(await tickOrderViewDelta(input)).toMatchObject({
			unsupported: false,
			requests: 2,
			documents: 100,
		});
		expect(input.diagnostics).not.toHaveBeenCalled();
		expect(input.cursors.get('cashier=7|store=3')).toEqual({
			cursorSeconds: NOW,
			continuing: true,
		});
	});

	it('ingests a row before the bound on page 2 without reporting unsupported', async () => {
		const { input, repository } = fixture();
		input.cursors.set('cashier=7|store=3', { cursorSeconds: NOW, continuing: true });
		const firstPage = Array.from({ length: 100 }, (_, i) => payload(i + 1, NOW));
		input.fetcher
			.mockResolvedValueOnce(Response.json(firstPage))
			.mockResolvedValueOnce(Response.json([payload(101, NOW - 2)]));
		expect(await tickOrderViewDelta(input)).toMatchObject({
			unsupported: false,
			requests: 2,
			documents: 101,
		});
		expect(input.diagnostics).not.toHaveBeenCalled();
		expect(repository.upsertMany).toHaveBeenCalledTimes(2);
		expect(
			repository.upsertMany.mock.calls.flatMap(([documents]) =>
				documents.map((doc) => doc.remoteId)
			)
		).toEqual(Array.from({ length: 101 }, (_, i) => String(i + 1)));
	});

	it('skips a store view with no cashier', async () => {
		const { input } = fixture([key({ store: '3' })]);
		expect(await tickOrderViewDelta(input)).toEqual({
			scopes: 0,
			requests: 0,
			documents: 0,
			unsupported: false,
		});
		expect(input.fetcher).not.toHaveBeenCalled();
	});

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
		expect(input.cursors.get('cashier=7|store=3')).toEqual({
			cursorSeconds: NOW - 10,
			continuing: false,
		});
		await tickOrderViewDelta(input);
		expect(urls()[1].searchParams.get('modified_after')).toBe(wooGmtDate(NOW - 10 - 60));
	});

	it('leaves an existing cursor unchanged on an empty page', async () => {
		const { input } = fixture();
		input.cursors.set('cashier=7|store=3', { cursorSeconds: NOW - 100, continuing: false });
		await tickOrderViewDelta(input);
		expect(input.cursors.get('cashier=7|store=3')).toEqual({
			cursorSeconds: NOW - 100,
			continuing: false,
		});
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
		input.cursors.set('cashier=5|store=', { cursorSeconds: NOW - 100, continuing: false });
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
		const { input, urls } = fixture([key({ store, cashierId: 7 })]);
		await tickOrderViewDelta(input);
		expect(urls()[0].searchParams.get(store === '3' ? 'pos_store' : 'created_via')).toBe(store);
		expect(urls()[0].searchParams.get('pos_cashier')).toBe('7');
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
		input.cursors.set('cashier=7|store=3', { cursorSeconds: NOW, continuing: false });
		await tickOrderViewDelta(input);
		expect(input.cursors.size).toBe(0);
		expect(input.fetcher).not.toHaveBeenCalled();
	});
});
