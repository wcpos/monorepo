import { type Observable, Subject } from 'rxjs';
import { beforeEach, describe, expect, it } from 'vitest';

import { dedupeScans, SCAN_DEDUP_WINDOW_MS } from './scan-dedup';

import type { ScanEvent } from './scan-events';

const scan: ScanEvent = { code: '12345678', source: { kind: 'wedge' }, timestamp: 1 };

describe('dedupeScans', () => {
	let receiptTime: number;
	let source$: Subject<ScanEvent>;
	let scans$: Observable<ScanEvent>;
	let received: ScanEvent[];

	beforeEach(() => {
		receiptTime = 0;
		source$ = new Subject<ScanEvent>();
		scans$ = source$.pipe(dedupeScans(undefined, () => receiptTime));
		received = [];
		scans$.subscribe((event) => received.push(event));
	});

	it('passes the same code only once across different source kinds within the window', () => {
		source$.next(scan);
		receiptTime = 151;
		source$.next({ ...scan, source: { kind: 'hid-pos' }, timestamp: 10000 });
		receiptTime = 300;
		source$.next({ ...scan, source: { kind: 'serial' }, timestamp: -10000 });

		expect(received).toEqual([scan]);
	});

	it('passes the same code again after the window', () => {
		source$.next(scan);
		receiptTime = SCAN_DEDUP_WINDOW_MS + 1;
		source$.next(scan);

		expect(received).toEqual([scan, scan]);
	});

	it('does not extend the window when a duplicate is dropped', () => {
		source$.next(scan);
		receiptTime = SCAN_DEDUP_WINDOW_MS - 1;
		source$.next(scan);
		expect(received).toEqual([scan]);
		receiptTime = SCAN_DEDUP_WINDOW_MS;
		source$.next(scan);

		expect(received).toEqual([scan, scan]);
	});

	it('passes different codes within the window', () => {
		const otherScan = { ...scan, code: '22222222' };
		source$.next(scan);
		receiptTime = 1;
		source$.next(otherScan);

		expect(received).toEqual([scan, otherScan]);
	});

	it('gives each subscriber independent state', () => {
		const secondReceived: ScanEvent[] = [];
		scans$.subscribe((event) => secondReceived.push(event));
		source$.next(scan);
		receiptTime = 1;
		source$.next(scan);

		expect(received).toEqual([scan]);
		expect(secondReceived).toEqual([scan]);
	});
});
