/**
 * Regression pin for monorepo#3395: FlashList can hand the native adapter an index past the
 * end of a `data` that just shrank (a search keystroke on the phone products grid, run
 * 42396589218), so the item is undefined. The caller's `renderItem` and `keyExtractor` read
 * the row and threw, and the grid fell to its error banner. The adapter must render nothing
 * and key the slot by index, never calling the caller with an undefined item.
 */
import * as React from 'react';
import { Text } from 'react-native';

import { render } from '@testing-library/react';

import { List } from './virtualized-list';

type Captured = {
	renderItem: (info: { item: unknown; index: number }) => React.ReactElement | null;
	keyExtractor: ((item: unknown, index: number) => string) | undefined;
};

let mockCaptured: Captured;

// Capture the props the native list receives instead of laying anything out.
jest.mock('@shopify/flash-list', () => ({
	FlashList: (props: Captured) => {
		mockCaptured = props;
		return null;
	},
}));

type Row = { id: string }[];

function mountList(keyExtractor?: (row: Row, index: number) => string) {
	const renderItem = jest.fn(({ item }: { item: Row }) => <Text>{`row-${item[0].id}`}</Text>);
	render(
		<List<Row>
			data={[[{ id: 'a' }]]}
			renderItem={renderItem}
			keyExtractor={keyExtractor}
			estimatedItemSize={50}
		/>
	);
	return { renderItem };
}

describe('VirtualizedList (native) with an undefined item past the end of shrunk data', () => {
	it('renders nothing and calls neither the caller renderItem nor keyExtractor', () => {
		const keyExtractor = jest.fn((row: Row) => row[0].id);
		const { renderItem } = mountList(keyExtractor);

		expect(mockCaptured.renderItem({ item: undefined, index: 3 })).toBeNull();
		expect(renderItem).not.toHaveBeenCalled();
		expect(keyExtractor).not.toHaveBeenCalled();
	});

	it('keys an undefined item by its index without calling the caller keyExtractor', () => {
		const keyExtractor = jest.fn((row: Row) => row[0].id);
		mountList(keyExtractor);

		expect(mockCaptured.keyExtractor).toBeDefined();
		expect(mockCaptured.keyExtractor!(undefined, 3)).toBe('3');
		expect(keyExtractor).not.toHaveBeenCalled();
	});

	it('still passes a defined item to the caller renderItem and keyExtractor', () => {
		const keyExtractor = jest.fn((row: Row) => `key-${row[0].id}`);
		const { renderItem } = mountList(keyExtractor);
		const item: Row = [{ id: 'b' }];

		const screen = render(mockCaptured.renderItem({ item, index: 0 })!);
		expect(screen.getByText('row-b')).toBeTruthy();
		expect(renderItem).toHaveBeenCalledWith(expect.objectContaining({ item, index: 0 }));
		expect(keyExtractor).toHaveBeenCalledWith(item, 0);

		expect(mockCaptured.keyExtractor!(item, 0)).toBe('key-b');
	});

	it('passes FlashList no keyExtractor when the caller gives none', () => {
		mountList();
		expect(mockCaptured.keyExtractor).toBeUndefined();
	});
});
