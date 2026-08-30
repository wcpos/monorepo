import { Subject } from 'rxjs';

import type { RxdbSyncEngine } from '@wcpos/sync-engine';

import {
	acquireEngineResource,
	releaseEngineResource,
	retainEngineResource,
} from './engine-record-resource';

/** Engines are only ever used as cache identities here. */
const fakeEngine = (): RxdbSyncEngine => ({}) as unknown as RxdbSyncEngine;

describe('engine record resource cache', () => {
	it('hands back the same resource for the same engine and key', () => {
		// The whole point: a Suspense retry re-runs this call, and it must not build a second
		// resource that suspends for the same reason the first one did.
		const engine = fakeEngine();
		const create = jest.fn(() => new Subject<number>().asObservable());

		const first = acquireEngineResource(engine, 'woo:customers:42', create);
		const second = acquireEngineResource(engine, 'woo:customers:42', create);

		expect(second).toBe(first);
		expect(second.resource).toBe(first.resource);
		expect(create).toHaveBeenCalledTimes(1);
	});

	it('keeps a separate resource per key and per engine', () => {
		const engine = fakeEngine();
		const other = fakeEngine();
		const create = () => new Subject<number>().asObservable();

		const record = acquireEngineResource(engine, 'woo:customers:42', create);
		const sibling = acquireEngineResource(engine, 'woo:customers:43', create);
		const otherScope = acquireEngineResource(other, 'woo:customers:42', create);

		expect(sibling.resource).not.toBe(record.resource);
		// A scope switch must never serve the previous scope's records.
		expect(otherScope.resource).not.toBe(record.resource);
	});

	it('destroys and evicts the resource when the last reader releases it', () => {
		const engine = fakeEngine();
		const create = jest.fn(() => new Subject<number>().asObservable());

		const entry = acquireEngineResource(engine, 'uuid:orders:order-uuid', create);
		retainEngineResource(entry);
		retainEngineResource(entry);

		releaseEngineResource(entry);
		expect(entry.resource.isDestroyed).toBe(false);
		expect(acquireEngineResource(engine, 'uuid:orders:order-uuid', create)).toBe(entry);

		releaseEngineResource(entry);
		expect(entry.resource.isDestroyed).toBe(true);
		// Evicted with the destroy: the next ask must not be served a dead subscription.
		expect(acquireEngineResource(engine, 'uuid:orders:order-uuid', create)).not.toBe(entry);
		expect(create).toHaveBeenCalledTimes(2);
	});

	it('bounds the cache by evicting unretained entries, never retained ones', () => {
		const engine = fakeEngine();
		const create = () => new Subject<number>().asObservable();

		// A consumer that committed on the very first record...
		const retained = acquireEngineResource(engine, 'uuid:products:record-0', create);
		retainEngineResource(retained);

		// ...while renders that never commit (the retry above, and any discarded render) leave
		// entries nobody will ever release. Those are what the bound is for.
		const unretained = acquireEngineResource(engine, 'uuid:products:record-1', create);
		for (let index = 2; index < 200; index += 1) {
			acquireEngineResource(engine, `uuid:products:record-${index}`, create);
		}

		expect(unretained.resource.isDestroyed).toBe(true);
		expect(retained.resource.isDestroyed).toBe(false);
		expect(acquireEngineResource(engine, 'uuid:products:record-0', create)).toBe(retained);

		releaseEngineResource(retained);
	});
});
