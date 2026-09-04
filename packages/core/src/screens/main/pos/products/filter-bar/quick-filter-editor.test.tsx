/** @jest-environment jsdom */
import * as React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';

import { QuickFilterEditor } from './quick-filter-editor';

const onSave = jest.fn();
const onCancel = jest.fn();

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
jest.mock('../../../hooks/use-engine-document', () => ({
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
jest.mock('@wcpos/components/toggle-group', () => {
	const Context = React.createContext<(value: string) => void>(() => {});
	function ToggleGroup({
		children,
		onValueChange,
	}: React.PropsWithChildren<{ onValueChange?: (value: string) => void }>) {
		return <Context.Provider value={onValueChange ?? (() => {})}>{children}</Context.Provider>;
	}
	function ToggleGroupItem({
		children,
		value,
		testID,
	}: React.PropsWithChildren<{ value: string; testID?: string }>) {
		const onValueChange = React.useContext(Context);
		return (
			<button type="button" data-testid={testID} onClick={() => onValueChange(value)}>
				{children}
			</button>
		);
	}
	return { ToggleGroup, ToggleGroupItem };
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
	return render(<QuickFilterEditor initial={null} onSave={onSave} onCancel={onCancel} />);
}

function nameDraft() {
	fireEvent.change(screen.getByTestId('quick-filter-name'), { target: { value: ' Sale wines ' } });
}

it('keeps Save disabled for a new empty draft', () => {
	renderEditor();
	expect((screen.getByTestId('quick-filter-save') as HTMLButtonElement).disabled).toBe(true);
});

it('saves a trimmed name and an On sale condition', () => {
	renderEditor();
	nameDraft();
	fireEvent.click(screen.getByTestId('quick-filter-add-condition'));
	fireEvent.click(screen.getByTestId('quick-filter-condition-option-0-on_sale'));

	expect((screen.getByTestId('quick-filter-save') as HTMLButtonElement).disabled).toBe(false);
	fireEvent.click(screen.getByTestId('quick-filter-save'));
	expect(onSave).toHaveBeenCalledWith({
		id: 'quick-filter-id',
		type: 'quick',
		label: 'Sale wines',
		conditions: [{ field: 'on_sale', value: true }],
	});
});

it('does not offer a field already used by another row', () => {
	renderEditor();
	fireEvent.click(screen.getByTestId('quick-filter-add-condition'));
	fireEvent.click(screen.getByTestId('quick-filter-condition-option-0-on_sale'));
	fireEvent.click(screen.getByTestId('quick-filter-add-condition'));

	expect(screen.queryByTestId('quick-filter-condition-option-1-on_sale')).toBeNull();
});

it('disables Save after removing the only condition when there is no sort', () => {
	renderEditor();
	nameDraft();
	fireEvent.click(screen.getByTestId('quick-filter-add-condition'));
	fireEvent.click(screen.getByTestId('quick-filter-condition-option-0-on_sale'));
	expect((screen.getByTestId('quick-filter-save') as HTMLButtonElement).disabled).toBe(false);

	fireEvent.click(screen.getByTestId('quick-filter-condition-remove-0'));
	expect((screen.getByTestId('quick-filter-save') as HTMLButtonElement).disabled).toBe(true);
});

it('enables Save when a named draft has only a sort field', () => {
	renderEditor();
	nameDraft();
	fireEvent.click(screen.getByTestId('quick-filter-sort-option-name'));

	expect((screen.getByTestId('quick-filter-save') as HTMLButtonElement).disabled).toBe(false);
});

it('saves product type as a sort field', () => {
	renderEditor();
	nameDraft();
	fireEvent.click(screen.getByTestId('quick-filter-sort-option-type'));
	fireEvent.click(screen.getByTestId('quick-filter-save'));

	expect(onSave).toHaveBeenCalledWith(
		expect.objectContaining({ conditions: [], sort: { field: 'type', direction: 'asc' } })
	);
});

it('preserves a finite negative price bound', () => {
	renderEditor();
	nameDraft();
	fireEvent.click(screen.getByTestId('quick-filter-add-condition'));
	fireEvent.click(screen.getByTestId('quick-filter-condition-option-0-price'));
	fireEvent.change(screen.getByTestId('quick-filter-price-min'), { target: { value: '-5' } });
	fireEvent.click(screen.getByTestId('quick-filter-save'));

	expect(onSave).toHaveBeenCalledWith(
		expect.objectContaining({ conditions: [{ field: 'price', value: { min: -5 } }] })
	);
});

it('keeps a zero price bound unbounded', () => {
	renderEditor();
	nameDraft();
	fireEvent.click(screen.getByTestId('quick-filter-add-condition'));
	fireEvent.click(screen.getByTestId('quick-filter-condition-option-0-price'));
	fireEvent.change(screen.getByTestId('quick-filter-price-min'), { target: { value: '0' } });

	expect((screen.getByTestId('quick-filter-save') as HTMLButtonElement).disabled).toBe(true);
});
