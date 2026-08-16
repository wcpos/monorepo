/**
 * PROBE — does the adapter's `field$` emit when the field's CONTENT is unchanged?
 *
 * RxDB's own `get$` uses `distinctUntilChanged(deepEqual)`, with this comment:
 *
 *   "Use deepEqual for non-primitive values (objects/arrays) because the default ===
 *    comparison always fails across document revisions since each revision creates new
 *    object references."
 *
 * The engine adapter's `$`-suffixed handler uses a bare `distinctUntilChanged()` — reference
 * equality. This probe records whether RxDB's reasoning applies to us too.
 */
import { BehaviorSubject, type Observable } from 'rxjs';
import { map } from 'rxjs/operators';

import { wrapEngineDocument } from '../../src/engine-adapter/document-proxy';

import type { EngineDocument } from '../../src/engine-adapter/collection-map';
import type { RxDocument } from 'rxdb';

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

function collect(field: string, initial: EngineDocument, next: EngineDocument) {
	const { document, state } = fakeRxDocument(initial);
	const wrapper = wrapEngineDocument<Record<string, Observable<unknown>>>('orders', document);
	const seen: unknown[] = [];
	const sub = wrapper[field].subscribe((value) => seen.push(value));
	state.next(next);
	sub.unsubscribe();
	return seen;
}

/** `date_modified_gmt` is a primitive at `payload.*`; `billing` is an object at `payload.*`. */
const withBilling = (modified: string, billing: Record<string, string>) =>
	({
		id: 'order-1',
		payload: { date_modified_gmt: modified, billing },
	}) as unknown as EngineDocument;

describe('adapter field$ emission on unrelated writes', () => {
	it('does NOT re-emit an OBJECT field whose content did not change', () => {
		const seen = collect(
			'billing$',
			withBilling('42', { country: 'US', city: 'Portland' }),
			// Only `date_modified_gmt` moved. `billing` is structurally equal but a new object,
			// which is what a real revision produces after a round-trip through storage —
			// verified against a real database in `rxdb-field-reference-churn.probe.test.ts`.
			withBilling('43', { country: 'US', city: 'Portland' })
		);

		expect(seen).toHaveLength(1);
		expect(seen[0]).toEqual({ country: 'US', city: 'Portland' });
	});

	it('does NOT re-emit a primitive field whose value did not change', () => {
		const seen = collect(
			'date_modified_gmt$',
			withBilling('42', { country: 'US' }),
			withBilling('42', { country: 'GB' })
		);

		expect(seen).toEqual(['42']);
	});

	it('re-emits an object field when its content genuinely changed', () => {
		const seen = collect(
			'billing$',
			withBilling('42', { country: 'US' }),
			withBilling('42', { country: 'GB' })
		);

		expect(seen).toHaveLength(2);
		expect(seen[1]).toEqual({ country: 'GB' });
	});
});
