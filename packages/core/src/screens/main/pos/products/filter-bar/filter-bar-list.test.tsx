/** @jest-environment jsdom */
import * as React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';

import { FilterBarList } from './filter-bar-list';

import type { FilterBarItem } from './filter-bar-layout';

let items: FilterBarItem[] = [];
const patchUI = jest.fn((patch: { filterBar: FilterBarItem[] }) => {
	items = patch.filterBar;
});
const modifyUI = jest.fn();
const onEdit = jest.fn();

jest.mock('uuid', () => ({ v4: () => 'quick-filter-id' }));
jest.mock('@wcpos/query', () => ({
	useDocField: (_doc: unknown, read: (value: unknown) => unknown) => read({ filterBar: items }),
}));
jest.mock('@wcpos/components/dnd', () => ({
	SortableList: ({
		items: list,
		renderItem,
		onOrderChange,
	}: {
		items: FilterBarItem[];
		onOrderChange: (event: { items: FilterBarItem[] }) => void;
		renderItem: (item: FilterBarItem, index: number) => React.ReactNode;
	}) => (
		<>
			{list.map(renderItem)}
			<button onClick={() => onOrderChange({ items: [...list].reverse() })}>Reorder</button>
		</>
	),
	DragHandle: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));
jest.mock('@wcpos/components/icon', () => ({ Icon: () => null }));

jest.mock('@wcpos/components/switch', () => ({
	Switch: ({
		testID,
		checked,
		onCheckedChange,
	}: {
		testID: string;
		checked: boolean;
		onCheckedChange: (checked: boolean) => void;
	}) => (
		<input
			type="checkbox"
			data-testid={testID}
			checked={checked}
			onChange={(event) => onCheckedChange(event.target.checked)}
		/>
	),
}));

jest.mock('@wcpos/components/vstack', () => ({
	VStack: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
}));
jest.mock('@wcpos/components/text', () => ({
	Text: ({ children }: React.PropsWithChildren) => <span>{children}</span>,
}));

jest.mock('../../../contexts/ui-settings', () => ({
	useUISettings: () => ({ uiSettings: {}, getUILabel: (id: string) => id, patchUI, modifyUI }),
}));
jest.mock('../../../hooks/use-currency-format', () => ({
	useCurrencyFormat: () => ({ format: (value: number) => `€${value.toFixed(2)}` }),
}));
jest.mock('../../../../../contexts/translations', () => ({
	useT: () => (key: string, values?: Record<string, string | number>) => {
		if (key === 'pos_products.quick_filter_price_min') return `Price ${values?.min}+`;
		return key;
	},
}));

beforeEach(() => {
	items = [
		{ id: 'featured', type: 'pill', show: true },
		{
			id: 'saved',
			type: 'quick',
			label: 'Saved',
			conditions: [{ field: 'featured', value: true }],
		},
		{ id: 'stock_status', type: 'pill', show: true },
		{ id: 'on_sale', type: 'pill', show: true },
		{ id: 'categories', type: 'pill', show: true },
		{ id: 'tags', type: 'pill', show: true },
		{ id: 'brands', type: 'pill', show: true },
	];
	jest.clearAllMocks();
});

it('writes a pill visibility toggle immediately', () => {
	render(<FilterBarList onEdit={onEdit} />);
	fireEvent.click(screen.getByTestId('filter-bar-toggle-featured'));
	expect(modifyUI).toHaveBeenCalledWith('filterBar', expect.any(Function));
	const [, modifier] = modifyUI.mock.calls[0];
	const old = items.map((item) => (item.type === 'quick' ? { ...item, label: 'Renamed' } : item));
	expect(modifier(old)).toEqual([{ ...old[0], show: false }, ...old.slice(1)]);
	expect(patchUI).not.toHaveBeenCalled();
});

it('opens an existing filter from its row', () => {
	render(<FilterBarList onEdit={onEdit} />);
	fireEvent.click(screen.getByTestId('filter-bar-edit-saved'));
	expect(onEdit).toHaveBeenCalledWith(items[1]);
});

it('opens the empty editor request from Add quick filter', () => {
	render(<FilterBarList onEdit={onEdit} />);
	fireEvent.click(screen.getByTestId('filter-bar-add-quick-filter'));
	expect(onEdit).toHaveBeenCalledWith(null);
});

it('formats price summaries with the store currency formatter', () => {
	items[1] = {
		id: 'saved',
		type: 'quick',
		label: 'Saved',
		conditions: [{ field: 'price', value: { min: 10 } }],
	};
	render(<FilterBarList onEdit={onEdit} />);
	expect(screen.getByText('Price €10.00+')).toBeTruthy();
});

it('writes the whole reordered list with patchUI', () => {
	render(<FilterBarList onEdit={onEdit} />);
	const reordered = [...items].reverse();
	fireEvent.click(screen.getByText('Reorder'));
	expect(patchUI).toHaveBeenCalledWith({ filterBar: reordered });
	expect(modifyUI).not.toHaveBeenCalled();
});
