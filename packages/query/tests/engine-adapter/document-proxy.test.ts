import { BehaviorSubject } from 'rxjs';

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
import type { Observable } from 'rxjs';
import type { RxDocument } from 'rxdb';

type LegacyProxy = Record<string, unknown> & {
	uuid: string;
	id: number;
	name: string;
	name$: Observable<unknown>;
	toJSON(): Record<string, unknown>;
	toMutableJSON(): Record<string, unknown>;
	getLatest(): LegacyProxy;
};

function fakeRxDocument(initial: EngineDocument) {
	const state = new BehaviorSubject(initial);
	let latest = initial;
	state.subscribe((document) => {
		latest = document;
	});
	const collection = { name: 'products' };
	const makeDocument = (document: EngineDocument): RxDocument<EngineDocument> =>
		({
			...document,
			$: state.asObservable(),
			collection,
			getLatest: () => makeDocument(latest),
			toJSON: () => document,
		}) as unknown as RxDocument<EngineDocument>;
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
			id: 'product-uuid',
			wooProductId: 42,
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
			id: 'product-uuid',
			wooProductId: 42,
			payload: { name: 'Coffee' },
		});
		const proxy = wrapEngineDocument('products', source.document) as LegacyProxy;
		const observer = jest.fn();
		const subscription = proxy.name$.subscribe(observer);

		source.state.next({
			id: 'product-uuid',
			wooProductId: 42,
			payload: { name: 'Tea' },
		});
		source.state.next({
			id: 'product-uuid',
			wooProductId: 42,
			payload: { name: 'Tea' },
		});

		expect(observer).toHaveBeenCalledTimes(2);
		expect(observer).toHaveBeenNthCalledWith(1, 'Coffee');
		expect(observer).toHaveBeenNthCalledWith(2, 'Tea');
		subscription.unsubscribe();
	});

	it('returns flattened legacy snapshots and deep-clones the mutable snapshot', () => {
		const source = fakeRxDocument({
			id: 'product-uuid',
			wooProductId: 42,
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

	it('wraps the latest underlying document', () => {
		const source = fakeRxDocument({
			id: 'product-uuid',
			wooProductId: 42,
			payload: { name: 'Coffee' },
		});
		const proxy = wrapEngineDocument('products', source.document) as LegacyProxy;
		source.state.next({
			id: 'product-uuid',
			wooProductId: 42,
			payload: { name: 'Tea' },
		});

		expect(proxy.getLatest()).not.toBe(proxy);
		expect(proxy.getLatest().name).toBe('Tea');
	});

	it.each(['patch', 'incrementalPatch', 'incrementalModify', 'remove', 'update'])(
		'throws the named read-only error for %s',
		(method) => {
			const source = fakeRxDocument({ id: 'product-uuid', payload: {} });
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
				id: `${collection}:uuid`,
				payload: {},
			};
			const expected = new Map<string, unknown>();
			Object.values(fields).forEach((field) => {
				if (field.kind === 'computed') {
					return;
				}
				const value =
					field.legacy === 'uuid'
						? `${collection}:uuid`
						: field.legacy === 'id'
							? 101
							: `${collection}:${field.legacy}`;
				setPath(fixture, field.readEnginePath ?? field.enginePath, value);
				expected.set(field.legacy, value);
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
				id: 'order-1',
				payload: {
					total: '12.345',
					meta_data: [{ key: '_pos_user', value: '7' }],
				},
			}).document
		);
		const coupon = wrapEngineDocument(
			'coupons',
			fakeRxDocument({
				id: 'coupon-1',
				payload: { status: 'publish', date_expires_gmt: '2999-01-01T00:00:00' },
			}).document
		);
		const product = wrapEngineDocument(
			'products',
			fakeRxDocument({ id: 'product-1', payload: { price: '1.004' } }).document
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
			id: 'product-uuid',
			wooProductId: 42,
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
