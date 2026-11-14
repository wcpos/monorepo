import * as React from 'react';

import { act, render } from '@testing-library/react';

import { List, Root, Item as WebItem } from './virtualized-list.web';

import type { Item as NativeItem } from './virtualized-list';

// Callers get Item's type from the native module (index.ts), which takes children only; the
// web Item never reads the item/index its own signature names, so type it as callers see it.
const VirtualizedItem = WebItem as unknown as typeof NativeItem;

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

	// POS products (pos/products/index.tsx) wraps every row in an Item, and the inline variable
	// row (components/product/variable-product-row) brings its own: two absolutely positioned
	// boxes per row. The virtualizer measured the outer one, empty and 0 px tall, so every later
	// row started where the variable row did, and the inner box was translated twice
	// (merchant report 2026-11-10: two variable products drawn in one row slot).
	it('measures one box per row, at its own offset, when a row brings its own Item', async () => {
		mockUseVirtualizer.mockClear();
		const view = render(
			<Root>
				<List<Item>
					data={[{ id: 'a' }, { id: 'b' }]}
					keyExtractor={(item) => item.id}
					estimatedItemSize={50}
					renderItem={({ item }) => (
						<VirtualizedItem>
							<VirtualizedItem>
								<div data-testid={`row-${item.id}`}>{item.id}</div>
							</VirtualizedItem>
						</VirtualizedItem>
					)}
				/>
			</Root>
		);
		await act(async () => {
			await Promise.resolve();
		});

		// One positioned, measured box per row, never one inside another.
		expect(view.container.querySelectorAll('[data-index]')).toHaveLength(2);
		expect(view.container.querySelector('[data-index] [data-index]')).toBeNull();

		// Each row's content sits at its own row's offset (the mock spaces rows 50 px apart).
		const offsetOf = (testId: string) => {
			let total = 0;
			let node: HTMLElement | null = view.getByTestId(testId);
			while (node) {
				if (node.hasAttribute('data-index')) {
					total += Number(/translateY\((-?[\d.]+)px\)/.exec(node.style.transform)?.[1] ?? 0);
				}
				node = node.parentElement;
			}
			return total;
		};
		expect([offsetOf('row-a'), offsetOf('row-b')]).toEqual([0, 50]);

		// The virtualizer is handed each row's box exactly once.
		const measured = mockUseVirtualizer.mock.results.flatMap((result) =>
			(result.value.measureElement as jest.Mock).mock.calls.map(([node]) =>
				(node as Element).getAttribute('data-index')
			)
		);
		expect(measured.sort()).toEqual(['0', '1']);
	});

	it('still measures the rows of a list drawn inside a row', () => {
		const view = render(
			<Root>
				<List<Item>
					data={[{ id: 'outer' }]}
					keyExtractor={(item) => item.id}
					estimatedItemSize={50}
					renderItem={() => (
						<VirtualizedItem>
							<Root>
								<List<Item>
									data={[{ id: 'x' }, { id: 'y' }]}
									keyExtractor={(item) => item.id}
									estimatedItemSize={50}
									renderItem={({ item }) => (
										<VirtualizedItem>
											<div data-testid={`inner-${item.id}`}>{item.id}</div>
										</VirtualizedItem>
									)}
								/>
							</Root>
						</VirtualizedItem>
					)}
				/>
			</Root>
		);
		// The outer row's box, and one box per inner row.
		expect(view.container.querySelectorAll('[data-index]')).toHaveLength(3);
		expect(view.getByTestId('inner-y').parentElement?.getAttribute('data-index')).toBe('1');
	});
});
