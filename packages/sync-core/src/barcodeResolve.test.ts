import { describe, expect, it, vi } from 'vitest';

import {
	type BarcodeIndexEntry,
	type BarcodeResolveFetcher,
	buildLocalBarcodeIndex,
	buildResolveBarcodeUrl,
	type ResolveBarcodeResponse,
	resolveScan,
	type ScanEvent,
} from './barcodeResolve';

const SYNC_BASE_URL = 'http://wcpos.local/wp-json/wc-rxdb-sync/v1';

function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), { status });
}

function resolveResponse(partial: Partial<ResolveBarcodeResponse> = {}): ResolveBarcodeResponse {
	return {
		code: 'x',
		found: false,
		match: null,
		ambiguous: [],
		meta: { duration_ms: 5, server_profile: 'good-local', candidates: 0 },
		...partial,
	};
}

function createFakeClock(startMs = 0) {
	let currentMs = startMs;
	return {
		now: () => currentMs,
		advance: (ms: number) => {
			currentMs += ms;
		},
	};
}

function emptyIndex(): Map<string, BarcodeIndexEntry> {
	return new Map();
}

type ScanArgs = Parameters<typeof resolveScan>[0];

function scanInput(overrides: Partial<ScanArgs> & Pick<ScanArgs, 'code' | 'fetcher'>): ScanArgs {
	return {
		index: emptyIndex(),
		syncBaseUrl: SYNC_BASE_URL,
		now: () => 0,
		onEvent: () => {},
		...overrides,
	};
}

describe('buildLocalBarcodeIndex', () => {
	it('indexes sku, barcode and global_unique_id, skipping empty and non-string values', () => {
		const { index, diagnostics } = buildLocalBarcodeIndex([
			{ id: 'doc-1', payload: { sku: 'SKU-1', barcode: 'BAR-1', global_unique_id: 'GTIN-1' } },
			{ id: 'doc-2', payload: { sku: '', barcode: 123, global_unique_id: '  ' } },
			{ id: 'doc-3', payload: { sku: '  SKU-3  ' } },
		]);
		expect(index.get('SKU-1')).toEqual({ docId: 'doc-1' });
		expect(index.get('BAR-1')).toEqual({ docId: 'doc-1' });
		expect(index.get('GTIN-1')).toEqual({ docId: 'doc-1' });
		expect(index.get('SKU-3')).toEqual({ docId: 'doc-3' });
		expect(index.size).toBe(4);
		expect(diagnostics).toEqual([]);
	});

	it('applies last-write-wins on cross-document collisions and records a diagnostic', () => {
		const { index, diagnostics } = buildLocalBarcodeIndex([
			{ id: 'doc-1', payload: { sku: 'SHARED' } },
			{ id: 'doc-2', payload: { barcode: 'SHARED' } },
		]);
		expect(index.get('SHARED')).toEqual({ docId: 'doc-2' });
		expect(diagnostics).toHaveLength(1);
		expect(diagnostics[0]).toContain('SHARED');
		expect(diagnostics[0]).toContain('doc-1');
		expect(diagnostics[0]).toContain('doc-2');
	});

	it('does not flag the same code appearing twice on one document', () => {
		const { index, diagnostics } = buildLocalBarcodeIndex([
			{ id: 'doc-1', payload: { sku: 'SAME', barcode: 'SAME' } },
		]);
		expect(index.get('SAME')).toEqual({ docId: 'doc-1' });
		expect(diagnostics).toEqual([]);
	});
});

describe('resolveScan local hit', () => {
	it('short-circuits without any network call', async () => {
		const fetcher = vi.fn<BarcodeResolveFetcher>();
		const { index } = buildLocalBarcodeIndex([{ id: 'doc-9', payload: { sku: 'ABC' } }]);
		const events: ScanEvent[] = [];
		const result = await resolveScan(
			scanInput({ code: 'ABC', fetcher, index, onEvent: (event) => events.push(event) })
		);
		expect(result).toMatchObject({
			outcome: 'local',
			docId: 'doc-9',
			timings: { scanToFeedbackMs: 0, scanToResolutionMs: 0 },
		});
		expect(events.map((event) => event.type)).toEqual(['local-hit']);
		expect(fetcher).not.toHaveBeenCalled();
	});

	it('trims the scanned code before lookup (trim-only normalization)', async () => {
		const fetcher = vi.fn<BarcodeResolveFetcher>();
		const { index } = buildLocalBarcodeIndex([{ id: 'doc-9', payload: { sku: 'ABC' } }]);
		const result = await resolveScan(scanInput({ code: '  ABC  ', fetcher, index }));
		expect(result.outcome).toBe('local');
		expect(result.code).toBe('ABC');
		expect(fetcher).not.toHaveBeenCalled();
	});

	it('rejects an empty code without touching the network', async () => {
		const fetcher = vi.fn<BarcodeResolveFetcher>();
		const result = await resolveScan(scanInput({ code: '   ', fetcher }));
		expect(result.outcome).toBe('error');
		expect(fetcher).not.toHaveBeenCalled();
	});
});

describe('resolveScan miss ordering (the contract)', () => {
	it('emits searching-online synchronously BEFORE the fetcher is invoked', async () => {
		const order: string[] = [];
		const fetcher: BarcodeResolveFetcher = async () => {
			order.push('fetch');
			return jsonResponse(resolveResponse());
		};
		await resolveScan(
			scanInput({
				code: 'MISS',
				fetcher,
				onEvent: (event) => order.push(`event:${event.type}`),
			})
		);
		expect(order.indexOf('event:searching-online')).toBeGreaterThanOrEqual(0);
		expect(order.indexOf('fetch')).toBeGreaterThanOrEqual(0);
		expect(order.indexOf('event:searching-online')).toBeLessThan(order.indexOf('fetch'));
		// Full interleaving pinned: feedback, then network, then terminal event.
		expect(order).toEqual(['event:searching-online', 'fetch', 'event:not-found']);
	});

	it('emits searching-online even when the fetch promise never resolves quickly (no await first)', async () => {
		const order: string[] = [];
		let release: (response: Response) => void = () => {};
		const gate = new Promise<Response>((resolveGate) => {
			release = resolveGate;
		});
		const fetcher: BarcodeResolveFetcher = () => {
			order.push('fetch');
			return gate;
		};
		const pending = resolveScan(
			scanInput({ code: 'MISS', fetcher, onEvent: (event) => order.push(`event:${event.type}`) })
		);
		// Synchronous section already ran: feedback was emitted before fetch returned.
		expect(order).toEqual(['event:searching-online', 'fetch']);
		release(jsonResponse(resolveResponse()));
		const result = await pending;
		expect(result.outcome).toBe('not-found');
	});
});

describe('resolveScan online outcomes', () => {
	it('resolves a parent product match', async () => {
		const match = {
			id: 11,
			type: 'product' as const,
			parent_id: 0,
			payload: { id: 11, sku: 'P-11' },
		};
		const fetcher = vi.fn<BarcodeResolveFetcher>(async () =>
			jsonResponse(
				resolveResponse({
					found: true,
					match,
					meta: { duration_ms: 8, server_profile: 'good-local', candidates: 1 },
				})
			)
		);
		const events: ScanEvent[] = [];
		const result = await resolveScan(
			scanInput({ code: 'P-11', fetcher, onEvent: (event) => events.push(event) })
		);
		expect(result).toMatchObject({ outcome: 'online', match, ambiguous: [] });
		if (result.outcome === 'online') {
			expect(result.serverMeta).toEqual({
				duration_ms: 8,
				server_profile: 'good-local',
				candidates: 1,
			});
		}
		expect(events.map((event) => event.type)).toEqual(['searching-online', 'resolved-online']);
	});

	it('resolves a variation match with parent_id', async () => {
		const match = { id: 23, type: 'variation' as const, parent_id: 12, payload: { id: 23 } };
		const fetcher = vi.fn<BarcodeResolveFetcher>(async () =>
			jsonResponse(resolveResponse({ found: true, match }))
		);
		const result = await resolveScan(scanInput({ code: 'V-23', fetcher }));
		expect(result.outcome).toBe('online');
		if (result.outcome === 'online') {
			expect(result.match.type).toBe('variation');
			expect(result.match.parent_id).toBe(12);
		}
	});

	it('surfaces ambiguous matches beyond the first', async () => {
		const match = { id: 5, type: 'product' as const, parent_id: 0, payload: { id: 5 } };
		const ambiguous = [
			{ id: 6, type: 'product' as const },
			{ id: 7, type: 'variation' as const },
		];
		const fetcher = vi.fn<BarcodeResolveFetcher>(async () =>
			jsonResponse(resolveResponse({ found: true, match, ambiguous }))
		);
		const events: ScanEvent[] = [];
		const result = await resolveScan(
			scanInput({ code: 'DUP', fetcher, onEvent: (event) => events.push(event) })
		);
		expect(result.outcome).toBe('online');
		if (result.outcome === 'online') {
			expect(result.ambiguous).toEqual(ambiguous);
		}
		expect(events.map((event) => event.type)).toEqual([
			'searching-online',
			'resolved-online',
			'ambiguous',
		]);
	});

	it('treats found:false as not-found (a result, not an error)', async () => {
		const fetcher = vi.fn<BarcodeResolveFetcher>(async () => jsonResponse(resolveResponse()));
		const events: ScanEvent[] = [];
		const result = await resolveScan(
			scanInput({ code: 'NOPE', fetcher, onEvent: (event) => events.push(event) })
		);
		expect(result.outcome).toBe('not-found');
		expect(events.map((event) => event.type)).toEqual(['searching-online', 'not-found']);
	});

	it('turns HTTP 500 into an error event with the status in the message', async () => {
		const fetcher = vi.fn<BarcodeResolveFetcher>(async () => new Response('boom', { status: 500 }));
		const events: ScanEvent[] = [];
		const result = await resolveScan(
			scanInput({ code: 'KAPUT', fetcher, onEvent: (event) => events.push(event) })
		);
		expect(result.outcome).toBe('error');
		if (result.outcome === 'error') {
			expect(result.message).toContain('500');
		}
		expect(events.map((event) => event.type)).toEqual(['searching-online', 'error']);
	});

	it('turns a network rejection into an error event', async () => {
		const fetcher = vi.fn<BarcodeResolveFetcher>(async () => {
			throw new Error('socket hang up');
		});
		const result = await resolveScan(scanInput({ code: 'OFFLINE', fetcher }));
		expect(result.outcome).toBe('error');
		if (result.outcome === 'error') {
			expect(result.message).toContain('socket hang up');
		}
	});
});

describe('resolveScan request URL', () => {
	async function requestedUrl(profile?: ScanArgs['profile']): Promise<URL> {
		const fetcher = vi.fn<BarcodeResolveFetcher>(async () => jsonResponse(resolveResponse()));
		await resolveScan(scanInput({ code: 'a b+c', fetcher, profile }));
		expect(fetcher).toHaveBeenCalledTimes(1);
		return new URL(fetcher.mock.calls[0][0]);
	}

	it('omits benchmark_profile by default and for good-local', async () => {
		const defaultUrl = await requestedUrl();
		expect(defaultUrl.pathname.endsWith('/resolve/barcode')).toBe(true);
		expect(defaultUrl.searchParams.get('code')).toBe('a b+c');
		expect(defaultUrl.searchParams.get('benchmark_profile')).toBeNull();
		const goodLocalUrl = await requestedUrl('good-local');
		expect(goodLocalUrl.searchParams.get('benchmark_profile')).toBeNull();
	});

	it('appends benchmark_profile for non-default profiles', async () => {
		const url = await requestedUrl('slow-db');
		expect(url.searchParams.get('benchmark_profile')).toBe('slow-db');
	});

	it('buildResolveBarcodeUrl strips a trailing slash from the base url', () => {
		const url = buildResolveBarcodeUrl({ syncBaseUrl: `${SYNC_BASE_URL}/`, code: 'x' });
		expect(url).toBe(`${SYNC_BASE_URL}/resolve/barcode?code=x`);
	});
});

describe('resolveScan timings (injected clock)', () => {
	it('measures feedback and resolution relative to scan start', async () => {
		const clock = createFakeClock(1_000);
		const fetcher: BarcodeResolveFetcher = async () => {
			clock.advance(1_234);
			return jsonResponse(
				resolveResponse({
					found: true,
					match: { id: 1, type: 'product', parent_id: 0, payload: {} },
				})
			);
		};
		const events: ScanEvent[] = [];
		const result = await resolveScan(
			scanInput({ code: 'TIMED', fetcher, now: clock.now, onEvent: (event) => events.push(event) })
		);
		expect(result.timings).toEqual({ scanToFeedbackMs: 0, scanToResolutionMs: 1_234 });
		expect(events).toEqual([
			{ type: 'searching-online', atMs: 0 },
			{ type: 'resolved-online', atMs: 1_234 },
		]);
	});
});
