import { describe, expect, it, vi } from 'vitest';

import {
	type BarcodeIndexEntry,
	barcodeMatchCandidates,
	type BarcodeResolveFetcher,
	buildBarcodeSymbologyIndex,
	buildLocalBarcodeIndex,
	buildResolveBarcodeUrl,
	compressToUpcE,
	deriveBarcodeFromPayload,
	expandUpcE,
	type ResolveBarcodeResponse,
	resolveScan,
	type ScanEvent,
} from './barcodeResolve';

describe('deriveBarcodeFromPayload', () => {
	it.each([
		['sku', { sku: '  SKU-1  ' }, 'SKU-1'],
		['global_unique_id', { global_unique_id: '  GTIN-1  ' }, 'GTIN-1'],
		['meta_data:_barcode', { meta_data: [{ key: '_barcode', value: '  CUSTOM-1  ' }] }, 'CUSTOM-1'],
	] as const)(
		'derives the active %s carrier with trim-only normalization',
		(selector, raw, expected) => {
			expect(deriveBarcodeFromPayload(raw, [selector])).toBe(expected);
		}
	);

	it('returns undefined for an empty selector list or unusable carriers', () => {
		expect(deriveBarcodeFromPayload({ barcode: 'keep-me' }, [])).toBeUndefined();
		expect(deriveBarcodeFromPayload({ sku: '   ' }, ['sku'])).toBeUndefined();
		expect(
			deriveBarcodeFromPayload({ global_unique_id: 123 }, ['global_unique_id'])
		).toBeUndefined();
	});
});

const SYNC_BASE_URL = 'http://wcpos.local/wp-json/wcpos/v2';

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

describe('barcodeMatchCandidates (UPC-A ↔ EAN-13 equivalence, #740)', () => {
	it('offers the 12-digit UPC-A form for a 13-digit leading-zero code', () => {
		expect(barcodeMatchCandidates('0012345678905')).toEqual(['0012345678905', '012345678905']);
	});

	it('offers the 13-digit EAN-13 form for a 12-digit UPC-A code', () => {
		expect(barcodeMatchCandidates('012345678905')).toEqual(['012345678905', '0012345678905']);
	});

	it('leaves a genuine EAN-13 (13 digits, non-zero prefix) unchanged', () => {
		expect(barcodeMatchCandidates('4006381333931')).toEqual(['4006381333931']);
	});

	it('leaves non-UPC/EAN codes (wrong length or non-digit) unchanged', () => {
		expect(barcodeMatchCandidates('ABC123')).toEqual(['ABC123']);
		expect(barcodeMatchCandidates('12345')).toEqual(['12345']);
	});

	it('offers the UPC-E form of a compressible UPC-A', () => {
		// Same GTIN, printed two ways: a small package carries the 8-digit UPC-E,
		// supplier data carries the 12. A store may hold either.
		expect(barcodeMatchCandidates('012345000065')).toEqual([
			'012345000065',
			'0012345000065',
			'01234565',
		]);
	});

	it('never expands an UNLABELLED 8-digit scan, which EAN-8 and UPC-E both claim', () => {
		// 01234565 is a valid UPC-E for 012345000065 AND a valid EAN-8. That is not
		// a coincidence: whenever the last data digit is 5-9 the expansion inserts
		// four zeros, an even shift that leaves every other digit's weight — and so
		// the check digit — untouched. With nothing to disambiguate, guessing could
		// put an unrelated product in the cart, so the code is matched as itself.
		expect(barcodeMatchCandidates('01234565')).toEqual(['01234565']);
		expect(barcodeMatchCandidates('01234565', 'ean8')).toEqual(['01234565']);
	});

	it('expands an 8-digit scan the source labelled UPC-E', () => {
		// The wedge read the symbol and told us what it was, so there is nothing to
		// guess: the store may hold this GTIN as the printed 8 or as the 12/13 that
		// supplier data carries.
		expect(barcodeMatchCandidates('01234565', 'upc_e')).toEqual([
			'01234565',
			'012345000065',
			'0012345000065',
		]);
		expect(barcodeMatchCandidates('01234565', 'UPC-E')).toEqual([
			'01234565',
			'012345000065',
			'0012345000065',
		]);
	});

	it('offers nothing extra for a UPC-E label on a code that cannot be one', () => {
		expect(barcodeMatchCandidates('96385074', 'upc_e')).toEqual(['96385074']);
		expect(barcodeMatchCandidates('04825303', 'upc_e')).toEqual(['04825303']);
	});

	it('reaches the UPC-E form from the 13-digit reading too', () => {
		expect(barcodeMatchCandidates('0012345000065')).toEqual([
			'0012345000065',
			'012345000065',
			'01234565',
		]);
	});

	it('offers no UPC-E form for a UPC-A that has none', () => {
		// 733620209958 is number system 7 — outside UPC-E's 0/1 range entirely.
		expect(barcodeMatchCandidates('733620209958')).toEqual(['733620209958', '0733620209958']);
		// Number system 0, but no squeezable zero run.
		expect(barcodeMatchCandidates('012345678905')).toEqual(['012345678905', '0012345678905']);
	});

	it('does not treat an EAN-8 as a UPC-E', () => {
		expect(barcodeMatchCandidates('09638507')).toEqual(['09638507']);
		expect(barcodeMatchCandidates('96385074')).toEqual(['96385074']);
	});

	it('trims before classifying', () => {
		expect(barcodeMatchCandidates('  012345678905  ')).toEqual(['012345678905', '0012345678905']);
	});
});

describe('UPC-E ↔ UPC-A conversion', () => {
	// One pair per zero-run rule — which run the expansion restores is decided by
	// the last data digit — plus a number-system-1 code.
	const PAIRS: [upce: string, upca: string][] = [
		['04825302', '048000002532'], // last data digit 0
		['04825311', '048100002531'], // 1
		['07391422', '073200009142'], // 2
		['01862736', '018600000276'], // 3
		['09253847', '092530000087'], // 4
		['06401979', '064019000079'], // 5-9
		['12837465', '128374000065'], // number system 1
	];

	it.each(PAIRS)('expands %s to %s', (upce, upca) => {
		expect(expandUpcE(upce)).toBe(upca);
	});

	it.each(PAIRS)('compresses %s back from %s', (upce, upca) => {
		expect(compressToUpcE(upca)).toBe(upce);
	});

	it('rejects an 8-digit code whose check digit contradicts its expansion', () => {
		expect(expandUpcE('04825303')).toBeNull();
	});

	it('rejects inputs that are not UPC-E shaped', () => {
		expect(expandUpcE('24825302')).toBeNull(); // number system 2
		expect(expandUpcE('0482530')).toBeNull(); // too short
		expect(expandUpcE('0482530A')).toBeNull(); // not all digits
	});

	it('returns null for a UPC-A with no UPC-E form', () => {
		expect(compressToUpcE('012345678905')).toBeNull(); // no squeezable zero run
		expect(compressToUpcE('733620209958')).toBeNull(); // number system 7
		expect(compressToUpcE('0123456789')).toBeNull(); // wrong length
	});

	it('refuses a candidate that does not survive the round trip', () => {
		// The zero run matches a rule, but the code's own check digit belongs to a
		// different number — expanding the candidate back does not reproduce it.
		expect(compressToUpcE('048000002533')).toBeNull();
	});
});

describe('buildBarcodeSymbologyIndex (#740)', () => {
	it('indexes barcode and global_unique_id but NOT sku', () => {
		const { index } = buildBarcodeSymbologyIndex([
			{
				id: 'doc-1',
				payload: { sku: '012345678905', barcode: 'BAR-1', global_unique_id: 'GTIN-1' },
			},
		]);
		expect(index.has('BAR-1')).toBe(true);
		expect(index.has('GTIN-1')).toBe(true);
		// A numeric SKU must not enter the symbology index (no false equivalence).
		expect(index.has('012345678905')).toBe(false);
		expect(index.size).toBe(2);
	});

	it('supports UPC-A/EAN-13 equivalence only for genuine barcode fields', () => {
		const { index } = buildBarcodeSymbologyIndex([
			{ id: 'doc-2', payload: { barcode: '012345678905' } },
		]);
		// The camera (13-digit) form matches when combined with barcodeMatchCandidates.
		expect(barcodeMatchCandidates('0012345678905').some((c) => index.has(c))).toBe(true);
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
	it('preserves the current wrapped match and ambiguous shapes', async () => {
		const match = { id: 7, type: 'variation' as const, parent_id: 3, payload: { name: 'Blue' } };
		const ambiguous = [{ id: 8, type: 'product' as const }];
		const result = await resolveScan(
			scanInput({
				code: 'CURRENT',
				fetcher: async () => jsonResponse(resolveResponse({ found: true, match, ambiguous })),
			})
		);

		expect(result).toMatchObject({ outcome: 'online', match, ambiguous });
	});

	it('normalizes a future bare variation match and bare ambiguous entries', async () => {
		const bare = { id: 7, parent_id: 3, name: 'Blue' };
		const result = await resolveScan(
			scanInput({
				code: 'FUTURE',
				fetcher: async () =>
					jsonResponse({
						...resolveResponse(),
						found: true,
						match: bare,
						ambiguous: [{ id: 8, parent_id: 2 }, { id: 9 }],
					}),
			})
		);

		expect(result).toMatchObject({
			outcome: 'online',
			match: { id: 7, parent_id: 3, type: 'variation', payload: bare },
			ambiguous: [
				{ id: 8, type: 'variation' },
				{ id: 9, type: 'product' },
			],
		});
	});

	it('uses payload and explicit ambiguous type first in mixed entries', async () => {
		const match = { id: 7, parent_id: 0, type: 'product' as const, payload: { id: 70 } };
		const result = await resolveScan(
			scanInput({
				code: 'MIXED',
				fetcher: async () =>
					jsonResponse({
						...resolveResponse(),
						found: true,
						match,
						ambiguous: [{ id: 8, type: 'product', parent_id: 2 }],
					}),
			})
		);

		expect(result).toMatchObject({
			outcome: 'online',
			match,
			ambiguous: [{ id: 8, type: 'product' }],
		});
	});

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

describe('resolveScan UPC-A/EAN-13 equivalence (#740)', () => {
	// The physical UPC-A on a retail package. zxing-wasm 3.x (the web/Electron
	// camera decoder) and the iOS camera both report it as the 13-digit GTIN
	// form; HID wedges and Android report the bare 12 digits printed under the
	// bars. Either form must resolve against a store keyed on the other.
	const UPC_A = '733620209958';
	const EAN_13 = '0733620209958';

	it('matches the local index on the scanned form ONLY', async () => {
		// `input.index` may be the all-fields index, whose entries carry no field
		// provenance — so a counterpart probe here could hand a numeric SKU the
		// 0-prefixed twin barcodeMatchCandidates forbids and resolve the scan to an
		// unrelated product. Equivalence is use-barcode-search's job; it knows the
		// store's declared barcode carrier. This flow goes online instead.
		const fetcher = vi.fn<BarcodeResolveFetcher>(async () => jsonResponse(resolveResponse()));
		const { index } = buildLocalBarcodeIndex([{ id: 'doc-sku', payload: { sku: UPC_A } }]);
		const events: ScanEvent[] = [];
		const result = await resolveScan(
			scanInput({ code: EAN_13, fetcher, index, onEvent: (event) => events.push(event) })
		);
		expect(result.outcome).toBe('not-found');
		expect(events.map((event) => event.type)).toEqual(['searching-online', 'not-found']);
	});

	it('still takes a local hit when the scanned form itself is indexed', async () => {
		const fetcher = vi.fn<BarcodeResolveFetcher>();
		const { index } = buildLocalBarcodeIndex([{ id: 'doc-upc', payload: { barcode: EAN_13 } }]);
		const result = await resolveScan(scanInput({ code: EAN_13, fetcher, index }));
		expect(result).toMatchObject({ outcome: 'local', docId: 'doc-upc', code: EAN_13 });
		expect(fetcher).not.toHaveBeenCalled();
	});

	it('retries the online resolve with the counterpart after found:false', async () => {
		const match = {
			id: 41,
			type: 'product' as const,
			parent_id: 0,
			payload: { name: 'Hand Lotion' },
		};
		const fetcher = vi.fn<BarcodeResolveFetcher>(async (url) =>
			jsonResponse(
				new URL(url).searchParams.get('code') === UPC_A
					? resolveResponse({ code: UPC_A, found: true, match })
					: resolveResponse({ code: EAN_13 })
			)
		);
		const events: ScanEvent[] = [];
		const result = await resolveScan(
			scanInput({ code: EAN_13, fetcher, onEvent: (event) => events.push(event) })
		);

		expect(result).toMatchObject({ outcome: 'online', code: EAN_13, match });
		expect(fetcher).toHaveBeenCalledTimes(2);
		expect(new URL(fetcher.mock.calls[0][0]).searchParams.get('code')).toBe(EAN_13);
		expect(new URL(fetcher.mock.calls[1][0]).searchParams.get('code')).toBe(UPC_A);
		// One searching-online for the whole scan: the retry is an implementation
		// detail, not a second thing the cashier is told about.
		expect(events.map((event) => event.type)).toEqual(['searching-online', 'resolved-online']);
	});

	it('reports not-found only after every candidate misses', async () => {
		const fetcher = vi.fn<BarcodeResolveFetcher>(async () => jsonResponse(resolveResponse()));
		const events: ScanEvent[] = [];
		const result = await resolveScan(
			scanInput({ code: UPC_A, fetcher, onEvent: (event) => events.push(event) })
		);
		expect(result.outcome).toBe('not-found');
		expect(fetcher).toHaveBeenCalledTimes(2);
		expect(new URL(fetcher.mock.calls[1][0]).searchParams.get('code')).toBe(EAN_13);
		expect(events.map((event) => event.type)).toEqual(['searching-online', 'not-found']);
	});

	it('carries the scan symbology into the online candidate forms', async () => {
		// Without it an 8-digit UPC-E would only ever be asked for as itself, and a
		// store keyed on the 12-digit GTIN would answer not-found.
		const fetcher = vi.fn<BarcodeResolveFetcher>(async () => jsonResponse(resolveResponse()));
		await resolveScan(scanInput({ code: '01234565', symbology: 'upc_e', fetcher }));
		expect(fetcher.mock.calls.map((call) => new URL(call[0]).searchParams.get('code'))).toEqual([
			'01234565',
			'012345000065',
			'0012345000065',
		]);
	});

	it('asks only for the scanned form when the source gave no symbology', async () => {
		const fetcher = vi.fn<BarcodeResolveFetcher>(async () => jsonResponse(resolveResponse()));
		await resolveScan(scanInput({ code: '01234565', fetcher }));
		expect(fetcher).toHaveBeenCalledTimes(1);
	});

	it('spends no extra request on a code with no counterpart', async () => {
		const fetcher = vi.fn<BarcodeResolveFetcher>(async () => jsonResponse(resolveResponse()));
		// A genuine EAN-13 (non-zero prefix) has exactly one form.
		const result = await resolveScan(scanInput({ code: '5901234123457', fetcher }));
		expect(result.outcome).toBe('not-found');
		expect(fetcher).toHaveBeenCalledTimes(1);
	});

	it('stops at a transport failure instead of burning the counterpart on a dead network', async () => {
		const fetcher = vi.fn<BarcodeResolveFetcher>(async () => {
			throw new Error('socket hang up');
		});
		const result = await resolveScan(scanInput({ code: EAN_13, fetcher }));
		expect(result.outcome).toBe('error');
		expect(fetcher).toHaveBeenCalledTimes(1);
	});

	it('stops at a non-2xx instead of retrying the counterpart', async () => {
		const fetcher = vi.fn<BarcodeResolveFetcher>(async () => new Response('boom', { status: 500 }));
		const result = await resolveScan(scanInput({ code: EAN_13, fetcher }));
		expect(result.outcome).toBe('error');
		expect(fetcher).toHaveBeenCalledTimes(1);
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
