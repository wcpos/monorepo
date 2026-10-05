import { projectShortcuts, projectTerms } from './use-browse-terms';

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
		const terms = projectTerms(records as never, 'categories');
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
			'tags'
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
		expect(projectTerms(undefined, 'categories').all).toBeUndefined();
		expect(projectTerms([], 'categories').all).toEqual([]);
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
