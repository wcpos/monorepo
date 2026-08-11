import * as React from 'react';

import { render } from '@testing-library/react';

import { List, Root } from './virtualized-list.web';

type VirtualizerOptions = {
	count: number;
	getItemKey?: (index: number) => string | number;
	measureElement?: (element: Element, entry: unknown, instance: unknown) => number;
};

const mockUseVirtualizer = jest.fn((options: VirtualizerOptions) => ({
	getVirtualItems: () =>
		Array.from({ length: options.count }, (_, index) => ({
			index,
			key: options.getItemKey?.(index) ?? index,
			start: index * 50,
			size: 50,
			end: (index + 1) * 50,
			lane: 0,
		})),
	getTotalSize: () => options.count * 50,
	scrollToIndex: jest.fn(),
	scrollToOffset: jest.fn(),
	measureElement: jest.fn(),
}));

// Render every row without real measurement so jsdom (no layout) can exercise
// the list's keying/reconciliation logic.
jest.mock('@tanstack/react-virtual', () => ({
	useVirtualizer: (options: VirtualizerOptions) => mockUseVirtualizer(options),
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

	it('passes record identity to the virtualizer when data reorders', () => {
		const view = render(<ListFixture data={[{ id: 'a' }, { id: 'b' }]} />);
		let options = mockUseVirtualizer.mock.calls.at(-1)?.[0];

		expect(options?.getItemKey?.(0)).toBe('a');

		view.rerender(<ListFixture data={[{ id: 'b' }, { id: 'a' }]} />);
		options = mockUseVirtualizer.mock.calls.at(-1)?.[0];

		expect(options?.getItemKey?.(0)).toBe('b');
	});

	it('wires a hidden-safe measureElement into the virtualizer', () => {
		render(<ListFixture data={[{ id: 'a' }]} />);
		const options = mockUseVirtualizer.mock.calls.at(-1)?.[0];

		// jsdom has no layout, so every element reports offsetParent === null —
		// exactly the hidden-subtree case where the guard must return the cached
		// size instead of measuring a display:none row at 0px.
		const element = document.createElement('div');
		const instance = {
			indexFromElement: () => 0,
			measurementsCache: [{ size: 48 }],
		};

		expect(options?.measureElement?.(element, undefined, instance)).toBe(48);
	});
});
