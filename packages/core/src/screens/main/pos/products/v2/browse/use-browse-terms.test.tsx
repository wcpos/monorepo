/** @jest-environment jsdom */
import { act, renderHook } from '@testing-library/react';
import { BehaviorSubject } from 'rxjs';

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

const answer = (hits: Record<string, unknown>[]) => ({
	current: { hits: hits.map((payload) => ({ record: { payload } })) },
});
const binding = (hits: Record<string, unknown>[] | undefined) => ({
	resource: {
		valueRef$$: new BehaviorSubject<ReturnType<typeof answer> | undefined>(
			hits === undefined ? undefined : answer(hits)
		),
	},
});

describe('useBrowseCounts', () => {
	it("counts each source's root terms, and nothing for a source that has not answered", () => {
		const answers: Record<string, ReturnType<typeof binding>> = {
			'products/categories': binding([
				{ id: 1, name: 'Drinks', parent: 0, count: 12 },
				{ id: 2, name: 'Hot', parent: 1, count: 6 },
				{ id: 3, name: 'Food', parent: 0, count: 4 },
			]),
			'products/tags': binding(undefined),
			'products/brands': binding([]),
		};
		(useAllTermsBinding as jest.Mock).mockImplementation(
			(collection: string) => answers[collection]
		);
		(useProductsCarryingTermsBinding as jest.Mock).mockReturnValue(binding(undefined));
		(useUISettings as jest.Mock).mockReturnValue({ uiSettings: {} });
		(useDocField as jest.Mock).mockReturnValue([
			{ type: 'pill', id: 'stock_status', show: true },
			{
				type: 'quick',
				id: 'qf-1',
				label: 'Under 3',
				conditions: [{ field: 'price', value: { max: 3 } }],
			},
		]);
		const { result } = renderHook(() => useBrowseCounts());
		expect(result.current).toEqual({ categories: 2, tags: undefined, brands: 0, shortcuts: 1 });
	});
	// A POS-only store: every term is zero-count, kept only by the products that carry it.
	it('counts nothing for a source whose zero-count terms are still being looked for', () => {
		const answers: Record<string, ReturnType<typeof binding>> = {
			'products/categories': binding([
				{ id: 1, name: 'Drinks', parent: 0, count: 12 },
				{ id: 5, name: 'Counter', parent: 0, count: 0 },
			]),
			'products/tags': binding([]),
			'products/brands': binding([]),
		};
		(useAllTermsBinding as jest.Mock).mockImplementation(
			(collection: string) => answers[collection]
		);
		// Each binding is one object across renders, as the real hook's is.
		const pending = binding(undefined);
		const disabled = binding([]);
		(useProductsCarryingTermsBinding as jest.Mock).mockImplementation((_taxonomy, ids) =>
			ids.length > 0 ? pending : disabled
		);
		(useUISettings as jest.Mock).mockReturnValue({ uiSettings: {} });
		(useDocField as jest.Mock).mockReturnValue([]);
		const { result, rerender } = renderHook(() => useBrowseCounts());
		expect(result.current.categories).toBeUndefined();

		act(() => pending.resource.valueRef$$.next(answer([{ categories: [{ id: 5 }] }])));
		expect(result.current.categories).toBe(2);

		// A changed id set is a new read; the last answer holds while it is pending.
		const reread = binding(undefined);
		(useProductsCarryingTermsBinding as jest.Mock).mockImplementation((_taxonomy, ids) =>
			ids.length > 0 ? reread : disabled
		);
		rerender();
		expect(result.current.categories).toBe(2);
	});
});

describe('useBrowseTerms', () => {
	// The bindings each render asked for, once each (a render may run twice before it commits).
	const asked = (hook: unknown) => [
		...new Set((hook as jest.Mock).mock.calls.map((call) => JSON.stringify(call.slice(0, 2)))),
	];
	beforeEach(() => {
		(useAllTermsBinding as jest.Mock).mockReset().mockReturnValue(binding([]));
		(useProductsCarryingTermsBinding as jest.Mock).mockReset().mockReturnValue(binding([]));
		(useUISettings as jest.Mock).mockReturnValue({ uiSettings: {} });
		(useDocField as jest.Mock).mockReturnValue([]);
		(useT as jest.Mock).mockReturnValue((key: string) => key);
		(useCurrencyFormat as jest.Mock).mockReturnValue({ format: String });
	});
	it('reads only the active taxonomy', () => {
		renderHook(() => useBrowseTerms('tags'));
		expect(asked(useAllTermsBinding)).toEqual(['["products/tags",true]']);
		expect(asked(useProductsCarryingTermsBinding)).toEqual(['["tags",[]]']);
	});
	it('reads no taxonomy for the shortcuts', () => {
		renderHook(() => useBrowseTerms('shortcuts'));
		expect(asked(useAllTermsBinding)).toEqual(['["products/categories",false]']);
	});
});
