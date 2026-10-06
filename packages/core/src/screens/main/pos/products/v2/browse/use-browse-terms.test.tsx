/** @jest-environment jsdom */
import { act, renderHook } from '@testing-library/react';
import { BehaviorSubject, Subject } from 'rxjs';

import { useDocField } from '@wcpos/query';

import { useAllTermsBinding, useProductsCarryingTermsBinding } from '../../../../../../query';
import { useT } from '../../../../../../contexts/translations';
import { useUISettings } from '../../../../contexts/ui-settings';
import { useCurrencyFormat } from '../../../../hooks/use-currency-format';
import {
	projectShortcuts,
	projectTerms,
	useBrowseCounts,
	useBrowseTerms,
} from './use-browse-terms';

import type { BrowseBy, BrowseTerm } from './browse-source';

// The projections are pure; the hooks they sit beside are mocked out of the import graph.
jest.mock('uuid', () => ({ v4: () => 'quick-filter-id' }));
jest.mock('@wcpos/query', () => ({ useDocField: jest.fn() }));
jest.mock('../../../../../../query', () => ({
	useAllTermsBinding: jest.fn(),
	useProductsCarryingTermsBinding: jest.fn(),
}));
jest.mock('../../../../../../contexts/translations', () => ({ useT: jest.fn() }));
jest.mock('../../../../contexts/ui-settings', () => ({ useUISettings: jest.fn() }));
jest.mock('../../../../hooks/use-currency-format', () => ({ useCurrencyFormat: jest.fn() }));

const rec = (payload: Record<string, unknown>) => ({ payload });
/** The products UI settings each `useDocField` selector reads. */
const settings = (value: Record<string, unknown>) =>
	(useDocField as jest.Mock).mockImplementation(
		(_doc: unknown, select: (settings: Record<string, unknown>) => unknown) => select(value)
	);
// The existence read's answer when nothing is lifted.
const NONE_CARRIED = new Set<number>();

describe('projectTerms', () => {
	const records = [
		rec({
			id: 1,
			name: 'Drinks',
			parent: 0,
			menu_order: 1,
			count: 12,
			image: { src: 'https://x/d.jpg' },
			display: 'both',
		}),
		rec({ id: 2, name: 'Hot', parent: 1, menu_order: 1, count: 6 }),
		rec({ id: 3, name: 'Cold', parent: 1, menu_order: 2, count: 6, image: null }),
		rec({ id: 4, name: 'Empty', parent: 0, count: 0 }),
	];
	it('projects a hierarchical source into roots, children and id sets', () => {
		const terms = projectTerms(records as never, 'categories', NONE_CARRIED);
		expect(terms.rootsOf().map((t) => t.kind === 'term' && t.name)).toEqual(['Drinks']);
		const drinks = terms.rootsOf()[0];
		expect(terms.childrenOf(drinks).map((t) => t.kind === 'term' && t.name)).toEqual([
			'Hot',
			'Cold',
		]);
		expect(terms.idsFor(drinks)).toEqual([1, 2, 3]);
		expect(drinks.kind === 'term' && drinks.imageSrc).toBe('https://x/d.jpg');
		const cold = terms.childrenOf(drinks)[1];
		expect(cold.kind === 'term' && cold.imageSrc).toBeUndefined();
	});
	it('projects a flat source by name with no children', () => {
		const terms = projectTerms(
			[rec({ id: 9, name: 'Vegan', count: 2 }), rec({ id: 8, name: 'Decaf', count: 1 })] as never,
			'tags',
			NONE_CARRIED
		);
		expect(terms.rootsOf().map((t) => t.kind === 'term' && t.name)).toEqual(['Decaf', 'Vegan']);
		expect(terms.childrenOf(terms.rootsOf()[0])).toEqual([]);
		expect(terms.idsFor(terms.rootsOf()[0])).toEqual([8]);
	});
	it('keeps a zero-count term a synced product carries', () => {
		const terms = projectTerms(records as never, 'categories', new Set([4]));
		expect(terms.rootsOf().map((t) => t.kind === 'term' && t.name)).toEqual(['Empty', 'Drinks']);
		expect(terms.all?.map((t) => t.kind === 'term' && t.name)).toContain('Empty');
	});
	it('has no terms until the collection has answered', () => {
		expect(projectTerms(undefined, 'categories', NONE_CARRIED).all).toBeUndefined();
		expect(projectTerms([], 'categories', NONE_CARRIED).all).toEqual([]);
	});
	it('has no terms while the existence read of its zero-count terms is pending', () => {
		const terms = projectTerms(records as never, 'categories', undefined);
		expect(terms.all).toBeUndefined();
		expect(terms.rootsOf()).toEqual([]);
	});
});

describe('projectShortcuts', () => {
	it('turns the stored quick filters into shortcut terms in order, described', () => {
		const items = [
			{ type: 'pill', id: 'stock_status', show: true },
			{
				type: 'quick',
				id: 'qf-2',
				label: 'Breakfast',
				conditions: [{ field: 'categories', value: [3, 4] }],
			},
			{
				type: 'quick',
				id: 'qf-1',
				label: 'Under 3',
				conditions: [{ field: 'price', value: { max: 3 } }],
			},
		];
		const terms = projectShortcuts(items as never, (qf) => `desc:${qf.label}`);
		expect(
			terms.rootsOf().map((t) => t.kind === 'shortcut' && [t.id, t.name, t.description])
		).toEqual([
			['qf-2', 'Breakfast', 'desc:Breakfast'],
			['qf-1', 'Under 3', 'desc:Under 3'],
		]);
		expect(terms.quickFilterFor(terms.rootsOf()[0])?.label).toBe('Breakfast');
		expect(terms.idsFor(terms.rootsOf()[0])).toEqual([]);
	});
});

type Payload = Record<string, unknown>;
type Result = { hits: { record: { payload: Payload } }[] };
const result = (payloads: Payload[]): Result => ({
	hits: payloads.map((payload) => ({ record: { payload } })),
});

/**
 * One hook's binding as the real one behaves: a new `result$` per compiled query that answers
 * only when it emits (a disabled read answers empty on subscribe), beside ONE resource whose
 * `valueRef$$` keeps the last answer of whichever query emitted (ObservableResource.reload) —
 * the stale value the hook must not read. Its `pending$` is the hook's one demand flag, settled
 * (false) unless a test holds a refresh in flight.
 */
function fakeBinding() {
	const reads = new Map<string, Subject<Result>>();
	const valueRef$$ = new BehaviorSubject<{ current: Result } | undefined>(undefined);
	const pending$ = new BehaviorSubject(false);
	return {
		read(key: string, answered?: Result) {
			let result$ = reads.get(key);
			if (!result$) {
				result$ = answered ? new BehaviorSubject(answered) : new Subject<Result>();
				result$.subscribe((current) => valueRef$$.next({ current }));
				reads.set(key, result$);
			}
			return { result$, pending$, resource: { valueRef$$ } };
		},
		emit(key: string, payloads: Payload[]) {
			act(() => reads.get(key)!.next(result(payloads)));
		},
		pend(pending: boolean) {
			act(() => pending$.next(pending));
		},
	};
}

/** The products read beside a terms binding: disabled (answered empty) with no ids. */
function fakeCarrying() {
	const fake = fakeBinding();
	const keyOf = (taxonomy: string, ids: readonly number[]) =>
		`${taxonomy}:${[...ids].sort((a, b) => a - b).join(',')}`;
	(useProductsCarryingTermsBinding as jest.Mock).mockImplementation(
		(taxonomy: string, ids: readonly number[]) =>
			fake.read(keyOf(taxonomy, ids), ids.length === 0 ? result([]) : undefined)
	);
	return {
		emit: (taxonomy: string, ids: number[], payloads: Payload[]) =>
			fake.emit(keyOf(taxonomy, ids), payloads),
	};
}

describe('useBrowseCounts', () => {
	// One terms binding per source, as the dialog's three hooks hold.
	let terms: Record<string, ReturnType<typeof fakeBinding>>;
	beforeEach(() => {
		terms = {
			'products/categories': fakeBinding(),
			'products/tags': fakeBinding(),
			'products/brands': fakeBinding(),
		};
		(useAllTermsBinding as jest.Mock).mockImplementation((collection: string) =>
			terms[collection].read(collection)
		);
		(useUISettings as jest.Mock).mockReturnValue({ uiSettings: {} });
		settings({ filterBar: [] });
	});
	it("counts each source's root terms, and nothing for a source that has not answered", () => {
		fakeCarrying();
		settings({
			filterBar: [
				{ type: 'pill', id: 'stock_status', show: true },
				{
					type: 'quick',
					id: 'qf-1',
					label: 'Under 3',
					conditions: [{ field: 'price', value: { max: 3 } }],
				},
			],
		});
		const { result: counts } = renderHook(() => useBrowseCounts());
		terms['products/categories'].emit('products/categories', [
			{ id: 1, name: 'Drinks', parent: 0, count: 12 },
			{ id: 2, name: 'Hot', parent: 1, count: 6 },
			{ id: 3, name: 'Food', parent: 0, count: 4 },
		]);
		terms['products/brands'].emit('products/brands', []);
		expect(counts.current).toEqual({ categories: 2, tags: undefined, brands: 0, shortcuts: 1 });
	});
	// Opening the dialog pulls nothing it holds: thousands of tags, or a brands route that 404s
	// before WooCommerce 9.4, must not be fetched on a settings tap (an empty source is pulled
	// once by the binding itself — see the query bindings' tests).
	it('reads every source from resident terms only, and asks the stage baseline of the products', () => {
		(useAllTermsBinding as jest.Mock).mockClear();
		fakeCarrying();
		(useProductsCarryingTermsBinding as jest.Mock).mockClear();
		settings({ filterBar: [], showOutOfStock: true });
		renderHook(() => useBrowseCounts());
		const termCalls = (useAllTermsBinding as jest.Mock).mock.calls;
		expect(new Set(termCalls.map((call) => JSON.stringify(call)))).toEqual(
			new Set(
				['products/categories', 'products/tags', 'products/brands'].map((collection) =>
					JSON.stringify([collection, true, { residentsOnly: true }])
				)
			)
		);
		expect(
			(useProductsCarryingTermsBinding as jest.Mock).mock.calls.every(
				(call) => call[2]?.showOutOfStock === true
			)
		).toBe(true);
	});
	// A cold collection's local read answers empty at once; its refresh has not landed yet.
	it('counts nothing for a cold source while its refresh is pending, then its answer', () => {
		fakeCarrying();
		terms['products/categories'].pend(true);
		const { result: counts } = renderHook(() => useBrowseCounts());
		terms['products/categories'].emit('products/categories', []);
		expect(counts.current.categories).toBeUndefined();

		// Settled — met, or failed offline — an empty answer is one.
		terms['products/categories'].pend(false);
		expect(counts.current.categories).toBe(0);
	});
	it('keeps a warm source counted while a refresh is pending', () => {
		fakeCarrying();
		const { result: counts } = renderHook(() => useBrowseCounts());
		terms['products/categories'].emit('products/categories', [
			{ id: 1, name: 'Drinks', parent: 0, count: 12 },
		]);
		terms['products/categories'].pend(true);
		expect(counts.current.categories).toBe(1);
	});
	// A POS-only store: every term is zero-count, kept only by the products that carry it. The
	// products read starts disabled (no terms yet) and answers empty — that answer is not the
	// zero-count terms' answer.
	it('counts nothing for a source whose zero-count terms are still being looked for', () => {
		const carrying = fakeCarrying();
		const { result: counts } = renderHook(() => useBrowseCounts());
		terms['products/categories'].emit('products/categories', [
			{ id: 1, name: 'Drinks', parent: 0, count: 12 },
			{ id: 5, name: 'Counter', parent: 0, count: 0 },
		]);
		expect(counts.current.categories).toBeUndefined();

		carrying.emit('categories', [5], [{ categories: [{ id: 5 }] }]);
		expect(counts.current.categories).toBe(2);

		// A changed id set is a new read, pending until it answers: the last answer is for other
		// ids, and says nothing about Kiosk.
		terms['products/categories'].emit('products/categories', [
			{ id: 1, name: 'Drinks', parent: 0, count: 12 },
			{ id: 5, name: 'Counter', parent: 0, count: 0 },
			{ id: 6, name: 'Kiosk', parent: 0, count: 0 },
		]);
		expect(counts.current.categories).toBeUndefined();
		carrying.emit('categories', [5, 6], [{ categories: [{ id: 5 }] }, { categories: [{ id: 6 }] }]);
		expect(counts.current.categories).toBe(3);
	});
});

describe('useBrowseTerms', () => {
	// The bindings each render asked for, once each (a render may run twice before it commits).
	const asked = (hook: unknown) => [
		...new Set((hook as jest.Mock).mock.calls.map((call) => JSON.stringify(call.slice(0, 2)))),
	];
	// One terms binding for the stage, re-pointed when its source changes.
	let terms: ReturnType<typeof fakeBinding>;
	beforeEach(() => {
		(useAllTermsBinding as jest.Mock).mockReset();
		(useProductsCarryingTermsBinding as jest.Mock).mockReset();
		terms = fakeBinding();
		(useAllTermsBinding as jest.Mock).mockImplementation((collection: string, enabled: boolean) =>
			terms.read(`${collection}:${enabled}`, enabled ? undefined : result([]))
		);
		fakeCarrying();
		(useUISettings as jest.Mock).mockReturnValue({ uiSettings: {} });
		settings({ filterBar: [] });
		(useT as jest.Mock).mockReturnValue((key: string) => key);
		(useCurrencyFormat as jest.Mock).mockReturnValue({ format: String });
	});
	it('reads only the active taxonomy', () => {
		renderHook(() => useBrowseTerms('tags'));
		expect(asked(useAllTermsBinding)).toEqual(['["products/tags",true]']);
		expect(asked(useProductsCarryingTermsBinding)).toEqual(['["tags",[]]']);
	});
	it("fetches the stage's terms, and lifts a zero-count term only inside the stock baseline", () => {
		renderHook(() => useBrowseTerms('tags'));
		expect((useAllTermsBinding as jest.Mock).mock.calls.at(-1)?.[2]).toEqual({
			residentsOnly: false,
		});
		expect((useProductsCarryingTermsBinding as jest.Mock).mock.calls.at(-1)?.[2]).toEqual({
			showOutOfStock: false,
		});

		settings({ filterBar: [], showOutOfStock: true });
		renderHook(() => useBrowseTerms('tags'));
		expect((useProductsCarryingTermsBinding as jest.Mock).mock.calls.at(-1)?.[2]).toEqual({
			showOutOfStock: true,
		});
	});
	it('reads no taxonomy for the shortcuts', () => {
		renderHook(() => useBrowseTerms('shortcuts'));
		expect(asked(useAllTermsBinding)).toEqual(['["products/categories",false]']);
	});
	// The open term's count drops to zero beside another zero-count term: the existence read for
	// the new id set has not answered, and the last one never asked about this term — served as
	// known, the term would vanish, and an open path on it would read as deleted.
	it('is unanswered while a term that has just dropped to zero count is looked for, then keeps it if carried', () => {
		const carrying = fakeCarrying();
		const { result: browse } = renderHook(() => useBrowseTerms('categories'));
		terms.emit('products/categories:true', [
			{ id: 1, name: 'Drinks', parent: 0, count: 12 },
			{ id: 5, name: 'Counter', parent: 0, count: 0 },
		]);
		carrying.emit('categories', [5], [{ categories: [{ id: 5 }] }]);
		expect(browse.current.all?.map((term) => term.kind === 'term' && term.id)).toEqual([5, 1]);

		terms.emit('products/categories:true', [
			{ id: 1, name: 'Drinks', parent: 0, count: 0 },
			{ id: 5, name: 'Counter', parent: 0, count: 0 },
		]);
		expect(browse.current.all).toBeUndefined();
		carrying.emit('categories', [1, 5], [{ categories: [{ id: 1 }] }, { categories: [{ id: 5 }] }]);
		expect(
			browse.current.all
				?.map((term) => term.kind === 'term' && term.id)
				.sort((a, b) => Number(a) - Number(b))
		).toEqual([1, 5]);
	});

	it("has no terms after a source switch until the new source's own query answers", () => {
		const names = (all: BrowseTerm[] | undefined) =>
			all?.map((term) => term.kind === 'term' && term.name);
		const { result: browse, rerender } = renderHook(({ source }) => useBrowseTerms(source), {
			initialProps: { source: 'categories' as BrowseBy },
		});
		terms.emit('products/categories:true', [{ id: 1, name: 'Drinks', parent: 0, count: 12 }]);
		expect(names(browse.current.all)).toEqual(['Drinks']);

		rerender({ source: 'tags' });
		expect(browse.current.all).toBeUndefined();
		terms.emit('products/tags:true', [{ id: 9, name: 'Vegan', count: 2 }]);
		expect(names(browse.current.all)).toEqual(['Vegan']);
	});
});
