import { Observable, Subject } from 'rxjs';

import type { RxdbSyncEngine } from '@wcpos/sync-engine';

import {
	acquireEngineResource,
	releaseEngineResource,
	retainEngineResource,
} from './engine-record-resource';

/**
 * Engines are cache identities here. `active()` is the one method the cache calls: its
 * `scopeId` is the store/cashier scope, which a same-site switch changes WITHOUT replacing
 * the engine object.
 */
function fakeEngine(scopeId: string | null = null): RxdbSyncEngine & { scopeId: string | null } {
	const engine = {
		scopeId,
		active: () => (engine.scopeId === null ? null : { scopeId: engine.scopeId }),
	};
	return engine as unknown as RxdbSyncEngine & { scopeId: string | null };
}

const never$ = () => new Subject<number>().asObservable();

/** Lets the microtask an observable failed on run. */
const flush = () => Promise.resolve().then(() => undefined);

describe('engine record resource cache', () => {
	it('hands back the same resource for the same engine and key', () => {
		// The whole point: a Suspense retry re-runs this call, and it must not build a second
		// resource that suspends for the same reason the first one did.
		const engine = fakeEngine();
		const create = jest.fn(never$);

		const first = acquireEngineResource(engine, 'woo:customers:42', create);
		const second = acquireEngineResource(engine, 'woo:customers:42', create);

		expect(second).toBe(first);
		expect(second.resource).toBe(first.resource);
		expect(create).toHaveBeenCalledTimes(1);
	});

	it('keeps a separate resource per key and per engine', () => {
		const engine = fakeEngine();
		const other = fakeEngine();

		const record = acquireEngineResource(engine, 'woo:customers:42', never$);
		const sibling = acquireEngineResource(engine, 'woo:customers:43', never$);
		const otherEngine = acquireEngineResource(other, 'woo:customers:42', never$);

		expect(sibling.resource).not.toBe(record.resource);
		expect(otherEngine.resource).not.toBe(record.resource);
	});

	it('destroys and evicts the resource when the last reader releases it', () => {
		const engine = fakeEngine();
		const create = jest.fn(never$);

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

		// A consumer that committed on the very first record...
		const retained = acquireEngineResource(engine, 'uuid:products:record-0', never$);
		retainEngineResource(retained);

		// ...while renders that never commit (a Suspense retry, or any discarded render) leave
		// entries nobody will ever release. Those are what the bound is for.
		const unretained = acquireEngineResource(engine, 'uuid:products:record-1', never$);
		for (let index = 2; index < 200; index += 1) {
			acquireEngineResource(engine, `uuid:products:record-${index}`, never$);
		}

		expect(unretained.resource.isDestroyed).toBe(true);
		expect(retained.resource.isDestroyed).toBe(false);
		expect(acquireEngineResource(engine, 'uuid:products:record-0', never$)).toBe(retained);

		releaseEngineResource(retained);
	});

	describe('a stream that fails before anyone commits', () => {
		it('is not served back to the next render', async () => {
			// `ObservableResource` latches the error and `read()` rethrows it forever. Nothing
			// released this entry — the consumer suspended and never committed — so keeping it
			// would make an error-boundary reset or a remount read the same dead resource back,
			// long after the storage fault cleared.
			const engine = fakeEngine();
			const create = jest.fn(
				() =>
					new Observable<number>((subscriber) => {
						void Promise.resolve().then(() => subscriber.error(new Error('storage fault')));
					})
			);

			const failing = acquireEngineResource(engine, 'uuid:products:record-1', create);
			await flush();

			const replacement = acquireEngineResource(engine, 'uuid:products:record-1', create);
			expect(replacement).not.toBe(failing);
			expect(create).toHaveBeenCalledTimes(2);
		});

		it('is not cached at all when it fails synchronously', () => {
			const engine = fakeEngine();
			const create = jest.fn(
				() =>
					new Observable<number>((subscriber) => {
						subscriber.error(new Error('storage fault'));
					})
			);

			const failing = acquireEngineResource(engine, 'uuid:products:record-1', create);
			const replacement = acquireEngineResource(engine, 'uuid:products:record-1', create);

			expect(replacement).not.toBe(failing);
			expect(create).toHaveBeenCalledTimes(2);
		});

		it('is not served back when the stream ends without ever emitting', async () => {
			// `ObservableResource` turns that into "Suspender ended unexpectedly" — an error by
			// any other name.
			const engine = fakeEngine();
			const create = jest.fn(
				() =>
					new Observable<number>((subscriber) => {
						void Promise.resolve().then(() => subscriber.complete());
					})
			);

			const ended = acquireEngineResource(engine, 'uuid:products:record-1', create);
			await flush();

			expect(acquireEngineResource(engine, 'uuid:products:record-1', create)).not.toBe(ended);
		});

		it('keeps serving a resource that emitted before its stream ended', async () => {
			const engine = fakeEngine();
			const create = jest.fn(
				() =>
					new Observable<number>((subscriber) => {
						void Promise.resolve().then(() => {
							subscriber.next(1);
							subscriber.complete();
						});
					})
			);

			const entry = acquireEngineResource(engine, 'uuid:products:record-1', create);
			await flush();

			expect(acquireEngineResource(engine, 'uuid:products:record-1', create)).toBe(entry);
			expect(create).toHaveBeenCalledTimes(1);
		});
	});

	describe('scope identity', () => {
		it('does not serve the outgoing store scope record to the incoming one', () => {
			// A same-site store or cashier switch mutates the engine in place
			// (`engine.scope.switch()`), so the engine object cannot be the whole identity:
			// customer 42 in store A is not customer 42 in store B.
			const engine = fakeEngine('site|1|7');
			const create = jest.fn(never$);

			const inStoreA = acquireEngineResource(engine, 'woo:customers:42', create);
			engine.scopeId = 'site|2|7';
			const inStoreB = acquireEngineResource(engine, 'woo:customers:42', create);

			expect(inStoreB).not.toBe(inStoreA);
			expect(create).toHaveBeenCalledTimes(2);
		});

		it('releases the outgoing scope subscriptions nothing is holding', () => {
			const engine = fakeEngine('site|1|7');

			const unretained = acquireEngineResource(engine, 'woo:customers:42', never$);
			const retained = acquireEngineResource(engine, 'woo:customers:43', never$);
			retainEngineResource(retained);

			engine.scopeId = 'site|2|7';
			acquireEngineResource(engine, 'woo:customers:99', never$);

			expect(unretained.resource.isDestroyed).toBe(true);
			// Still mounted, still reading: its observable re-resolves the collection on the
			// `db$` emission the switch publishes.
			expect(retained.resource.isDestroyed).toBe(false);

			releaseEngineResource(retained);
		});
	});
});
