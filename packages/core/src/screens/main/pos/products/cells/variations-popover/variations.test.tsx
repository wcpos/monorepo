/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';
import { of } from 'rxjs';

import { QueryStateProvider, useQueryState } from '../../../../../../query';
import { VariationsPopover } from './index';
import { Variations } from './variations';

const mockVariationDocuments = [
	{
		id: 11,
		status: 'draft',
		attributes: [{ id: 1, name: 'Color', option: 'Red' }],
	},
	{
		id: 12,
		status: 'publish',
		attributes: [{ id: 1, name: 'Color', option: 'Blue' }],
	},
];
const mockUseCollectionBinding = jest.fn(
	(_collection: string, state: { filters: { status?: string } }) => {
		const hits = mockVariationDocuments
			.filter((document) => !state.filters.status || document.status === state.filters.status)
			.map((document) => ({ document }));
		return {
			resource: { value: { count: hits.length, hits } },
			active$: of(false),
		};
	}
);

jest.mock('../../../../../../query', () => {
	const actual = jest.requireActual('../../../../../../query');
	return {
		...actual,
		useCollectionBinding: (collection: string, state: { filters: { status?: string } }) =>
			mockUseCollectionBinding(collection, state),
	};
});
jest.mock('observable-hooks', () => ({
	useObservableEagerState: () => false,
	useObservableSuspense: (resource: { value: unknown }) => resource.value,
}));
jest.mock('@wcpos/query', () => ({
	useReplicationState: () => {
		throw new Error('legacy popover replication reached');
	},
}));
jest.mock('@wcpos/components/button', () => ({
	Button: ({ children, onPress }: { children: React.ReactNode; onPress?: () => void }) => (
		<button onClick={onPress}>{children}</button>
	),
	ButtonText: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));
jest.mock('@wcpos/components/hstack', () => ({
	HStack: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
jest.mock('@wcpos/components/icon', () => ({ Icon: () => null }));
jest.mock('@wcpos/components/text', () => ({
	Text: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));
jest.mock('@wcpos/components/vstack', () => ({
	VStack: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
jest.mock('@wcpos/components/error-boundary', () => ({
	ErrorBoundary: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('@wcpos/components/suspense', () => ({
	Suspense: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('./buttons', () => ({
	VariationButtons: ({
		attribute,
		onSelect,
		optionCounts,
	}: {
		attribute: { id: number; name: string; options: string[] };
		onSelect: (attribute: { id: number; name: string; option?: string }) => void;
		optionCounts: Record<string, number>;
	}) => (
		<>
			{attribute.options
				.filter((option) => optionCounts[option] > 0)
				.map((option) => (
					<button
						key={option}
						onClick={() => onSelect({ id: attribute.id, name: attribute.name, option })}
					>
						{`select-${option.toLowerCase()}`}
					</button>
				))}
			<button onClick={() => onSelect({ id: 1, name: 'Color' })}>clear-color</button>
		</>
	),
}));
jest.mock('./select', () => ({ VariationSelect: () => null }));
jest.mock('./stock-status', () => ({
	useVariationStock: () => ({ status: 'instock', quantity: null, sellable: true }),
	VariationStockBadge: () => null,
}));
jest.mock('../../../../../../contexts/translations', () => ({
	useT: () => (key: string) => key,
}));
jest.mock('../../../../hooks/use-currency-format', () => ({
	useCurrencyFormat: () => ({ format: (value: string) => value }),
}));
jest.mock('../../../../contexts/ui-settings', () => ({
	useUISettings: () => ({ uiSettings: { showOutOfStock$: false } }),
}));

function StateProbe() {
	const matches = useQueryState<'variations', import('../../../../../../query').VariationMatch[]>(
		(state) => state.filters.attributeMatches
	);
	return <div data-testid="popover-matches">{JSON.stringify(matches)}</div>;
}

describe('Variations popover query state', () => {
	it('does not show draft variations', () => {
		render(
			<VariationsPopover
				parent={
					{
						variations: [11, 12],
						attributes: [{ id: 1, name: 'Color', variation: true, options: ['Red', 'Blue'] }],
					} as never
				}
				addToCart={jest.fn()}
			/>
		);

		expect(screen.queryByText('select-red')).toBeNull();
		expect(screen.queryByText('select-blue')).not.toBeNull();
	});

	it('adds and removes an attribute match through the provider actions', () => {
		const Component = Variations as unknown as React.ComponentType<Record<string, unknown>>;
		const binding = {
			resource: {
				value: {
					count: 2,
					hits: [
						{ document: { id: 11, attributes: [{ id: 1, name: 'Color', option: 'Red' }] } },
						{ document: { id: 12, attributes: [{ id: 1, name: 'Color', option: 'Blue' }] } },
					],
				},
			},
			active$: of(false),
		};
		render(
			<QueryStateProvider
				collection="variations"
				initialPageSize={10}
				initialSort={{ field: 'name', direction: 'asc' }}
			>
				<Component
					binding={binding}
					parent={{
						attributes: [{ id: 1, name: 'Color', variation: true, options: ['Red', 'Blue'] }],
					}}
					addToCart={jest.fn()}
				/>
				<StateProbe />
			</QueryStateProvider>
		);

		fireEvent.click(screen.getByText('select-red'));
		expect(screen.getByTestId('popover-matches').textContent).toContain('"option":"Red"');

		fireEvent.click(screen.getByText('clear-color'));
		expect(screen.getByTestId('popover-matches').textContent).toBe('[]');
	});
});
