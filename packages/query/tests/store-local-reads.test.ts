import { BehaviorSubject, Subject } from 'rxjs';

import {
	type LocalCollectionReset,
	observeActiveTemplates,
	observePrinterProfiles,
	observeTemplatePrinterOverrides,
} from '../src';

const reads = {
	observeTemplatePrinterOverrides,
	observePrinterProfiles,
	observeActiveTemplates,
} as const;

const cases = [
	['observeTemplatePrinterOverrides', 'template_printer_overrides', undefined],
	['observePrinterProfiles', 'printer_profiles', undefined],
	[
		'observeActiveTemplates',
		'templates',
		{
			selector: { type: 'closure', closure_store_id: 2 },
			sort: [{ menu_order: 'asc' }],
		},
	],
] as const;

// Removing reset following, plain-row projection, or the closure selector breaks these contracts.
it.each(cases)(
	'%s emits plain rows from the replacement, not the removed collection',
	(name, collectionName, query) => {
		expect(typeof reads[name]).toBe('function');
		const before = { id: 'before', status: 'publish' };
		const after = { id: 'after', status: 'publish' };
		const oldRows$ = new BehaviorSubject([{ toJSON: () => before }]);
		const newRows$ = new BehaviorSubject([{ toJSON: () => after }]);
		const find = jest.fn(() => ({ $: oldRows$ }));
		const replacementFind = jest.fn(() => ({ $: newRows$ }));
		const reset$ = new Subject<LocalCollectionReset>();
		const database = { collections: { [collectionName]: { find } }, reset$ };
		const seen: unknown[] = [];
		const subscription = reads[name](database, { type: 'closure', storeId: 2 }).subscribe((rows) =>
			seen.push(rows)
		);
		expect(seen).toEqual([[before]]);
		expect(find.mock.calls).toEqual([query ? [query] : []]);
		reset$.next({ name: collectionName, database, find: replacementFind });
		expect(seen).toEqual([[before], [after]]);
		expect(replacementFind.mock.calls).toEqual([query ? [query] : []]);
		oldRows$.next([]);
		expect(seen).toHaveLength(2);
		newRows$.next([]);
		expect(seen.at(-1)).toEqual([]);
		subscription.unsubscribe();
	}
);

it.each(cases)('%s emits an empty placeholder without a database', (name) => {
	expect(typeof reads[name]).toBe('function');
	for (const database of [null, undefined]) {
		const seen: unknown[] = [];
		reads[name](database, { type: 'receipt', storeId: 2 })
			.subscribe((rows) => seen.push(rows))
			.unsubscribe();
		expect(seen).toEqual([[]]);
	}
});

it('keeps published and virtual templates and leaves non-closure reads unscoped', () => {
	expect(typeof reads.observeActiveTemplates).toBe('function');
	const rows = [
		{ id: 'published', status: 'publish' },
		{ id: 'virtual', status: 'draft', is_virtual: true },
		{ id: 'draft', status: 'draft' },
	];
	const find = jest.fn(() => ({
		$: new BehaviorSubject(rows.map((row) => ({ toJSON: () => row }))),
	}));
	const seen: unknown[] = [];
	reads
		.observeActiveTemplates(
			{ collections: { templates: { find } } },
			{ type: 'receipt', storeId: 2 }
		)
		.subscribe((value) => seen.push(value))
		.unsubscribe();
	expect(find).toHaveBeenCalledWith({
		selector: { type: 'receipt' },
		sort: [{ menu_order: 'asc' }],
	});
	expect(seen).toEqual([[rows[0], rows[1]]]);
});
