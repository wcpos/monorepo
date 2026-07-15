/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';

import { useQueryState, useQueryStateActions } from '../../../../../query';
import { VariationRowProvider } from './context';
import { Variations } from './variations';

jest.mock('../../../../../query', () => {
	const actual = jest.requireActual('../../../../../query');
	return {
		...actual,
		useCollectionBinding: () => ({ resource: {}, active$: {}, total$: {}, sync: jest.fn() }),
	};
});
jest.mock('./variations/filters', () => ({ VariationsFilterBar: () => null }));
jest.mock('./variations/table', () => ({ VariationsTable: () => null }));
jest.mock('@wcpos/components/error-boundary', () => ({
	ErrorBoundary: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('@wcpos/components/suspense', () => ({
	Suspense: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('@wcpos/components/vstack', () => ({
	VStack: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

function RowProbe({ name }: { name: string }) {
	const matches = useQueryState<'variations', import('../../../../../query').VariationMatch[]>(
		(state) => state.filters.attributeMatches
	);
	const { setFilter } = useQueryStateActions<'variations'>();

	return (
		<div>
			<button
				data-testid={`select-${name}`}
				onClick={() => setFilter('attributeMatches', [{ id: 1, name: 'Color', option: name }])}
			/>
			<div data-testid={`matches-${name}`}>{JSON.stringify(matches)}</div>
		</div>
	);
}

describe('VariationRowProvider', () => {
	it('owns isolated variations query state for every variable-product row', () => {
		render(
			<>
				<VariationRowProvider row={{ id: 'red-row' }}>
					<RowProbe name="Red" />
				</VariationRowProvider>
				<VariationRowProvider row={{ id: 'blue-row' }}>
					<RowProbe name="Blue" />
				</VariationRowProvider>
			</>
		);

		fireEvent.click(screen.getByTestId('select-Red'));

		expect(screen.getByTestId('matches-Red').textContent).toContain('"option":"Red"');
		expect(screen.getByTestId('matches-Blue').textContent).toBe('[]');
	});

	it('clears a row filter when its collapsed variations table unmounts', () => {
		const row = {
			id: 'red-row',
			original: { document: { variations: [11, 12] } },
		} as never;
		const { rerender } = render(
			<VariationRowProvider row={row}>
				<RowProbe name="Red" />
				<Variations row={row} />
			</VariationRowProvider>
		);
		fireEvent.click(screen.getByTestId('select-Red'));
		expect(screen.getByTestId('matches-Red').textContent).toContain('"option":"Red"');

		rerender(
			<VariationRowProvider row={row}>
				<RowProbe name="Red" />
			</VariationRowProvider>
		);

		expect(screen.getByTestId('matches-Red').textContent).toBe('[]');
	});
});
