import { of, Subject } from 'rxjs';
import { describe, expect, it } from 'vitest';

import { createScanBus, createScanHub, inertScanHub, type ScanEvent } from './scan-events';

const scan = (code: string, kind: ScanEvent['source']['kind']): ScanEvent => ({
	code,
	source: { kind },
	timestamp: 1,
});

describe('ScanHub', () => {
	it('merges events from multiple registered sources', () => {
		const hub = createScanHub();
		const serial$ = new Subject<ScanEvent>();
		const hid$ = new Subject<ScanEvent>();
		const received: ScanEvent[] = [];

		hub.registerSource(serial$);
		hub.registerSource(hid$);
		hub.events$.subscribe((event) => received.push(event));
		serial$.next(scan('SERIAL', 'serial'));
		hid$.next(scan('HID', 'hid-pos'));

		expect(received.map((event) => event.code)).toEqual(['SERIAL', 'HID']);
	});

	it('stops delivering a source after it is unregistered', () => {
		const hub = createScanHub();
		const source$ = new Subject<ScanEvent>();
		const received: ScanEvent[] = [];
		const unregister = hub.registerSource(source$);
		hub.events$.subscribe((event) => received.push(event));

		source$.next(scan('BEFORE', 'serial'));
		unregister();
		source$.next(scan('AFTER', 'serial'));

		expect(received.map((event) => event.code)).toEqual(['BEFORE']);
	});

	it('keeps the inert hub silent', () => {
		const received: ScanEvent[] = [];
		inertScanHub.events$.subscribe((event) => received.push(event));

		const unregister = inertScanHub.registerSource(of(scan('SOURCE', 'camera')));
		inertScanHub.emit(scan('EMIT', 'wedge'));
		unregister();

		expect(received).toEqual([]);
	});

	it('keeps delivering other sources after one source errors', () => {
		const hub = createScanHub();
		const failing$ = new Subject<ScanEvent>();
		const healthy$ = new Subject<ScanEvent>();
		const received: ScanEvent[] = [];
		hub.registerSource(failing$);
		hub.registerSource(healthy$);
		hub.events$.subscribe((event) => received.push(event));

		failing$.next(scan('OK-BEFORE', 'serial'));
		failing$.error(new Error('device gone'));
		healthy$.next(scan('STILL-ALIVE', 'hid-pos'));
		hub.emit(scan('EMIT-ALIVE', 'wedge'));

		expect(received.map((event) => event.code)).toEqual(['OK-BEFORE', 'STILL-ALIVE', 'EMIT-ALIVE']);
	});

	it('matches createScanBus hot no-replay semantics for late subscribers', () => {
		for (const channel of [createScanBus(), createScanHub()]) {
			const received: ScanEvent[] = [];
			channel.emit(scan('BEFORE', 'wedge'));
			channel.events$.subscribe((event) => received.push(event));
			channel.emit(scan('AFTER', 'wedge'));

			expect(received.map((event) => event.code)).toEqual(['AFTER']);
		}
	});
});
