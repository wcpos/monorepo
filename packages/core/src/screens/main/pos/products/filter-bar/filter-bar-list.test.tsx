/** @jest-environment jsdom */
import * as React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';

import { FilterBarList } from './filter-bar-list';

import type { FilterBarItem } from './filter-bar-layout';

let items: FilterBarItem[] = [];
const patchUI = jest.fn((patch: { filterBar: FilterBarItem[] }) => {
	items = patch.filterBar;
});
const onEdit = jest.fn();
const onDelete = jest.fn();

jest.mock('uuid', () => ({ v4: () => 'quick-filter-id' }));
jest.mock('@wcpos/query', () => ({
	useDocField: (_doc: unknown, read: (value: unknown) => unknown) => read({ filterBar: items }),
}));
jest.mock('@wcpos/components/dnd', () => ({
	SortableList: ({
		items: list,
		renderItem,
	}: {
		items: FilterBarItem[];
		renderItem: (item: FilterBarItem, index: number) => React.ReactNode;
	}) => <>{list.map(renderItem)}</>,
	DragHandle: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));
jest.mock('@wcpos/components/icon', () => ({ Icon: () => null }));
jest.mock('@wcpos/components/icon-button', () => ({
	IconButton: ({ testID, onPress }: { testID: string; onPress: () => void }) => (
		<button data-testid={testID} onClick={onPress} />
	),
}));
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
jest.mock('@wcpos/components/button', () => ({
	Button: ({
		children,
		testID,
		onPress,
	}: React.PropsWithChildren<{ testID: string; onPress: () => void }>) => (
		<button data-testid={testID} onClick={onPress}>
			{children}
		</button>
	),
	ButtonText: ({ children }: React.PropsWithChildren) => <span>{children}</span>,
}));
jest.mock('@wcpos/components/hstack', () => ({
	HStack: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
}));
jest.mock('@wcpos/components/vstack', () => ({
	VStack: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
}));
jest.mock('@wcpos/components/text', () => ({
	Text: ({ children }: React.PropsWithChildren) => <span>{children}</span>,
}));
jest.mock('@wcpos/components/alert-dialog', () => ({
	AlertDialog: ({ children }: React.PropsWithChildren) => <>{children}</>,
	AlertDialogContent: ({ children }: React.PropsWithChildren) => <>{children}</>,
	AlertDialogHeader: ({ children }: React.PropsWithChildren) => <>{children}</>,
	AlertDialogTitle: ({ children }: React.PropsWithChildren) => <>{children}</>,
	AlertDialogDescription: ({ children }: React.PropsWithChildren) => <>{children}</>,
	AlertDialogFooter: ({ children }: React.PropsWithChildren) => <>{children}</>,
	AlertDialogCancel: ({ children, testID }: React.PropsWithChildren<{ testID: string }>) => (
		<button data-testid={testID}>{children}</button>
	),
	AlertDialogAction: ({
		children,
		testID,
		onPress,
	}: React.PropsWithChildren<{ testID: string; onPress: () => void }>) => (
		<button data-testid={testID} onClick={onPress}>
			{children}
		</button>
	),
}));
jest.mock('../../../contexts/ui-settings', () => ({
	useUISettings: () => ({ uiSettings: {}, getUILabel: (id: string) => id, patchUI }),
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
	expect(patchUI).toHaveBeenCalledWith({
		filterBar: expect.arrayContaining([{ id: 'featured', type: 'pill', show: false }]),
	});
});

it('removes a quick filter only after delete confirmation and reports the deletion', () => {
	render(<FilterBarList onEdit={onEdit} onDelete={onDelete} />);
	fireEvent.click(screen.getByTestId('filter-bar-delete-saved'));
	fireEvent.click(screen.getByTestId('filter-bar-delete-confirm'));
	expect(
		patchUI.mock.calls.at(-1)?.[0].filterBar.some((item: FilterBarItem) => item.id === 'saved')
	).toBe(false);
	expect(onDelete).toHaveBeenCalledWith(expect.objectContaining({ id: 'saved' }));
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
