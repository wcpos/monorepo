/** @jest-environment jsdom */
import * as React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';

import { TileGrid } from './tile-grid';

let mockColumns = 3;
let mockListProps: {
	onEndReached?: () => void;
	onEndReachedThreshold?: number;
	estimatedItemSize?: number;
};
jest.mock('../../../contexts/ui-settings', () => ({
	useUISettings: () => ({ uiSettings: { gridColumns: mockColumns } }),
}));
jest.mock('@wcpos/query', () => ({
	useDocField: (doc: { gridColumns: number }, read: (doc: { gridColumns: number }) => number) =>
		read(doc),
}));
jest.mock('react-native', () => ({
	View: ({ children, className }: React.PropsWithChildren<{ className?: string }>) => (
		<div className={className}>{children}</div>
	),
}));
// Render the rows the adapter supplies, with the list's key/empty/footer contract. The shared
// list's viewport and pagination mechanics have their own tests; here we test the stage wiring.
jest.mock('@wcpos/components/virtualized-list', () => ({
	Root: ({ children, testID }: React.PropsWithChildren<{ testID?: string }>) => (
		<div data-testid={testID}>{children}</div>
	),
	List: (props: {
		data: string[][];
		renderItem: (info: { item: string[]; index: number }) => React.ReactNode;
		keyExtractor?: (row: string[], index: number) => string;
		ListEmptyComponent?: React.ComponentType;
		ListFooterComponent?: React.ReactNode;
		onEndReached?: () => void;
		onEndReachedThreshold?: number;
		estimatedItemSize?: number;
	}) => {
		mockListProps = props;
		const Empty = props.ListEmptyComponent;
		return (
			<>
				{props.data.map((item, index) => (
					<React.Fragment key={props.keyExtractor?.(item, index) ?? index}>
						{props.renderItem({ item, index })}
					</React.Fragment>
				))}
				{props.data.length === 0 && Empty && <Empty />}
				{props.ListFooterComponent}
				<button data-testid="end-reached" onClick={props.onEndReached} />
			</>
		);
	},
	Item: ({ children }: React.PropsWithChildren) => <section data-testid="row">{children}</section>,
}));
const renderTile = (tile: string) => <span key={tile}>{tile}</span>;
const rows = () => screen.queryAllByTestId('row');
const contents = () => rows().map((row) => row.textContent);

beforeEach(() => {
	mockColumns = 3;
});

it('chunks tiles into rows of the grid-columns setting', () => {
	render(<TileGrid tiles={['a', 'b', 'c', 'd', 'e', 'f', 'g']} renderTile={renderTile} />);
	expect(contents()).toEqual(['abc', 'def', 'g']);
});

it('pads a short last row with empty tile frames, never a full row', () => {
	render(<TileGrid tiles={['a', 'b', 'c', 'd']} renderTile={renderTile} />);
	expect(rows()[0].querySelectorAll('.m-1.flex-1')).toHaveLength(0);
	expect(rows()[1].querySelectorAll('.m-1.flex-1')).toHaveLength(2);
	expect(rows()[1].firstElementChild?.className).toBe('flex-row');
	expect(rows()[1].firstElementChild?.children).toHaveLength(3);
});

it('re-chunks when the column setting moves', () => {
	const tiles = ['a', 'b', 'c', 'd', 'e'];
	const { rerender } = render(<TileGrid tiles={tiles} renderTile={renderTile} />);
	expect(contents()).toEqual(['abc', 'de']);
	mockColumns = 2;
	rerender(<TileGrid tiles={tiles} renderTile={renderTile} />);
	expect(contents()).toEqual(['ab', 'cd', 'e']);
});

it('keys rows by index unless a row key is given', () => {
	mockColumns = 2;
	const { rerender, unmount } = render(
		<TileGrid tiles={['a', 'b', 'c', 'd']} renderTile={renderTile} />
	);
	const first = rows()[0];
	rerender(<TileGrid tiles={['c', 'd', 'a', 'b']} renderTile={renderTile} />);
	expect(rows()[0]).toBe(first);
	expect(first.textContent).toBe('cd');
	unmount();
	const rowKey = (row: readonly string[]) => row[0];
	const keyed = render(
		<TileGrid tiles={['a', 'b', 'c', 'd']} renderTile={renderTile} rowKey={rowKey} />
	);
	const aRow = rows()[0];
	keyed.rerender(<TileGrid tiles={['c', 'd', 'a', 'b']} renderTile={renderTile} rowKey={rowKey} />);
	expect(rows()[1]).toBe(aRow);
	expect(aRow.textContent).toBe('ab');
});

it('draws the footer under the last row and the empty state with no tiles', () => {
	const footer = <footer data-testid="footer">Footer</footer>;
	const empty = () => <p data-testid="empty">Empty</p>;
	const { rerender } = render(
		<TileGrid
			tiles={['a']}
			renderTile={renderTile}
			footer={footer}
			empty={empty}
			testID="scroller"
		/>
	);
	expect(screen.queryByTestId('empty')).toBeNull();
	expect(rows()[0].compareDocumentPosition(screen.getByTestId('footer'))).toBe(
		Node.DOCUMENT_POSITION_FOLLOWING
	);
	expect(screen.getByTestId('scroller').contains(screen.getByTestId('footer'))).toBe(true);
	rerender(<TileGrid tiles={[]} renderTile={renderTile} footer={footer} empty={empty} />);
	expect(rows()).toHaveLength(0);
	expect(screen.getByTestId('empty')).toBeTruthy();
	expect(screen.getByTestId('footer')).toBeTruthy();
});

it('hands end-reached to the list at the stage threshold', () => {
	const onEndReached = jest.fn();
	render(<TileGrid tiles={['a']} renderTile={renderTile} onEndReached={onEndReached} />);
	expect(mockListProps.onEndReachedThreshold).toBe(0.1);
	expect(mockListProps.estimatedItemSize).toBe(200);
	fireEvent.click(screen.getByTestId('end-reached'));
	expect(onEndReached).toHaveBeenCalledTimes(1);
});
