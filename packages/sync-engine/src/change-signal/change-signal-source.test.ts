import { describe, expect, it } from 'vitest';

import { createLiveChangeSignalSource } from './change-signal-source';

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
			fetcher: async () => response({ since: 7, head: '42' }),
		});

		await expect(
			source.pollSequenceLog({ cursor: { sequence: 5 }, limit: 100 })
		).resolves.toMatchObject({ cursor: { sequence: 7 }, head: 42 });
	});

	it('leaves head undefined when the checkpoint omits it', async () => {
		const source = createLiveChangeSignalSource({
			syncBaseUrl: 'https://example.test/wp-json/wcpos/v2',
			fetcher: async () => response({ since: 7 }),
		});

		const page = await source.pollSequenceLog({ cursor: { sequence: 5 }, limit: 100 });

		expect(page.head).toBeUndefined();
	});
});

describe('createLiveChangeSignalSource — sequence-log conditional requests', () => {
	it('maps a 304 to the current empty at-head page and retains the ETag', async () => {
		const requests: ({ headers?: HeadersInit } | undefined)[] = [];
		let call = 0;
		const source = createLiveChangeSignalSource({
			syncBaseUrl: 'https://example.test/wp-json/wcpos/v2',
			fetcher: async (_url, init) => {
				requests.push(init);
				call += 1;
				return call === 1
					? new Response(
							JSON.stringify({
								changes: [],
								checkpoint: { since: 5, head: 5 },
								complete: true,
								config_fingerprint: {
									fingerprints: { products: 'p1', variations: 'v1', tax_rates: 't1' },
								},
							}),
							{
								status: 200,
								headers: { 'content-type': 'application/json', etag: '"sequence-5"' },
							}
						)
					: new Response(null, { status: 304, headers: { etag: '"sequence-5"' } });
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
						headers: { 'content-type': 'application/json', etag: `"sequence-${since}"` },
					}
				);
			},
		});

		await source.pollSequenceLog({ cursor: { sequence: 5 }, limit: 100 });
		await source.pollSequenceLog({ cursor: { sequence: 0 }, limit: 100 });

		expect(new Headers(requests[1]?.headers).get('if-none-match')).toBeNull();
	});

	it('surfaces the embedded config fingerprint beside the sequence page', async () => {
		const source = createLiveChangeSignalSource({
			syncBaseUrl: 'https://example.test/wp-json/wcpos/v2',
			fetcher: async () =>
				new Response(
					JSON.stringify({
						changes: [],
						checkpoint: { since: 5, head: 5 },
						complete: true,
						config_fingerprint: {
							candidate: 'config-fingerprint',
							fingerprints: { products: 'p1', variations: 'v1', tax_rates: 't1' },
							barcode_fields: { products: ['sku'], variations: [], tax_rates: [] },
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
	});
});
