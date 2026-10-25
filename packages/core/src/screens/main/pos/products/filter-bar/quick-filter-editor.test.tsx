/** @jest-environment jsdom */
import * as React from 'react';

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

import { isQuickFilterValid } from './filter-bar-layout';
import { QuickFilterEditor } from './quick-filter-editor';

const onDraftChange = jest.fn();
const flushRef = React.createRef<() => void>();
const onChange = jest.fn();

jest.mock('react-native-reanimated', () => ({
	...jest.requireActual('react-native-reanimated'),
	useReducedMotion: () => true,
}));

jest.mock('uuid', () => ({ v4: () => 'quick-filter-id' }));
jest.mock('./quick-filter-preview', () => ({ QuickFilterPreview: () => null }));
jest.mock('../../../../../contexts/translations', () => ({ useT: () => (key: string) => key }));
jest.mock('../../../hooks/use-stock-status-label', () => ({
	useStockStatusLabel: () => ({
		items: [
			{ value: 'instock', label: 'In stock' },
			{ value: 'outofstock', label: 'Out of stock' },
		],
	}),
}));
jest.mock('@wcpos/query/record-readers', () => ({
	useEngineRecordsByWooId: () => ({}),
}));
jest.mock('../../../components/product/category-select', () => ({
	CategoryTreeLoader: () => null,
}));
jest.mock('../../../components/product/tag-select', () => ({ TagSelect: () => null }));
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
		SelectValue: () => null,
	};
});

jest.mock('@wcpos/components/tree-combobox', () => ({
	TreeCombobox: ({ children }: React.PropsWithChildren) => <>{children}</>,
	TreeComboboxContent: ({ children }: React.PropsWithChildren) => <>{children}</>,
	TreeComboboxTrigger: ({ children }: React.PropsWithChildren) => <>{children}</>,
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
jest.mock('@wcpos/components/suspense', () => ({
	Suspense: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));
jest.mock('../../../components/currency-input', () => ({
	CurrencyInput: ({
		value,
		onChangeText,
		testID,
	}: {
		value?: number;
		onChangeText: (value: number) => void;
		testID: string;
	}) => (
		<input
			type="number"
			data-testid={testID}
			value={value ?? ''}
			onChange={(event) => onChangeText(Number(event.target.value))}
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

function nameDraft() {
	fireEvent.change(screen.getByTestId('quick-filter-name'), { target: { value: ' Sale wines ' } });
}

it('does not publish an unchanged empty draft on mount', () => {
	renderEditor();
	expect(onDraftChange).not.toHaveBeenCalled();
});

it('reports the current name and an On sale condition', () => {
	renderEditor();
	nameDraft();
	fireEvent.click(screen.getByTestId('quick-filter-add-condition'));
	fireEvent.click(screen.getByTestId('quick-filter-condition-option-0-on_sale'));

	expect(isQuickFilterValid(onDraftChange.mock.lastCall[0])).toBe(true);
	expect(onDraftChange).toHaveBeenLastCalledWith({
		id: 'quick-filter-id',
		type: 'quick',
		label: ' Sale wines ',
		conditions: [{ field: 'on_sale', value: true }],
	});
	expect(onChange).not.toHaveBeenCalled();
});

it('does not offer a field already used by another row', () => {
	renderEditor();
	fireEvent.click(screen.getByTestId('quick-filter-add-condition'));
	fireEvent.click(screen.getByTestId('quick-filter-condition-option-0-on_sale'));
	fireEvent.click(screen.getByTestId('quick-filter-add-condition'));

	expect(screen.queryByTestId('quick-filter-condition-option-1-on_sale')).toBeNull();
});

it('disables Add after removing the only condition when there is no sort', () => {
	renderEditor();
	nameDraft();
	fireEvent.click(screen.getByTestId('quick-filter-add-condition'));
	fireEvent.click(screen.getByTestId('quick-filter-condition-option-0-on_sale'));
	expect(isQuickFilterValid(onDraftChange.mock.lastCall[0])).toBe(true);

	fireEvent.click(screen.getByTestId('quick-filter-condition-remove-0'));
	expect(isQuickFilterValid(onDraftChange.mock.lastCall[0])).toBe(false);
});

it('enables Add when a named draft has only a sort field', () => {
	renderEditor();
	nameDraft();
	fireEvent.click(screen.getByTestId('quick-filter-sort-option-name'));

	expect(isQuickFilterValid(onDraftChange.mock.lastCall[0])).toBe(true);
});

it('saves product type as a sort field', () => {
	renderEditor();
	nameDraft();
	fireEvent.click(screen.getByTestId('quick-filter-sort-option-type'));

	expect(onDraftChange).toHaveBeenLastCalledWith(
		expect.objectContaining({ conditions: [], sort: { field: 'type', direction: 'asc' } })
	);
});

it('preserves a finite negative price bound', () => {
	renderEditor();
	nameDraft();
	fireEvent.click(screen.getByTestId('quick-filter-add-condition'));
	fireEvent.click(screen.getByTestId('quick-filter-condition-option-0-price'));
	fireEvent.change(screen.getByTestId('quick-filter-price-min'), { target: { value: '-5' } });

	expect(onDraftChange).toHaveBeenLastCalledWith(
		expect.objectContaining({ conditions: [{ field: 'price', value: { min: -5 } }] })
	);
});

it('keeps a zero price bound unbounded', () => {
	renderEditor();
	nameDraft();
	fireEvent.click(screen.getByTestId('quick-filter-add-condition'));
	fireEvent.click(screen.getByTestId('quick-filter-condition-option-0-price'));
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
		fireEvent.click(screen.getByTestId('quick-filter-toggle-on_sale-no'));
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
		// A new condition row starts as an empty category list: the draft is invalid until it is filled.
		fireEvent.click(screen.getByTestId('quick-filter-add-condition'));
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
		fireEvent.click(screen.getByTestId('quick-filter-toggle-on_sale-no'));
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
