import { BehaviorSubject } from 'rxjs';

import { observePaymentMethodHistory } from '../src/reads/payment-method-history';
import { observeProductMetaKeys } from '../src/reads/product-meta-keys';
import { residentEngine } from './helpers/resident-engine';

it.each([
	[
		'orders',
		observePaymentMethodHistory,
		[
			{
				payment_method: 'card',
				payment_method_title: 'Old card',
				meta_data: [
					{ key: '_wcpos_payment_method', value: 'cash' },
					{ key: '_wcpos_payment_method', value: 'gift' },
					null,
					{ key: 'other', value: 'ignored' },
					{ key: '_wcpos_payment_method', value: null },
				],
			},
			{ payment_method: 'legacy', meta_data: 'malformed' },
		],
		[
			{ payment_method: 'card', payment_method_title: 'Old card', indexMethods: ['cash', 'gift'] },
			{ payment_method: 'legacy', indexMethods: [] },
		],
		{ payment_method: 'new' },
		[{ payment_method: 'new', indexMethods: [] }],
	],
	[
		'products',
		observeProductMetaKeys,
		[
			{ meta_data: [{ key: '_size' }, { key: 'engraving' }, { key: '' }, null] },
			{ meta_data: [{ key: '_size' }] },
			{ meta_data: 'malformed' },
			{},
		],
		['_size', 'engraving'],
		{ meta_data: [{ key: 'new' }] },
		['new'],
	],
] as const)(
	'%s read clears on null and rebinds with distinct projected values',
	(name, observe, payloads, expected, next, nextExpected) => {
		const { engine, databases } = residentEngine();
		const rows = new BehaviorSubject(payloads.map((payload) => ({ payload })));
		const seen: unknown[] = [];
		const sub = observe(engine).subscribe((value: unknown) => seen.push(value));
		expect(seen).toEqual([[]]);
		databases.next({ collections: { [name]: { find: () => ({ $: rows }) } } });
		expect(seen).toEqual([[], expected]);
		rows.next(payloads.map((payload) => ({ payload, unrelated: 'write' })));
		expect(seen).toHaveLength(2);
		databases.next(null);
		expect(seen.at(-1)).toEqual([]);
		expect(rows.observed).toBe(false);
		databases.next({
			collections: { [name]: { find: () => ({ $: new BehaviorSubject([{ payload: next }]) }) } },
		});
		expect(seen.at(-1)).toEqual(nextExpected);
		sub.unsubscribe();
	}
);
