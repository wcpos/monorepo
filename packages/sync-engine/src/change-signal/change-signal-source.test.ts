import { describe, expect, it } from 'vitest';

import { createScopeBarcodeSelectors } from '../materialization/barcode-selectors';
import { ChangeSignalPoisonError, createLiveChangeSignalSource } from './change-signal-source';

function response(checkpoint: Record<string, unknown>): Response {
	return new Response(
		JSON.stringify({
			changes: [],
			checkpoint,
			complete: true,
		}),
		{ status: 200, headers: { 'content-type': 'application/json' } }
	);
}

describe('createLiveChangeSignalSource — sequence-log checkpoint head', () => {
	it('maps checkpoint.head onto the sequence-log page', async () => {
		const source = createLiveChangeSignalSource({
			syncBaseUrl: 'https://example.test/wp-json/wcpos/v2',
			fetcher: async (url) =>
				new URL(url).pathname.endsWith('/changes/tick')
					? new Response(null, { status: 404 })
					: response({ since: 7, head: '42', horizon: '3', epoch: 'epoch-A' }),
		});

		await expect(
			source.pollSequenceLog({ cursor: { sequence: 5 }, limit: 100 })
		).resolves.toMatchObject({
			cursor: { sequence: 7 },
			head: 42,
			horizon: 3,
			epoch: 'epoch-A',
		});
	});

	it('carries revisions and treats only numeric one as deleted', async () => {
		const source = createLiveChangeSignalSource({
			syncBaseUrl: 'https://example.test/wp-json/wcpos/v2',
			fetcher: async (url) =>
				new URL(url).pathname.endsWith('/changes/tick')
					? new Response(null, { status: 404 })
					: Response.json({
							changes: [
								{
									sequence: 7,
									id: 42,
									deleted: 1,
									revision: 'sha256:abc',
									collection: 'products',
								},
								{
									sequence: 8,
									id: 43,
									deleted: '0',
									collection: 'products',
								},
							],
							checkpoint: { since: 8, head: 8 },
							complete: true,
						}),
		});

		const page = await source.pollSequenceLog({
			cursor: { sequence: 6 },
			limit: 100,
		});

		expect(page.rows).toEqual([
			{
				sequence: 7,
				id: 42,
				deleted: true,
				revision: 'sha256:abc',
				collection: 'products',
				modified_gmt: undefined,
			},
			{
				sequence: 8,
				id: 43,
				deleted: false,
				collection: 'products',
				modified_gmt: undefined,
			},
		]);
	});

	it('leaves head undefined when the checkpoint omits it', async () => {
		const source = createLiveChangeSignalSource({
			syncBaseUrl: 'https://example.test/wp-json/wcpos/v2',
			fetcher: async (url) =>
				new URL(url).pathname.endsWith('/changes/tick')
					? new Response(null, { status: 404 })
					: response({ since: 7 }),
		});

		const page = await source.pollSequenceLog({
			cursor: { sequence: 5 },
			limit: 100,
		});

		expect(page.head).toBeUndefined();
	});
});

describe('createLiveChangeSignalSource — sequence-log conditional requests', () => {
	it('maps a 304 to the current empty at-head page and retains the ETag', async () => {
		const requests: ({ headers?: HeadersInit } | undefined)[] = [];
		let call = 0;
		const source = createLiveChangeSignalSource({
			syncBaseUrl: 'https://example.test/wp-json/wcpos/v2',
			fetcher: async (url, init) => {
				if (new URL(url).pathname.endsWith('/changes/tick')) {
					return new Response(null, { status: 404 });
				}
				requests.push(init);
				call += 1;
				return call === 1
					? new Response(
							JSON.stringify({
								changes: [],
								checkpoint: { since: 5, head: 5 },
								complete: true,
								config_fingerprint: {
									fingerprints: {
										products: 'p1',
										variations: 'v1',
										tax_rates: 't1',
									},
								},
							}),
							{
								status: 200,
								headers: {
									'content-type': 'application/json',
									etag: '"sequence-5"',
								},
							}
						)
					: new Response(null, {
							status: 304,
							headers: { etag: '"sequence-5"' },
						});
			},
		});

		await source.pollSequenceLog({ cursor: { sequence: 5 }, limit: 100 });
		const notModified = await source.pollSequenceLog({
			cursor: { sequence: 5 },
			limit: 100,
		});
		await source.pollSequenceLog({ cursor: { sequence: 5 }, limit: 100 });

		expect(notModified).toEqual({
			rows: [],
			cursor: { sequence: 5 },
			reportedCursor: { sequence: 5 },
			hasMore: false,
			head: 5,
			configFingerprint: {
				fingerprints: { products: 'p1', variations: 'v1', tax_rates: 't1' },
			},
		});
		expect(new Headers(requests[0]?.headers).get('if-none-match')).toBeNull();
		expect(new Headers(requests[1]?.headers).get('if-none-match')).toBe('"sequence-5"');
		expect(new Headers(requests[2]?.headers).get('if-none-match')).toBe('"sequence-5"');
	});

	it('clears the ETag before a request whose cursor was reset', async () => {
		const requests: ({ headers?: HeadersInit } | undefined)[] = [];
		const source = createLiveChangeSignalSource({
			syncBaseUrl: 'https://example.test/wp-json/wcpos/v2',
			fetcher: async (url, init) => {
				if (new URL(url).pathname.endsWith('/changes/tick')) {
					return new Response(null, { status: 404 });
				}
				requests.push(init);
				const since = Number(new URL(url).searchParams.get('since'));
				return new Response(
					JSON.stringify({
						changes: [],
						checkpoint: { since, head: since },
						complete: true,
					}),
					{
						status: 200,
						headers: {
							'content-type': 'application/json',
							etag: `"sequence-${since}"`,
						},
					}
				);
			},
		});

		await source.pollSequenceLog({ cursor: { sequence: 5 }, limit: 100 });
		await source.pollSequenceLog({ cursor: { sequence: 0 }, limit: 100 });

		expect(new Headers(requests[1]?.headers).get('if-none-match')).toBeNull();
	});

	it('surfaces the embedded config fingerprint beside the sequence page', async () => {
		const scope = createScopeBarcodeSelectors();
		scope.publish('products', ['existing-product']);
		scope.publish('variations', ['existing-variation']);
		const source = createLiveChangeSignalSource({
			syncBaseUrl: 'https://example.test/wp-json/wcpos/v2',
			publishBarcodeSelectors: (collection, selectors) => scope.publish(collection, selectors),
			fetcher: async (url) =>
				new URL(url).pathname.endsWith('/changes/tick')
					? new Response(null, { status: 404 })
					: new Response(
							JSON.stringify({
								changes: [],
								checkpoint: { since: 5, head: 5 },
								complete: true,
								config_fingerprint: {
									fingerprints: {
										products: 'p1',
										variations: 'v1',
										tax_rates: 't1',
									},
									barcode_fields: {
										products: ['sku'],
										variations: [],
										tax_rates: [],
									},
									meta: { supported: true },
								},
							}),
							{ status: 200, headers: { 'content-type': 'application/json' } }
						),
		});

		await expect(
			source.pollSequenceLog({ cursor: { sequence: 5 }, limit: 100 })
		).resolves.toMatchObject({
			configFingerprint: {
				fingerprints: { products: 'p1', variations: 'v1', tax_rates: 't1' },
				barcodeFields: { products: ['sku'], variations: [], tax_rates: [] },
			},
		});
		// Published onto the polled SCOPE; an empty list never clobbers a live carrier.
		expect(scope.current()).toEqual({
			products: ['sku'],
			variations: ['existing-variation'],
		});
	});
});

describe('createLiveChangeSignalSource — mid-drain continuation pages', () => {
	it('never sends If-None-Match on a continuation page, resumes after the drain completes', async () => {
		const inmHeaders: (string | null)[] = [];
		let call = 0;
		const pageBody = (rows: unknown[], since: number, complete: boolean) =>
			JSON.stringify({
				changes: rows,
				checkpoint: { since, head: 20 },
				complete,
			});
		const source = createLiveChangeSignalSource({
			syncBaseUrl: 'https://example.test/wp-json/wcpos/v2',
			fetcher: async (url, init) => {
				if (new URL(url).pathname.endsWith('/changes/tick')) {
					return new Response(null, { status: 404 });
				}
				inmHeaders.push(new Headers(init?.headers ?? {}).get('If-None-Match'));
				call += 1;
				// call 1: full at-head page (primes the ETag); call 2: capped page;
				// call 3: continuation page finishing the drain; call 4: idle re-poll.
				if (call === 1) {
					return new Response(pageBody([], 10, true), {
						status: 200,
						headers: { 'content-type': 'application/json', etag: '"10:aa"' },
					});
				}
				if (call === 2) {
					return new Response(
						pageBody([{ sequence: 15, collection: 'products', id: 1, deleted: 0 }], 15, false),
						{
							status: 200,
							headers: { 'content-type': 'application/json', etag: '"20:aa"' },
						}
					);
				}
				return new Response(pageBody([], 20, true), {
					status: 200,
					headers: { 'content-type': 'application/json', etag: '"20:aa"' },
				});
			},
		});

		await source.pollSequenceLog({ cursor: { sequence: 10 }, limit: 100 }); // primes ETag
		const capped = await source.pollSequenceLog({
			cursor: { sequence: 10 },
			limit: 1,
		});
		expect(capped.hasMore).toBe(true);
		await source.pollSequenceLog({ cursor: capped.cursor, limit: 1 }); // continuation
		await source.pollSequenceLog({ cursor: { sequence: 20 }, limit: 100 }); // idle re-poll

		// Continuation (call 3) must not carry a validator — it can never legitimately
		// 304, and a rogue 304 would silently drop the remaining rows.
		expect(inmHeaders[2]).toBeNull();
		// After the drain completes, conditional requests resume (call 4).
		expect(inmHeaders[3]).toBe('"20:aa"');
	});
});

describe('createLiveChangeSignalSource — combined tick endpoint', () => {
	it('probes a missing endpoint once, then permanently uses the legacy path', async () => {
		const urls: string[] = [];
		const source = createLiveChangeSignalSource({
			syncBaseUrl: 'https://example.test/wp-json/wcpos/v2',
			fetcher: async (url) => {
				urls.push(url);
				if (new URL(url).pathname.endsWith('/changes/tick')) {
					expect(new URL(url).searchParams.get('since')).toBe('5');
					return new Response(null, { status: 404 });
				}
				return response({ since: 5, head: 5 });
			},
		});

		await source.pollSequenceLog({ cursor: { sequence: 5 }, limit: 100 });
		await source.pollSequenceLog({ cursor: { sequence: 5 }, limit: 100 });

		expect(urls.filter((url) => new URL(url).pathname.endsWith('/changes/tick'))).toHaveLength(1);
		expect(urls.filter((url) => url.includes('/changes/sequence-log'))).toHaveLength(2);
	});

	it('maps a tick 304 to a cached-config empty page without fetching sequence-log', async () => {
		const urls: string[] = [];
		let tickCall = 0;
		const source = createLiveChangeSignalSource({
			syncBaseUrl: 'https://example.test/wp-json/wcpos/v2',
			fetcher: async (url, init) => {
				urls.push(url);
				tickCall += 1;
				expect(new URL(url).searchParams.get('since')).toBe('5');
				if (tickCall === 1) {
					return Response.json(
						{
							checkpoint: { head: 5 },
							config_fingerprint: {
								fingerprints: {
									products: 'p1',
									variations: 'v1',
									tax_rates: 't1',
								},
							},
						},
						{ headers: { etag: '"tick-5"' } }
					);
				}
				expect(new Headers(init?.headers).get('if-none-match')).toBe('"tick-5"');
				return new Response(null, { status: 304 });
			},
		});

		await source.pollSequenceLog({ cursor: { sequence: 5 }, limit: 100 });
		const page = await source.pollSequenceLog({
			cursor: { sequence: 5 },
			limit: 100,
		});

		expect(page).toEqual({
			rows: [],
			cursor: { sequence: 5 },
			reportedCursor: { sequence: 5 },
			hasMore: false,
			head: 5,
			configFingerprint: {
				fingerprints: { products: 'p1', variations: 'v1', tax_rates: 't1' },
			},
		});
		expect(urls.filter((url) => url.includes('/changes/sequence-log'))).toHaveLength(0);
	});

	it('fetches sequence-log without a validator when tick reports a newer head', async () => {
		const requests: { url: string; init?: { headers?: HeadersInit } }[] = [];
		const source = createLiveChangeSignalSource({
			syncBaseUrl: 'https://example.test/wp-json/wcpos/v2',
			fetcher: async (url, init) => {
				requests.push({ url, init });
				if (new URL(url).pathname.endsWith('/changes/tick')) {
					expect(new URL(url).searchParams.get('since')).toBe('5');
					return Response.json({ checkpoint: { head: 6 } }, { headers: { etag: '"tick-6"' } });
				}
				return new Response(
					JSON.stringify({
						changes: [{ sequence: 6, id: 42, deleted: 0, collection: 'products' }],
						checkpoint: { since: 6, head: 6 },
						complete: true,
					}),
					{
						headers: {
							'content-type': 'application/json',
							etag: '"sequence-6"',
						},
					}
				);
			},
		});

		const page = await source.pollSequenceLog({
			cursor: { sequence: 5 },
			limit: 100,
		});

		expect(page.rows).toEqual([
			{
				sequence: 6,
				id: 42,
				deleted: false,
				collection: 'products',
				modified_gmt: undefined,
			},
		]);
		const sequenceRequest = requests.find(({ url }) => url.includes('/changes/sequence-log'));
		expect(new Headers(sequenceRequest?.init?.headers).get('if-none-match')).toBeNull();
	});

	it('rejects an unrequested sequence-log 304 after tick reports a newer head', async () => {
		const source = createLiveChangeSignalSource({
			syncBaseUrl: 'https://example.test/wp-json/wcpos/v2',
			fetcher: async (url) => {
				if (new URL(url).pathname.endsWith('/changes/tick')) {
					expect(new URL(url).searchParams.get('since')).toBe('5');
					return Response.json({ checkpoint: { head: 6 } }, { headers: { etag: '"tick-6"' } });
				}
				return new Response(null, { status: 304 });
			},
		});

		await expect(
			source.pollSequenceLog({ cursor: { sequence: 5 }, limit: 100 })
		).rejects.toMatchObject({
			name: 'ChangeSignalPoisonError',
			path: '/changes/sequence-log',
			status: 304,
		});
	});

	it('returns an empty page from one tick request when the head equals the cursor', async () => {
		const urls: string[] = [];
		const source = createLiveChangeSignalSource({
			syncBaseUrl: 'https://example.test/wp-json/wcpos/v2',
			fetcher: async (url) => {
				urls.push(url);
				expect(new URL(url).searchParams.get('since')).toBe('5');
				return Response.json({ checkpoint: { head: '5' } }, { headers: { etag: '"tick-5"' } });
			},
		});

		await expect(
			source.pollSequenceLog({ cursor: { sequence: 5 }, limit: 100 })
		).resolves.toMatchObject({
			rows: [],
			cursor: { sequence: 5 },
			reportedCursor: { sequence: 5 },
			hasMore: false,
			head: 5,
		});
		expect(urls).toHaveLength(1);
	});

	it('clears the tick validator when the cursor is reset', async () => {
		const tickHeaders: (string | null)[] = [];
		const tickSince: (string | null)[] = [];
		const source = createLiveChangeSignalSource({
			syncBaseUrl: 'https://example.test/wp-json/wcpos/v2',
			fetcher: async (url, init) => {
				tickSince.push(new URL(url).searchParams.get('since'));
				tickHeaders.push(new Headers(init?.headers).get('if-none-match'));
				return Response.json(
					{ checkpoint: { head: tickHeaders.length === 1 ? 5 : 0 } },
					{ headers: { etag: `"tick-${tickHeaders.length}"` } }
				);
			},
		});

		await source.pollSequenceLog({ cursor: { sequence: 5 }, limit: 100 });
		await source.pollSequenceLog({ cursor: { sequence: 0 }, limit: 100 });

		expect(tickHeaders).toEqual([null, null]);
		expect(tickSince).toEqual(['5', '0']);
	});

	it('re-probes after a non-JSON tick response throws a poison error', async () => {
		let calls = 0;
		const source = createLiveChangeSignalSource({
			syncBaseUrl: 'https://example.test/wp-json/wcpos/v2',
			fetcher: async (url) => {
				expect(new URL(url).searchParams.get('since')).toBe('5');
				calls += 1;
				return calls === 1
					? new Response('<html>maintenance</html>', {
							status: 200,
							headers: { 'content-type': 'text/html' },
						})
					: Response.json({ checkpoint: { head: 5 } });
			},
		});

		await expect(
			source.pollSequenceLog({ cursor: { sequence: 5 }, limit: 100 })
		).rejects.toBeInstanceOf(ChangeSignalPoisonError);
		await source.pollSequenceLog({ cursor: { sequence: 5 }, limit: 100 });

		expect(calls).toBe(2);
	});

	it('permanently falls back when a JSON tick omits checkpoint.head', async () => {
		const urls: string[] = [];
		const source = createLiveChangeSignalSource({
			syncBaseUrl: 'https://example.test/wp-json/wcpos/v2',
			fetcher: async (url) => {
				urls.push(url);
				if (new URL(url).pathname.endsWith('/changes/tick')) {
					expect(new URL(url).searchParams.get('since')).toBe('5');
					return Response.json({ checkpoint: {} });
				}
				return response({ since: 5, head: 5 });
			},
		});

		await source.pollSequenceLog({ cursor: { sequence: 5 }, limit: 100 });
		await source.pollSequenceLog({ cursor: { sequence: 5 }, limit: 100 });

		expect(urls.filter((url) => new URL(url).pathname.endsWith('/changes/tick'))).toHaveLength(1);
		expect(urls.filter((url) => url.includes('/changes/sequence-log'))).toHaveLength(2);
	});
});
