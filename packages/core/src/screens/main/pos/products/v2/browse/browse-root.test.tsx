/** @jest-environment jsdom */
import '@testing-library/jest-dom';
import * as React from 'react';

import { fireEvent, render, screen, within } from '@testing-library/react';
import { BehaviorSubject, of } from 'rxjs';

import { DealStagedContext } from '../deal-stack';
import { BrowseRootGrid } from './term-grid';
import { BrowseRootTable } from './term-table';

jest.mock('../../../../../../contexts/translations', () => ({
	useT: () => (key: string, vars?: { count?: number }) =>
		vars?.count !== undefined ? `${vars.count} ${key}` : key,
}));
jest.mock('../../../../contexts/ui-settings', () => ({
	useUISettings: () => ({ uiSettings: { gridColumns: 2 } }),
}));
jest.mock('@wcpos/query', () => ({
	useDocField: (doc: Record<string, unknown>, read: (value: Record<string, unknown>) => unknown) =>
		read(doc),
}));
// The stage itself is native motion; the root only reads which term is out on it.
jest.mock('../deal-stack', () => ({
	DealStagedContext: jest.requireActual('react').createContext(null),
}));
jest.mock('@wcpos/components/lib/device', () => ({ useIsPhone: () => false }));
// The term level's leaves (term-grid.tsx) are native motion and the till's furniture; only the
// root term set is on stage here.
jest.mock('@wcpos/components/breadcrumb', () => ({ Breadcrumb: () => null }));
jest.mock('../level-back', () => ({
	LevelBack: ({ children }: React.PropsWithChildren) => children,
}));
jest.mock('../grid/product-tile', () => ({ ProductTile: () => null }));
jest.mock('../grid/variable-product-tile', () => ({ VariableProductTile: () => null }));
jest.mock('../../../../../../query', () => ({ useGuardedExtendLimit: () => () => {} }));
jest.mock('../footer', () => ({
	ProductsFooter: ({ count, collectionName }: { count: number; collectionName: string }) => (
		<footer data-testid="products-footer" data-count={count} data-collection={collectionName} />
	),
}));
// The list renders every row it is handed, in order: the root's order is what is tested.
jest.mock('@wcpos/components/virtualized-list', () => ({
	Root: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
	List: ({
		data,
		renderItem,
	}: {
		data: unknown[];
		renderItem: (input: { item: unknown; index: number }) => React.ReactNode;
	}) => (
		<div>
			{data.map((item, index) => (
				<React.Fragment key={index}>{renderItem({ item, index })}</React.Fragment>
			))}
		</div>
	),
	Item: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
}));
// The leaf components pull in native-only modules; the root's structure is what is tested.
jest.mock('@wcpos/components/text', () => ({
	Text: ({ children }: React.PropsWithChildren) => <span>{children}</span>,
}));
jest.mock('@wcpos/components/vstack', () => ({
	VStack: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
}));
jest.mock('@wcpos/components/icon', () => ({
	Icon: ({ name }: { name: string }) => <span data-testid={`icon-${name}`} />,
}));
jest.mock('@wcpos/components/image', () => ({ Image: () => null }));
jest.mock('../../../../components/product/product-image-placeholder', () => ({
	PRODUCT_IMAGE_PLACEHOLDER: 'placeholder.png',
}));

const terms = [
	{ kind: 'term' as const, id: 1, name: 'Drinks', count: 12 },
	{ kind: 'term' as const, id: 2, name: 'Snacks', count: 4 },
	{ kind: 'term' as const, id: 3, name: 'Merch', count: 3 },
];

function buttonIds() {
	return within(screen.getByTestId('browse-root'))
		.getAllByRole('button')
		.map((node) => node.getAttribute('data-testid'));
}

it('the root grid shows All products first, then the terms in order, on the grid columns', () => {
	const onOpen = jest.fn();
	render(<BrowseRootGrid terms={terms} onOpen={onOpen} />);
	expect(buttonIds()).toEqual([
		'browse-all-products',
		'browse-term-1',
		'browse-term-2',
		'browse-term-3',
	]);
	// Two columns: All + Drinks, then Snacks + Merch.
	const snacksRow = screen.getByTestId('browse-term-2').parentElement!;
	expect(within(snacksRow).getAllByRole('button')).toHaveLength(2);
	expect(within(snacksRow).getByTestId('browse-term-3')).toBeTruthy();
	fireEvent.click(screen.getByTestId('browse-term-2'));
	expect(onOpen).toHaveBeenCalledWith(terms[1], expect.anything());
});

it('the root grid fills a short last row with spacers', () => {
	render(<BrowseRootGrid terms={terms.slice(0, 2)} onOpen={jest.fn()} />);
	const lastRow = screen.getByTestId('browse-term-2').parentElement!;
	expect(lastRow.children).toHaveLength(2);
	expect(within(lastRow).getAllByRole('button')).toHaveLength(1);
});

it('the root grid carries the till’s footer: the catalogue total, not the loaded window', () => {
	const { rerender } = render(<BrowseRootGrid terms={terms} onOpen={jest.fn()} />);
	expect(screen.queryByTestId('products-footer')).toBeNull();
	const result$ = new BehaviorSubject({ hits: [{}, {}, {}] });
	const binding = (total: number | null) =>
		({ total$: of(total), result$, active$: of(false), sync: jest.fn() }) as unknown as NonNullable<
			React.ComponentProps<typeof BrowseRootGrid>['binding']
		>;
	rerender(<BrowseRootGrid terms={terms} onOpen={jest.fn()} binding={binding(80)} />);
	expect(screen.getByTestId('products-footer').dataset).toMatchObject({
		count: '80',
		collection: 'products',
	});
	// Nothing vouches for a total: the loaded rows are the only number there is.
	rerender(<BrowseRootGrid terms={terms} onOpen={jest.fn()} binding={binding(null)} />);
	expect(screen.getByTestId('products-footer').dataset.count).toBe('3');
});

it('the root grid lifts the tile whose copy is out on the stage', () => {
	render(
		<DealStagedContext.Provider value={{ kind: 'term', term: terms[1] }}>
			<BrowseRootGrid terms={terms} onOpen={jest.fn()} />
		</DealStagedContext.Provider>
	);
	expect(screen.getByTestId('browse-term-2')).toHaveStyle({ opacity: 0 });
	expect(screen.getByTestId('browse-term-1')).not.toHaveStyle({ opacity: 0 });
});

it('the root table shows All products first, then the terms in order', () => {
	const onOpen = jest.fn();
	render(<BrowseRootTable terms={terms} onOpen={onOpen} />);
	expect(buttonIds()).toEqual([
		'browse-all-products',
		'browse-term-1',
		'browse-term-2',
		'browse-term-3',
	]);
	fireEvent.click(screen.getByTestId('browse-all-products'));
	expect(onOpen).toHaveBeenCalledWith({ kind: 'all' });
});
