import * as React from 'react';

import { render } from '@testing-library/react';

import { List, Root } from './virtualized-list.web';

// Render every row without real measurement so jsdom (no layout) can exercise
// the list's keying/reconciliation logic.
jest.mock('@tanstack/react-virtual', () => ({
	useVirtualizer: (options: { count: number }) => ({
		getVirtualItems: () =>
			Array.from({ length: options.count }, (_, index) => ({
				index,
				key: index,
				start: index * 50,
				size: 50,
				end: (index + 1) * 50,
				lane: 0,
			})),
		getTotalSize: () => options.count * 50,
		scrollToIndex: jest.fn(),
		scrollToOffset: jest.fn(),
		measureElement: jest.fn(),
	}),
}));

type Item = { id: string };

function ListFixture({ data, extraData }: { data: Item[]; extraData?: Record<string, unknown> }) {
	return (
		<Root>
			<List<Item>
				data={data}
				keyExtractor={(item) => item.id}
				estimatedItemSize={50}
				extraData={extraData}
				renderItem={({ item }) => <div data-testid={`row-${item.id}`}>{item.id}</div>}
			/>
		</Root>
	);
}

describe('VirtualizedList (web)', () => {
	it('does not remount rows when extraData content changes', () => {
		const data = [{ id: 'a' }, { id: 'b' }];
		const view = render(<ListFixture data={data} extraData={{ selected: 'a' }} />);
		const rowA = view.getByTestId('row-a');
		const rowB = view.getByTestId('row-b');

		// A selection toggle produces new extraData content. Rows must re-render
		// in place, not be torn down and recreated.
		view.rerender(<ListFixture data={data} extraData={{ selected: 'b' }} />);

		expect(view.getByTestId('row-a')).toBe(rowA);
		expect(view.getByTestId('row-b')).toBe(rowB);
	});

	it('keeps row identity with the record, not the position, when data reorders', () => {
		const view = render(<ListFixture data={[{ id: 'a' }, { id: 'b' }]} />);
		const rowB = view.getByTestId('row-b');

		// A sort flip moves record b to position 0; with keyExtractor identity the
		// existing DOM node must move with it rather than being remounted.
		view.rerender(<ListFixture data={[{ id: 'b' }, { id: 'a' }]} />);

		expect(view.getByTestId('row-b')).toBe(rowB);
	});
});
