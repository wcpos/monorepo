import { BehaviorSubject, type Observable } from 'rxjs';
import { map } from 'rxjs/operators';

import { wrapEngineDocument } from '../../src/engine-adapter/document-proxy';

import type { EngineDocument } from '../../src/engine-adapter/collection-map';
import type { RxDocument } from 'rxdb';

/**
 * Observable identity per property access.
 *
 * RxDB's `$` is a GETTER returning a fresh `defer(...).pipe(shareReplay(...))` per read
 * (`rx-document.ts:103`), and the adapter piped on top of it — so two reads of
 * `order.billing$` produced two independent chains, each with its own shareReplay buffer and
 * its own subscription to the collection event stream. `observable-hooks` keys its
 * subscription on observable identity, so every render that read a `<field>$` resubscribed.
 *
 * These tests pin identity only. Emission behaviour is asserted separately below so a
 * regression in either is attributable.
 */
function fakeRxDocument(initial: EngineDocument) {
	const state = new BehaviorSubject(initial);
	let latest = initial;
	state.subscribe((document) => {
		latest = document;
	});
	const collection = { name: 'orders' };
	let revisions$: Observable<RxDocument<EngineDocument>>;
	const makeDocument = (document: EngineDocument): RxDocument<EngineDocument> =>
		({
			...document,
			$: revisions$,
			collection,
			getLatest: () => makeDocument(latest),
			toJSON: () => document,
		}) as unknown as RxDocument<EngineDocument>;
	revisions$ = state.pipe(map((document) => makeDocument(document)));
	return { document: makeDocument(initial), state };
}

const orderDoc = () =>
	fakeRxDocument({
		uuid: 'order-1',
		payload: { date_modified_gmt: '42', billing: { country: 'US' } },
	} as unknown as EngineDocument).document;

describe('adapter field$ observable identity', () => {
	it('returns the same observable for repeated reads of the same field', () => {
		const wrapper = wrapEngineDocument<Record<string, Observable<unknown>>>('orders', orderDoc());

		expect(wrapper.billing$).toBe(wrapper.billing$);
	});

	it('returns the same observable for repeated reads of the document stream', () => {
		const wrapper = wrapEngineDocument<Record<string, Observable<unknown>>>('orders', orderDoc());

		expect(wrapper.$).toBe(wrapper.$);
	});

	it('keeps different fields on different observables', () => {
		const wrapper = wrapEngineDocument<Record<string, Observable<unknown>>>('orders', orderDoc());

		expect(wrapper.billing$).not.toBe(wrapper.date_modified_gmt$);
	});

	it('does not share observables between two different documents', () => {
		const first = wrapEngineDocument<Record<string, Observable<unknown>>>('orders', orderDoc());
		const second = wrapEngineDocument<Record<string, Observable<unknown>>>('orders', orderDoc());

		expect(first.billing$).not.toBe(second.billing$);
	});
});

/**
 * Emission behaviour is UNCHANGED by the identity cache. Pinned here so that if the separate
 * deep-equality change lands later, the difference it makes is attributable to that change
 * and not to this one.
 */
describe('adapter field$ emission behaviour is unchanged', () => {
	function collect(field: string, initial: EngineDocument, next: EngineDocument) {
		const { document, state } = fakeRxDocument(initial);
		const wrapper = wrapEngineDocument<Record<string, Observable<unknown>>>('orders', document);
		const seen: unknown[] = [];
		const sub = wrapper[field].subscribe((value) => seen.push(value));
		state.next(next);
		sub.unsubscribe();
		return seen;
	}

	const withBilling = (modified: string, billing: Record<string, string>) =>
		({
			uuid: 'order-1',
			payload: { date_modified_gmt: modified, billing },
		}) as unknown as EngineDocument;

	it('does not re-emit a primitive field whose value did not change', () => {
		const seen = collect(
			'date_modified_gmt$',
			withBilling('42', { country: 'US' }),
			withBilling('42', { country: 'GB' })
		);

		expect(seen).toEqual(['42']);
	});

	it('re-emits an object field when its content changed', () => {
		const seen = collect(
			'billing$',
			withBilling('42', { country: 'US' }),
			withBilling('42', { country: 'GB' })
		);

		expect(seen).toHaveLength(2);
		expect(seen[1]).toEqual({ country: 'GB' });
	});

	/**
	 * Documents CURRENT behaviour, deliberately: reference equality means an object field
	 * re-emits across revisions even when its content is identical. RxDB's own `get$` uses
	 * `distinctUntilChanged(deepEqual)` for exactly this reason. Changing it is a behaviour
	 * change held back for its own PR — this test is here so that PR's effect is visible as a
	 * diff rather than a surprise.
	 */
	it('still re-emits an object field whose content did NOT change (pre-deepEqual behaviour)', () => {
		const seen = collect(
			'billing$',
			withBilling('42', { country: 'US', city: 'Portland' }),
			withBilling('43', { country: 'US', city: 'Portland' })
		);

		expect(seen).toHaveLength(2);
		expect(seen[0]).toEqual(seen[1]);
		expect(seen[0]).not.toBe(seen[1]);
	});
});
