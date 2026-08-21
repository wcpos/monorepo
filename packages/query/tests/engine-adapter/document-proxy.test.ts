/** @jest-environment node */

import { BehaviorSubject, type Observable } from 'rxjs';
import { map } from 'rxjs/operators';

import {
	EngineAdapterReadOnlyError,
	wrapEngineDocument,
} from '../../src/engine-adapter/document-proxy';
import { collectionMap } from '../../src/engine-adapter/collection-map';

import type {
	EngineDocument,
	FieldMapEntry,
	LegacyCollectionName,
} from '../../src/engine-adapter/collection-map';
import type { RxDocument } from 'rxdb';

type LegacyProxy = Record<string, unknown> & {
	uuid: string;
	id: number;
	name: string;
	$: Observable<LegacyProxy>;
	name$: Observable<unknown>;
	toJSON(): Record<string, unknown>;
	toMutableJSON(): Record<string, unknown>;
	getLatest(): LegacyProxy;
};

function proxyNestedObjects(value: unknown): unknown {
	if (value === null || typeof value !== 'object') {
		return value;
	}
	return new Proxy(value, {
		get: (target, property, receiver) =>
			proxyNestedObjects(Reflect.get(target, property, receiver)),
	});
}

function fakeRxDocument(initial: EngineDocument, proxyPayload = false) {
	const state = new BehaviorSubject(initial);
	let latest = initial;
	state.subscribe((document) => {
		latest = document;
	});
	const collection = { name: 'products' };
	let revisions$: Observable<RxDocument<EngineDocument>>;
	const makeDocument = (document: EngineDocument): RxDocument<EngineDocument> => {
		const rxDocument = {
			...document,
			$: revisions$,
			collection,
			getLatest: () => makeDocument(latest),
			toJSON: () => document,
		};
		if (proxyPayload) {
			Object.defineProperty(rxDocument, 'payload', {
				get: () => proxyNestedObjects(document.payload),
			});
		}
		return rxDocument as unknown as RxDocument<EngineDocument>;
	};
	revisions$ = state.pipe(map((document) => makeDocument(document)));
	return { document: makeDocument(initial), state, collection };
}

function setPath(target: Record<string, unknown>, path: string, value: unknown): void {
	const parts = path.split('.');
	let current = target;
	parts.forEach((part, index) => {
		if (index === parts.length - 1) {
			current[part] = value;
			return;
		}
		if (current[part] === null || typeof current[part] !== 'object') {
			current[part] = {};
		}
		current = current[part] as Record<string, unknown>;
	});
}

describe('wrapEngineDocument', () => {
	it('reads identifiers, promoted values, payload values, and collection through one proxy', () => {
		const source = fakeRxDocument({
			uuid: 'product-uuid',
			remoteId: '42',
			stockStatus: 'instock',
			payload: { id: 42, name: 'Coffee', price: '12.345' },
		});
		const proxy = wrapEngineDocument('products', source.document) as LegacyProxy;

		expect(proxy.uuid).toBe('product-uuid');
		expect(proxy.id).toBe(42);
		expect(proxy.name).toBe('Coffee');
		expect(proxy.price).toBe('12.345');
		expect(proxy.stock_status).toBe('instock');
		expect(proxy.collection).toBe(source.collection);
	});

	it('derives any legacy field observable from the live engine document stream', () => {
		const source = fakeRxDocument({
			uuid: 'product-uuid',
			remoteId: '42',
			payload: { name: 'Coffee' },
		});
		const proxy = wrapEngineDocument('products', source.document) as LegacyProxy;
		const observer = jest.fn();
		const subscription = proxy.name$.subscribe(observer);

		source.state.next({
			uuid: 'product-uuid',
			remoteId: '42',
			payload: { name: 'Tea' },
		});
		source.state.next({
			uuid: 'product-uuid',
			remoteId: '42',
			payload: { name: 'Tea' },
		});

		expect(observer).toHaveBeenCalledTimes(2);
		expect(observer).toHaveBeenNthCalledWith(1, 'Coffee');
		expect(observer).toHaveBeenNthCalledWith(2, 'Tea');
		subscription.unsubscribe();
	});

	it('exposes mapped order links through snapshot and observable reads', () => {
		const initialLinks = {
			payment: [{ href: 'https://example.com/order-pay/123?key=abc' }],
		};
		const updatedLinks = {
			payment: [{ href: 'https://example.com/order-pay/123?key=updated' }],
		};
		const initialOrder: Record<string, unknown> = {
			uuid: 'order-uuid',
			payload: { links: initialLinks },
		};
		const updatedOrder: Record<string, unknown> = {
			uuid: 'order-uuid',
			payload: { links: updatedLinks },
		};
		const source = fakeRxDocument(initialOrder as EngineDocument);
		const proxy = wrapEngineDocument('orders', source.document) as {
			links: unknown;
			links$: Observable<unknown>;
		};
		const observer = jest.fn();
		const subscription = proxy.links$.subscribe(observer);

		expect(proxy.links).toEqual(initialLinks);
		source.state.next(updatedOrder as EngineDocument);
		expect(observer).toHaveBeenNthCalledWith(1, initialLinks);
		expect(observer).toHaveBeenNthCalledWith(2, updatedLinks);
		subscription.unsubscribe();
	});

	it('exposes the root document observable with every revision re-wrapped as a proxy', () => {
		const source = fakeRxDocument({
			uuid: 'product-uuid',
			remoteId: '42',
			payload: { name: 'Coffee' },
		});
		const proxy = wrapEngineDocument('products', source.document) as LegacyProxy;
		const revisions: LegacyProxy[] = [];
		const subscription = proxy.$.subscribe((revision) => revisions.push(revision));

		source.state.next({
			uuid: 'product-uuid',
			remoteId: '42',
			payload: { name: 'Tea' },
		});

		expect(revisions).toHaveLength(2);
		expect(revisions.map((revision) => revision.name)).toEqual(['Coffee', 'Tea']);
		expect(revisions[1]).not.toBe(proxy);
		expect(revisions[1].getLatest().name).toBe('Tea');
		subscription.unsubscribe();
	});

	it('returns flattened legacy snapshots and deep-clones the mutable snapshot', () => {
		const source = fakeRxDocument({
			uuid: 'product-uuid',
			remoteId: '42',
			payload: { id: 999, name: 'Coffee', images: [{ src: 'coffee.jpg' }] },
		});
		const proxy = wrapEngineDocument('products', source.document) as LegacyProxy;

		expect(proxy.toJSON()).toEqual({
			id: 42,
			uuid: 'product-uuid',
			name: 'Coffee',
			images: [{ src: 'coffee.jpg' }],
		});
		const mutable = proxy.toMutableJSON();
		(mutable.images as { src: string }[])[0].src = 'changed.jpg';
		expect((proxy.toJSON().images as { src: string }[])[0].src).toBe('coffee.jpg');
	});

	it('sanitizes variation attributes for direct and snapshot reads (#811)', () => {
		const valid = { id: 2, name: 'Size', option: 'Large' };
		const source = fakeRxDocument({
			uuid: 'variation-uuid',
			remoteId: '101',
			payload: {
				attributes: [valid, { id: 1, name: { rendered: 'Color' }, option: 'Red' }],
			},
		});
		const proxy = wrapEngineDocument('variations', source.document) as LegacyProxy & {
			attributes: unknown;
		};

		expect(proxy.attributes).toEqual([valid]);
		expect(proxy.toJSON().attributes).toEqual([valid]);
		expect(proxy.toMutableJSON().attributes).toEqual([valid]);
	});

	it('creates cloneable snapshots without RxDB property proxies', () => {
		const source = fakeRxDocument(
			{
				uuid: 'product-uuid',
				remoteId: '42',
				payload: {
					dimensions: { length: '10' },
					_links: { self: [{ href: 'https://example.com/products/42' }] },
					cost_of_goods_sold: { value: '5.00' },
				},
			},
			true
		);
		expect(() => structuredClone(source.document.payload)).toThrow();

		const proxy = wrapEngineDocument('products', source.document) as LegacyProxy;
		const snapshot = proxy.toJSON();
		expect(snapshot).toMatchObject({ uuid: 'product-uuid', id: 42 });
		expect(() => structuredClone(snapshot)).not.toThrow();

		const mutable = proxy.toMutableJSON();
		expect(mutable).toEqual(snapshot);
		expect(Object.getPrototypeOf(mutable)).toBe(Object.prototype);
		expect(() => structuredClone(mutable)).not.toThrow();
		(mutable.dimensions as { length: string }).length = '20';
		expect((snapshot.dimensions as { length: string }).length).toBe('10');
	});

	it('wraps the latest underlying document', () => {
		const source = fakeRxDocument({
			uuid: 'product-uuid',
			remoteId: '42',
			payload: { name: 'Coffee' },
		});
		const proxy = wrapEngineDocument('products', source.document) as LegacyProxy;
		source.state.next({
			uuid: 'product-uuid',
			remoteId: '42',
			payload: { name: 'Tea' },
		});

		expect(proxy.getLatest()).not.toBe(proxy);
		expect(proxy.getLatest().name).toBe('Tea');
	});

	it.each(['patch', 'incrementalPatch', 'incrementalModify', 'remove', 'update'])(
		'throws the named read-only error for %s',
		(method) => {
			const source = fakeRxDocument({ uuid: 'product-uuid', payload: {} });
			const proxy = wrapEngineDocument('products', source.document) as Record<
				string,
				() => unknown
			>;

			expect(() => proxy[method]()).toThrow(EngineAdapterReadOnlyError);
			expect(() => proxy[method]()).toThrow('useMutation, useLocalMutation, or usePushDocument');
		}
	);

	it.each(Object.keys(collectionMap) as LegacyCollectionName[])(
		'reads every explicitly mapped census field for %s through the proxy',
		(collection) => {
			const fields = collectionMap[collection].fields as Record<string, FieldMapEntry>;
			const fixture: Record<string, unknown> = {
				uuid: `${collection}:uuid`,
				payload: {},
			};
			const expected = new Map<string, unknown>();
			Object.values(fields).forEach((field) => {
				if (field.kind === 'computed') {
					return;
				}
				const legacyNumericId = field.legacy === 'id' || field.legacy === 'parent_id';
				const engineValue =
					field.legacy === 'uuid'
						? `${collection}:uuid`
						: legacyNumericId
							? '101'
							: field.read
								? [{ name: 'Color', option: 'Red' }]
								: `${collection}:${field.legacy}`;
				setPath(fixture, field.readEnginePath ?? field.enginePath, engineValue);
				expected.set(field.legacy, legacyNumericId ? 101 : engineValue);
			});
			const source = fakeRxDocument(fixture as EngineDocument);
			const proxy = wrapEngineDocument(collection, source.document);

			expected.forEach((value, field) => {
				expect(proxy[field]).toEqual(value);
			});
		}
	);

	it('reads numeric and UI computed fields from engine documents', () => {
		const order = wrapEngineDocument(
			'orders',
			fakeRxDocument({
				uuid: 'order-1',
				payload: {
					total: '12.345',
					meta_data: [{ key: '_pos_user', value: '7' }],
				},
			}).document
		);
		const coupon = wrapEngineDocument(
			'coupons',
			fakeRxDocument({
				uuid: 'coupon-1',
				payload: { status: 'publish', date_expires_gmt: '2999-01-01T00:00:00' },
			}).document
		);
		const product = wrapEngineDocument(
			'products',
			fakeRxDocument({ uuid: 'product-1', payload: { price: '1.004' } }).document
		);

		expect(order.cashier).toBe('7');
		expect(order.sortable_total).toBe(12.345);
		expect(order.select).toBeUndefined();
		expect(coupon.active).toBe(true);
		expect(product.sortable_price).toBe(1.004);
	});
});

describe('rxdocument identity contract (codex round 1)', () => {
	const source = () =>
		fakeRxDocument({
			uuid: 'product-uuid',
			remoteId: '42',
			stockStatus: 'instock',
			payload: { id: 42, name: 'Coffee', price: '12.345' },
		});

	it('satisfies the isRxDocument shape check and in-guards', () => {
		const proxy = wrapEngineDocument('products', source().document) as Record<string, unknown>;
		expect('isInstanceOfRxDocument' in proxy).toBe(true);
		expect(proxy.isInstanceOfRxDocument).toBe(true);
		expect('name' in proxy).toBe(true);
		expect('missing_field' in proxy).toBe(false);
		expect(proxy.primary).toBe('product-uuid');
	});

	it('exposes get(path) reads through the translation map', () => {
		const proxy = wrapEngineDocument('products', source().document) as Record<string, unknown>;
		const get = proxy.get as (path: string) => unknown;
		expect(get('name')).toBe('Coffee');
		expect(get('uuid')).toBe('product-uuid');
		expect(get('id')).toBe(42);
	});
});

/**
 * Wrapper identity across query emissions.
 *
 * `wrapEngineDocument` used to build a fresh Proxy per call, so every query emission handed
 * React all-new document identities — a write to one row reconciled every row and cell in
 * every table, and the current-order context ticked on writes to unrelated orders.
 *
 * The cache is keyed on the underlying RxDocument instance. That is only safe because RxDB
 * gives a NEW instance whenever a document's data changes and reuses it when it does not, so
 * "same instance" and "same data" are the same statement. That property is a third-party
 * guarantee, pinned separately by `rxdb-document-identity.probe.test.ts` in
 * `@wcpos/database` — re-run it on any RxDB upgrade.
 */
describe('wrapEngineDocument identity across emissions', () => {
	const makeDoc = (payload: Record<string, unknown>, uuid = 'product-uuid') =>
		fakeRxDocument({ uuid, remoteId: '42', stockStatus: 'instock', payload }).document;

	it('returns the same wrapper for the same underlying document', () => {
		const document = makeDoc({ id: 42, name: 'Coffee' });

		expect(wrapEngineDocument('products', document)).toBe(wrapEngineDocument('products', document));
	});

	it('returns a different wrapper for a different underlying document', () => {
		const first = makeDoc({ id: 42, name: 'Coffee' });
		const second = makeDoc({ id: 43, name: 'Tea' }, 'other-uuid');

		expect(wrapEngineDocument('products', first)).not.toBe(wrapEngineDocument('products', second));
	});

	/** The staleness direction — the failure mode that would actually hurt. */
	it('never serves stale data, because a changed document is a new instance', () => {
		const before = makeDoc({ id: 42, name: 'Coffee' });
		const wrapperBefore = wrapEngineDocument<{ name?: string }>('products', before);
		expect(wrapperBefore.name).toBe('Coffee');

		const after = makeDoc({ id: 42, name: 'Decaf' });
		const wrapperAfter = wrapEngineDocument<{ name?: string }>('products', after);

		expect(wrapperAfter).not.toBe(wrapperBefore);
		expect(wrapperAfter.name).toBe('Decaf');
	});

	it('preserves identity for the unchanged rows of a re-emitted result set', () => {
		const a = makeDoc({ id: 1, name: 'A' }, 'a');
		const b = makeDoc({ id: 2, name: 'B' }, 'b');
		const c = makeDoc({ id: 3, name: 'C' }, 'c');

		const first = [a, b, c].map((doc) => wrapEngineDocument('products', doc));

		// Row b changed; RxDB hands back the very same instances for a and c.
		const bChanged = makeDoc({ id: 2, name: 'B2' }, 'b');
		const second = [a, bChanged, c].map((doc) => wrapEngineDocument('products', doc));

		expect(second[0]).toBe(first[0]);
		expect(second[2]).toBe(first[2]);
		expect(second[1]).not.toBe(first[1]);
	});

	it('keeps wrappers separate per legacy collection name', () => {
		const document = makeDoc({ id: 42, name: 'Coffee' });

		expect(wrapEngineDocument('products', document)).not.toBe(
			wrapEngineDocument('orders', document)
		);
		expect(wrapEngineDocument('products', document)).toBe(wrapEngineDocument('products', document));
	});

	it('still reads through to the underlying document when cached', () => {
		const document = makeDoc({ id: 42, name: 'Coffee' });

		wrapEngineDocument('products', document);
		const cached = wrapEngineDocument<{ name?: string }>('products', document);

		expect(cached.name).toBe('Coffee');
		expect('isInstanceOfRxDocument' in cached).toBe(true);
	});
});

describe('temporary-order isNew passthrough (ADR 0028 stage I interim scaffolding)', () => {
	it("passes an instance-level isNew marker through the wrapper's get and has traps", () => {
		const { document } = fakeRxDocument({ uuid: 'tmp-1', payload: { status: 'pos-open' } });
		Object.defineProperty(document, 'isNew', { get: () => true });

		const wrapped = wrapEngineDocument<{ isNew?: boolean }>('orders', document);

		expect(wrapped.isNew).toBe(true);
		expect('isNew' in wrapped).toBe(true);
	});

	it('reports isNew undefined (and absent) for ordinary engine documents', () => {
		const { document } = fakeRxDocument({ uuid: 'o-1', payload: { status: 'pos-open' } });

		const wrapped = wrapEngineDocument<{ isNew?: boolean }>('orders', document);

		expect(wrapped.isNew).toBeUndefined();
		expect('isNew' in wrapped).toBe(false);
	});
});
