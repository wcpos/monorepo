/** @jest-environment jsdom */
import * as React from 'react';

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

import { createTestT } from '../../../../../../jest/translate';
import { isQuickFilterValid } from './filter-bar-layout';
import { QuickFilterEditor } from './quick-filter-editor';

const t = createTestT();
const onDraftChange = jest.fn();
const flushRef = React.createRef<() => void>();
const onChange = jest.fn();

jest.mock('react-native-reanimated', () => ({
	...jest.requireActual('react-native-reanimated'),
	useReducedMotion: () => true,
}));

jest.mock('uuid', () => ({ v4: () => 'quick-filter-id' }));
jest.mock('./quick-filter-preview', () => ({ QuickFilterPreview: () => null }));
jest.mock('../../../../../contexts/translations', () => ({
	useT: () => jest.requireActual('../../../../../../jest/translate').createTestT(),
}));
jest.mock('../../../hooks/use-stock-status-label', () => ({
	useStockStatusLabel: () => ({
		items: [
			{ value: 'instock', label: 'In stock' },
			{ value: 'outofstock', label: 'Out of stock' },
		],
	}),
}));
jest.mock('@wcpos/query/record-readers', () => ({
	useEngineRecordsByWooId: (_taxonomy: string, ids: number[]) => ({ ids }),
}));
jest.mock('../../../components/product/category-select', () => ({
	CategoryTreeLoader: () => null,
}));
jest.mock('../../../components/product/tag-select', () => ({
	TagSelect: ({
		onValueChange,
	}: {
		onValueChange: (value: { value: string; label: string }) => void;
	}) => (
		<button data-testid="pick-tag" onClick={() => onValueChange({ value: '5', label: 'Term 5' })} />
	),
}));
jest.mock('../../../components/product/brand-select', () => ({ BrandSelect: () => null }));

jest.mock('@wcpos/components/button', () => ({
	Button: ({
		children,
		onPress,
		disabled,
		testID,
	}: React.PropsWithChildren<{ onPress?: () => void; disabled?: boolean; testID?: string }>) => (
		<button type="button" data-testid={testID} disabled={disabled} onClick={onPress}>
			{children}
		</button>
	),
	ButtonText: ({ children }: React.PropsWithChildren) => <span>{children}</span>,
}));
jest.mock('@wcpos/components/input', () => ({
	Input: ({
		value,
		onChangeText,
		testID,
	}: {
		value: string;
		onChangeText: (value: string) => void;
		testID?: string;
	}) => (
		<input
			data-testid={testID}
			value={value}
			onChange={(event) => onChangeText(event.target.value)}
		/>
	),
}));
jest.mock('@wcpos/components/icon-button', () => ({
	IconButton: ({ testID, onPress }: { testID: string; onPress: () => void }) => (
		<button type="button" data-testid={testID} onClick={onPress} />
	),
}));
jest.mock('@wcpos/components/select', () => {
	type Option = { value: string; label: string };
	const Context = React.createContext<(option: Option | undefined) => void>(() => {});
	function Select({
		children,
		onValueChange,
	}: React.PropsWithChildren<{ onValueChange?: (option: Option | undefined) => void }>) {
		return <Context.Provider value={onValueChange ?? (() => {})}>{children}</Context.Provider>;
	}
	function SelectItem({ value, label, testID }: Option & { testID?: string }) {
		const onValueChange = React.useContext(Context);
		return (
			<button
				type="button"
				data-testid={testID ?? `option-${value}`}
				onClick={() => onValueChange({ value, label })}
			>
				{label}
			</button>
		);
	}
	function PassThrough({ children }: React.PropsWithChildren) {
		return <>{children}</>;
	}
	return {
		Select,
		SelectContent: PassThrough,
		SelectGroup: PassThrough,
		SelectItem,
		SelectTrigger: PassThrough,
		SelectPrimitiveTrigger: PassThrough,
		SelectValue: () => null,
	};
});

jest.mock('@wcpos/components/tree-combobox', () => ({
	TreeCombobox: ({
		children,
		onValueChange,
	}: React.PropsWithChildren<{
		onValueChange: (value: { value: string; label: string }[]) => void;
	}>) => (
		<>
			{children}
			<button
				data-testid="pick-category"
				onClick={() => onValueChange([{ value: '2', label: 'Term 2' }])}
			/>
			<button data-testid="clear-category" onClick={() => onValueChange([])} />
		</>
	),
	TreeComboboxContent: ({ children }: React.PropsWithChildren) => <>{children}</>,
	TreeComboboxTrigger: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));
jest.mock('@wcpos/components/hstack', () => ({
	HStack: ({ children, testID }: React.PropsWithChildren<{ testID?: string }>) => (
		<div data-testid={testID}>{children}</div>
	),
}));
jest.mock('@wcpos/components/vstack', () => ({
	VStack: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
}));
jest.mock('@wcpos/components/text', () => ({
	Text: ({ children }: React.PropsWithChildren) => <span>{children}</span>,
}));
jest.mock('@wcpos/components/suspense', () => ({
	Suspense: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));
jest.mock('../../../components/amount-field', () => ({
	AmountField: ({
		value,
		onCommit,
		testID,
	}: {
		value?: number;
		onCommit: (value: number) => void;
		testID: string;
	}) => (
		<input
			type="number"
			data-testid={testID}
			value={value ?? ''}
			onChange={(event) => onCommit(Number(event.target.value))}
		/>
	),
}));

beforeEach(() => jest.clearAllMocks());

function renderEditor() {
	return render(
		<QuickFilterEditor
			initial={null}
			onDraftChange={onDraftChange}
			flushRef={flushRef}
			onChange={onChange}
		/>
	);
}

function startScratch() {
	fireEvent.click(screen.getByTestId('quick-filter-start-scratch'));
}

function nameDraft() {
	fireEvent.change(screen.getByTestId('quick-filter-name'), { target: { value: ' Sale wines ' } });
}

it('does not publish an unchanged empty draft on mount', () => {
	renderEditor();
	expect(onDraftChange).not.toHaveBeenCalled();
});

it('reports the current name and an On sale condition', () => {
	renderEditor();
	startScratch();
	nameDraft();
	fireEvent.click(screen.getByTestId('quick-filter-row-on_sale'));
	fireEvent.click(screen.getByTestId('quick-filter-on_sale-option-yes'));

	expect(isQuickFilterValid(onDraftChange.mock.lastCall[0])).toBe(true);
	expect(onDraftChange).toHaveBeenLastCalledWith({
		id: 'quick-filter-id',
		type: 'quick',
		label: ' Sale wines ',
		conditions: [{ field: 'on_sale', value: true }],
	});
	expect(onChange).not.toHaveBeenCalled();
});

it('disables Add after removing the only condition when there is no sort', () => {
	renderEditor();
	startScratch();
	nameDraft();
	fireEvent.click(screen.getByTestId('quick-filter-row-on_sale'));
	fireEvent.click(screen.getByTestId('quick-filter-on_sale-option-yes'));
	expect(isQuickFilterValid(onDraftChange.mock.lastCall[0])).toBe(true);

	fireEvent.click(screen.getByTestId('quick-filter-on_sale-option-either'));
	expect(isQuickFilterValid(onDraftChange.mock.lastCall[0])).toBe(false);
});

it('enables Add when a named draft has only a sort field', () => {
	renderEditor();
	startScratch();
	nameDraft();
	fireEvent.click(screen.getByTestId('quick-filter-sort-option-name-asc'));

	expect(isQuickFilterValid(onDraftChange.mock.lastCall[0])).toBe(true);
});

it('stores the field and direction of a named order', () => {
	renderEditor();
	startScratch();
	nameDraft();
	fireEvent.click(screen.getByTestId('quick-filter-sort-option-sortable_price-desc'));

	expect(onDraftChange).toHaveBeenLastCalledWith(
		expect.objectContaining({
			conditions: [],
			sort: { field: 'sortable_price', direction: 'desc' },
		})
	);
	expect(isQuickFilterValid(onDraftChange.mock.lastCall[0])).toBe(true);
});

it('preserves a finite negative price bound', () => {
	renderEditor();
	startScratch();
	nameDraft();
	fireEvent.click(screen.getByTestId('quick-filter-row-price'));
	fireEvent.change(screen.getByTestId('quick-filter-price-min'), { target: { value: '-5' } });

	expect(onDraftChange).toHaveBeenLastCalledWith(
		expect.objectContaining({ conditions: [{ field: 'price', value: { min: -5 } }] })
	);
});

it('keeps a zero price bound unbounded', () => {
	renderEditor();
	startScratch();
	nameDraft();
	fireEvent.click(screen.getByTestId('quick-filter-row-price'));
	fireEvent.change(screen.getByTestId('quick-filter-price-min'), { target: { value: '0' } });

	expect(isQuickFilterValid(onDraftChange.mock.lastCall[0])).toBe(false);
});

jest.mock('@wcpos/components/icon', () => ({ Icon: () => null }));

describe('editing an existing quick filter', () => {
	const initial = {
		id: 'saved',
		type: 'quick' as const,
		label: 'Sale',
		conditions: [{ field: 'on_sale' as const, value: true }],
	};
	const edit = () =>
		render(
			<QuickFilterEditor
				initial={initial}
				onDraftChange={onDraftChange}
				flushRef={flushRef}
				onChange={onChange}
			/>
		);
	beforeEach(() => jest.useFakeTimers());
	afterEach(() => {
		cleanup();
		jest.useRealTimers();
	});

	it('writes a toggle immediately without a Save button', async () => {
		edit();
		fireEvent.click(screen.getByTestId('quick-filter-on_sale-option-no'));
		expect(onChange).toHaveBeenCalledWith({
			...initial,
			conditions: [{ field: 'on_sale', value: false }],
		});
		expect(screen.queryByTestId('quick-filter-add')).toBeNull();
		expect(screen.queryByTestId('quick-filter-save')).toBeNull();
		await act(async () => {});
		expect(screen.getByTestId('saved-conditions')).toBeTruthy();
	});
	it('writes the trimmed name once 300 ms after the last keystroke', async () => {
		edit();
		nameDraft();
		act(() => jest.advanceTimersByTime(200));
		fireEvent.change(screen.getByTestId('quick-filter-name'), { target: { value: ' Sale wine ' } });
		act(() => jest.advanceTimersByTime(299));
		expect(onChange).not.toHaveBeenCalled();
		await act(async () => {
			jest.advanceTimersByTime(1);
		});
		expect(onChange).toHaveBeenCalledTimes(1);
		expect(onChange).toHaveBeenCalledWith({ ...initial, label: 'Sale wine' });
		expect(screen.getByTestId('saved-label')).toBeTruthy();
	});
	it('keeps the last valid write when the name is emptied', async () => {
		edit();
		nameDraft();
		await act(async () => {
			jest.advanceTimersByTime(300);
		});
		fireEvent.change(screen.getByTestId('quick-filter-name'), { target: { value: '' } });
		await act(async () => {
			jest.advanceTimersByTime(300);
		});
		expect(onChange).toHaveBeenCalledTimes(1);
		expect(onChange).toHaveBeenLastCalledWith({ ...initial, label: 'Sale wines' });
	});
	it('lands a pending rename when the next edit leaves the draft invalid', async () => {
		edit();
		nameDraft();
		// Removing the only condition leaves the renamed draft invalid.
		fireEvent.click(screen.getByTestId('quick-filter-on_sale-option-either'));
		expect(onChange).toHaveBeenCalledTimes(1);
		expect(onChange).toHaveBeenCalledWith({ ...initial, label: 'Sale wines' });
		await act(async () => {
			jest.advanceTimersByTime(300);
		});
		expect(onChange).toHaveBeenCalledTimes(1);
	});
	it('exposes a flush for the host to land the pending name', async () => {
		edit();
		nameDraft();
		act(() => flushRef.current?.());
		expect(onChange).toHaveBeenCalledWith({ ...initial, label: 'Sale wines' });
		await act(async () => {
			jest.advanceTimersByTime(300);
		});
		expect(onChange).toHaveBeenCalledTimes(1);
	});
	it('flushes a pending search edit on unmount', () => {
		const { unmount } = render(
			<QuickFilterEditor
				initial={{ ...initial, conditions: [{ field: 'search', value: 'wine' }] }}
				onDraftChange={onDraftChange}
				flushRef={flushRef}
				onChange={onChange}
			/>
		);
		fireEvent.click(screen.getByTestId('quick-filter-row-search'));
		fireEvent.change(screen.getByTestId('quick-filter-search-term'), { target: { value: 'red' } });
		expect(onChange).not.toHaveBeenCalled();
		unmount();
		expect(onChange).toHaveBeenCalledWith({
			...initial,
			conditions: [{ field: 'search', value: 'red' }],
		});
		act(() => jest.advanceTimersByTime(300));
		expect(onChange).toHaveBeenCalledTimes(1);
	});
	it('does not acknowledge a rejected write', async () => {
		onChange.mockRejectedValueOnce(new Error('write failed'));
		edit();
		fireEvent.click(screen.getByTestId('quick-filter-on_sale-option-no'));
		await act(async () => {});
		expect(screen.queryByTestId('saved-conditions')).toBeNull();
	});
});

jest.mock('./delete-quick-filter-dialog', () => ({ DeleteQuickFilterDialog: () => null }));

it('only renders a remove row for an existing quick filter', () => {
	const view = renderEditor();
	expect(screen.queryByTestId('filter-bar-delete-quick-filter-id')).toBeNull();
	view.rerender(
		<QuickFilterEditor initial={{ id: 'saved', type: 'quick', label: 'Saved', conditions: [] }} />
	);
	expect(screen.getByTestId('filter-bar-delete-saved')).toBeTruthy();
});

jest.mock('../../../hooks/use-currency-format', () => ({
	useCurrencyFormat: () => ({ format: (value: number) => `€${value.toFixed(2)}` }),
}));
jest.mock('observable-hooks', () => ({
	useObservableSuspense: ({ ids }: { ids: number[] }) =>
		ids.map((id) => ({ payload: { id, name: `Term ${id}` } })),
}));

it('starts from scratch with all nine rows unset', () => {
	renderEditor();
	expect(screen.queryByTestId('quick-filter-name')).toBeNull();
	startScratch();
	for (const field of [
		'categories',
		'tags',
		'brands',
		'price',
		'on_sale',
		'featured',
		'stock_status',
		'type',
		'search',
	]) {
		expect(screen.getByTestId(`quick-filter-row-${field}`)).toBeTruthy();
	}
	expect(screen.queryByTestId('quick-filter-add-condition')).toBeNull();
	expect(screen.getByTestId('quick-filter-name')).toBeTruthy();
	expect(screen.getAllByTestId(/^quick-filter-row-/).map((row) => row.dataset.testid)).toEqual(
		[
			'categories',
			'tags',
			'brands',
			'price',
			'on_sale',
			'featured',
			'stock_status',
			'type',
			'search',
		].map((field) => `quick-filter-row-${field}`)
	);
});

it('prefills sale in a category with the category waiting, without opening it', () => {
	renderEditor();
	fireEvent.click(screen.getByTestId('quick-filter-starter-sale_in_category'));
	expect(onDraftChange).toHaveBeenLastCalledWith(
		expect.objectContaining({
			label: '',
			conditions: [
				{ field: 'categories', value: [] },
				{ field: 'on_sale', value: true },
			],
		})
	);
	expect(isQuickFilterValid(onDraftChange.mock.lastCall[0])).toBe(false);
	expect(screen.getByTestId('quick-filter-row-categories').textContent).toContain('Choose…');
	expect(screen.queryByTestId('quick-filter-starter-sale_in_category')).toBeNull();
});

it.each([
	['best_sellers', 'total_sales', 'desc'],
	['new_arrivals', 'date_created_gmt', 'desc'],
	['low_stock', 'stock_quantity', 'asc'],
])('prefills the translated %s order', (id, field, direction) => {
	renderEditor();
	fireEvent.click(screen.getByTestId(`quick-filter-starter-${id}`));
	expect(onDraftChange).toHaveBeenLastCalledWith(
		expect.objectContaining({
			label: t(`pos_products.starter_${id}_title`),
			conditions: [],
			sort: { field, direction },
		})
	);
	expect(isQuickFilterValid(onDraftChange.mock.lastCall[0])).toBe(true);
});

it('shows and retains a stored sort outside the named orders until changed', async () => {
	const initial = {
		id: 'stored',
		type: 'quick' as const,
		label: 'SKU',
		conditions: [],
		sort: { field: 'sku' as const, direction: 'desc' as const },
	};
	render(<QuickFilterEditor initial={initial} onDraftChange={onDraftChange} onChange={onChange} />);
	expect(screen.getByTestId('quick-filter-sort-field').textContent).toContain('SKU ↓');
	expect(onDraftChange).not.toHaveBeenCalled();
	nameDraft();
	expect(onDraftChange).toHaveBeenLastCalledWith({ ...initial, label: ' Sale wines ' });
	expect(onChange).not.toHaveBeenCalled();
	fireEvent.click(screen.getByTestId('quick-filter-sort-option-default'));
	expect(onDraftChange).toHaveBeenLastCalledWith(expect.objectContaining({ sort: undefined }));
	expect(isQuickFilterValid(onDraftChange.mock.lastCall[0])).toBe(false);
	await act(async () => {});
});

it('clears the waiting category after selection and removes it when cleared', () => {
	renderEditor();
	fireEvent.click(screen.getByTestId('quick-filter-starter-sale_in_category'));
	nameDraft();
	fireEvent.click(screen.getByTestId('quick-filter-row-categories'));
	fireEvent.click(screen.getByTestId('pick-category'));
	expect(onDraftChange).toHaveBeenLastCalledWith(
		expect.objectContaining({
			conditions: [
				{ field: 'categories', value: [2] },
				{ field: 'on_sale', value: true },
			],
		})
	);
	expect(isQuickFilterValid(onDraftChange.mock.lastCall[0])).toBe(true);
	expect(screen.getByTestId('quick-filter-row-categories').textContent).toContain('Term 2');
	expect(screen.getByTestId('quick-filter-row-categories').textContent).not.toContain('Choose…');
	fireEvent.click(screen.getByTestId('clear-category'));
	expect(onDraftChange).toHaveBeenLastCalledWith(
		expect.objectContaining({ conditions: [{ field: 'on_sale', value: true }] })
	);
	expect(isQuickFilterValid(onDraftChange.mock.lastCall[0])).toBe(true);
});

it('opens only one inline editor, without adding an empty condition', () => {
	renderEditor();
	startScratch();
	fireEvent.click(screen.getByTestId('quick-filter-row-price'));
	expect(screen.getByTestId('quick-filter-price-min')).toBeTruthy();
	fireEvent.click(screen.getByTestId('quick-filter-row-search'));
	expect(screen.queryByTestId('quick-filter-price-min')).toBeNull();
	expect(screen.getByTestId('quick-filter-search-term')).toBeTruthy();
	fireEvent.click(screen.getByTestId('quick-filter-row-search'));
	expect(screen.queryByTestId('quick-filter-search-term')).toBeNull();
	expect(onDraftChange).not.toHaveBeenCalled();
});

it('removes the price condition when its last bound is cleared', () => {
	renderEditor();
	fireEvent.click(screen.getByTestId('quick-filter-starter-under_price'));
	expect(screen.getByTestId('quick-filter-row-price').textContent).toContain('Choose…');
	nameDraft();
	fireEvent.click(screen.getByTestId('quick-filter-row-price'));
	fireEvent.change(screen.getByTestId('quick-filter-price-max'), { target: { value: '20' } });
	expect(onDraftChange).toHaveBeenLastCalledWith(
		expect.objectContaining({ conditions: [{ field: 'price', value: { max: 20 } }] })
	);
	expect(isQuickFilterValid(onDraftChange.mock.lastCall[0])).toBe(true);
	expect(screen.getByTestId('quick-filter-row-price').textContent).not.toContain('Choose…');
	fireEvent.change(screen.getByTestId('quick-filter-price-max'), { target: { value: '' } });
	expect(onDraftChange).toHaveBeenLastCalledWith(expect.objectContaining({ conditions: [] }));
	expect(isQuickFilterValid(onDraftChange.mock.lastCall[0])).toBe(false);
});

it('adds and removes the last tag through its inline editor', () => {
	renderEditor();
	fireEvent.click(screen.getByTestId('quick-filter-starter-tag'));
	nameDraft();
	fireEvent.click(screen.getByTestId('quick-filter-row-tags'));
	fireEvent.click(screen.getByTestId('pick-tag'));
	expect(screen.getByTestId('quick-filter-row-tags').textContent).toContain('Term 5');
	expect(onDraftChange).toHaveBeenLastCalledWith(
		expect.objectContaining({ conditions: [{ field: 'tags', value: [5] }] })
	);
	expect(isQuickFilterValid(onDraftChange.mock.lastCall[0])).toBe(true);
	fireEvent.click(screen.getByTestId('quick-filter-term-remove-5'));
	expect(onDraftChange).toHaveBeenLastCalledWith(expect.objectContaining({ conditions: [] }));
	expect(isQuickFilterValid(onDraftChange.mock.lastCall[0])).toBe(false);
});

it('quotes the search term and removes an emptied search condition', () => {
	renderEditor();
	startScratch();
	nameDraft();
	fireEvent.click(screen.getByTestId('quick-filter-row-search'));
	fireEvent.change(screen.getByTestId('quick-filter-search-term'), { target: { value: 'wine' } });
	expect(screen.getByTestId('quick-filter-row-search').textContent).toContain('“wine”');
	fireEvent.change(screen.getByTestId('quick-filter-search-term'), { target: { value: '' } });
	expect(onDraftChange).toHaveBeenLastCalledWith(expect.objectContaining({ conditions: [] }));
	expect(isQuickFilterValid(onDraftChange.mock.lastCall[0])).toBe(false);
});

it.each([
	['featured', 'featured', 'no', false, 'either'],
	['stock_status', 'stock-status', 'outofstock', 'outofstock', 'any'],
	['type', 'type', 'variable', 'variable', 'any'],
])('sets and unsets %s through its chooser', (field, id, option, value, unset) => {
	renderEditor();
	startScratch();
	nameDraft();
	fireEvent.click(screen.getByTestId(`quick-filter-row-${field}`));
	fireEvent.click(screen.getByTestId(`quick-filter-${id}-option-${option}`));
	expect(onDraftChange).toHaveBeenLastCalledWith(
		expect.objectContaining({ conditions: [{ field, value }] })
	);
	expect(isQuickFilterValid(onDraftChange.mock.lastCall[0])).toBe(true);
	fireEvent.click(screen.getByTestId(`quick-filter-row-${field}`));
	fireEvent.click(screen.getByTestId(`quick-filter-${id}-option-${unset}`));
	expect(onDraftChange).toHaveBeenLastCalledWith(expect.objectContaining({ conditions: [] }));
	expect(isQuickFilterValid(onDraftChange.mock.lastCall[0])).toBe(false);
});

it('shows one live bar chip with a trimmed name and no count', () => {
	renderEditor();
	startScratch();
	nameDraft();
	fireEvent.click(screen.getByTestId('quick-filter-row-on_sale'));
	fireEvent.click(screen.getByTestId('quick-filter-on_sale-option-yes'));
	const preview = screen.getByTestId('quick-filter-bar-preview');
	expect(preview.textContent).toBe('Sale wines');
});

it.each([
	[{ min: -5 }, 'From €-5.00'],
	[{ max: 20 }, 'Up to €20.00'],
	[{ min: 5, max: 20 }, '€5.00 – €20.00'],
])('formats the price row using store currency: %s', (value, label) => {
	render(
		<QuickFilterEditor
			initial={{
				id: 'price',
				type: 'quick',
				label: 'Price',
				conditions: [{ field: 'price', value }],
			}}
		/>
	);
	expect(screen.getByTestId('quick-filter-row-price').textContent).toContain(label);
});
