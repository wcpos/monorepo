/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import * as React from 'react';

import { act, fireEvent, render, screen } from '@testing-library/react';
import { BehaviorSubject } from 'rxjs';

import type { FormItemProps } from '@wcpos/components/form';

import { UISettingsForm } from './ui-settings-form';
import { useBrowseCounts } from './browse/use-browse-terms';
import { SORT_FIELD_VALUES } from './filter-bar/filter-bar-layout';

import type { ControllerProps, FieldValues } from 'react-hook-form';

type Settings = {
	viewMode: 'grid' | 'table';
	position: 'left' | 'right';
	filterBar: { id: string; type: string; show: boolean }[];
	showOutOfStock: boolean;
	sortBy: string;
	sortDirection: 'asc' | 'desc';
	columns: { key: string; show: boolean }[];
	metaDataKeys: string;
	gridColumns: number;
	gridFields: Record<string, boolean>;
};

const initialSettings: Settings = {
	viewMode: 'table',
	position: 'left',
	filterBar: [],
	showOutOfStock: false,
	sortBy: 'name',
	sortDirection: 'asc',
	columns: [],
	metaDataKeys: '',
	gridColumns: 4,
	gridFields: {
		name: true,
		price: true,
		tax: false,
		on_sale: false,
		category: false,
		sku: false,
		barcode: false,
		stock_quantity: false,
		cost_of_goods_sold: false,
	},
};

const settings$ = new BehaviorSubject<Settings>(initialSettings);
const mockUISettings = { $: settings$, get: () => settings$.getValue() };
const patchSpy = jest.fn();
const pushSpy = jest.fn();
const closeSpy = jest.fn();
jest.mock('@wcpos/components/dialog', () => ({ useDialog: () => ({ close: closeSpy }) }));

// uuid ships ESM only; the house pattern is to stub it per suite.
jest.mock('uuid', () => ({ v4: () => 'quick-filter-id' }));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: pushSpy }) }));

// The label primitive needs a native host; the form's label names its control by this id.
jest.mock('@wcpos/components/label', () => ({
	Label: ({ children, nativeID }: React.PropsWithChildren<{ nativeID?: string }>) => (
		<label id={nativeID}>{children}</label>
	),
}));
jest.mock('@wcpos/components/form', () => {
	const { Controller, FormProvider } = jest.requireActual('react-hook-form');
	const { useFormChangeHandler } = jest.requireActual(
		'../../../../../../components/src/form/use-form-change-handler'
	);
	// The real FormFieldContext + useFormField: FormLabel/FormMessage read the ROOT form
	// state proxy through it, which is what subscribes the whole form to field-state changes.
	const { FormFieldContext, useFormField } = jest.requireActual(
		'../../../../../../components/src/form/context'
	);
	function FieldStateReader() {
		const { error } = useFormField();
		return error ? <span>{String(error.message)}</span> : null;
	}
	function FormField(props: ControllerProps<FieldValues, string>) {
		return (
			<FormFieldContext.Provider value={{ name: props.name }}>
				<Controller {...props} />
			</FormFieldContext.Provider>
		);
	}
	function FormSwitch({ label, value, onChange }: FormItemProps<boolean>) {
		return (
			<>
				<input
					type="checkbox"
					aria-label={label}
					checked={!!value}
					onChange={(e) => onChange(e.target.checked)}
				/>
				<FieldStateReader />
			</>
		);
	}
	// The real field: its label is the form's, and its segments keep `${testID}-${value}`.
	const { FormSegmentedControl } = jest.requireActual(
		'../../../../../../components/src/form/segmented-control'
	);
	/** Each option a plain button, so a click goes through the field `onChange` the list calls. */
	function FormSelect({
		options,
		onChange,
	}: FormItemProps<string> & { options: { value: string; label: string }[] }) {
		return options.map((option) => (
			<button
				key={option.value}
				type="button"
				data-testid={`option-${option.value}`}
				onClick={() => onChange?.(option.value)}
			>
				{option.label}
			</button>
		));
	}
	return {
		Form: FormProvider,
		FormField,
		FormSegmentedControl,
		FormSelect,
		FormSwitch,
		useFormChangeHandler,
	};
});

jest.mock('@wcpos/components/button', () => {
	function Button({
		children,
		onPress,
		disabled,
		testID,
	}: React.PropsWithChildren<{ onPress?: () => void; disabled?: boolean; testID?: string }>) {
		return (
			<button type="button" data-testid={testID} disabled={disabled} onClick={onPress}>
				{children}
			</button>
		);
	}
	function ButtonText({ children }: React.PropsWithChildren) {
		return <span>{children}</span>;
	}
	return { Button, ButtonText };
});

jest.mock('@wcpos/components/input', () => {
	function Input({
		value,
		onChangeText,
		editable = true,
		testID,
	}: {
		value: string;
		onChangeText: (value: string) => void;
		editable?: boolean;
		testID?: string;
	}) {
		return (
			<input
				data-testid={testID}
				value={value}
				disabled={!editable}
				onChange={(e) => onChangeText(e.target.value)}
			/>
		);
	}
	return { Input };
});

jest.mock('@wcpos/components/slider', () => {
	function Slider({
		value,
		onValueChange,
	}: {
		value: number;
		onValueChange: (value: number) => void;
	}) {
		return (
			<input
				type="range"
				data-testid="slider"
				value={value}
				onChange={(e) => onValueChange(Number(e.target.value))}
			/>
		);
	}
	return { Slider };
});
jest.mock('@wcpos/components/text', () => {
	function Text({ children }: React.PropsWithChildren) {
		return <span>{children}</span>;
	}
	return { Text };
});
jest.mock('@wcpos/components/vstack', () => ({
	VStack: ({ children }: React.PropsWithChildren) => children,
}));
jest.mock('@wcpos/components/hstack', () => ({
	HStack: ({ children }: React.PropsWithChildren) => children,
}));
jest.mock('@wcpos/components/docs-link', () => ({ DocsLink: () => null }));
jest.mock('./meta-data-keys-field', () => ({ MetaDataKeysField: () => null }));
jest.mock('../../../../contexts/translations', () => ({
	useT: () => (key: string, vars?: { count?: number }) =>
		vars?.count !== undefined ? `${vars.count} ${key}` : key,
}));
// The counts come from the term handles; the row's states are what is tested here.
jest.mock('./browse/use-browse-terms', () => ({ useBrowseCounts: jest.fn() }));
jest.mock('@wcpos/query', () => ({
	useDocField: jest.requireActual('../../../../../../query/src/records/use-record-field')
		.useDocField,
}));
jest.mock('../../components/ui-settings', () => ({
	columnsFormSchema: { shape: {} },
	UISettingsColumnsForm: () => null,
	useDialogContext: () => ({ setButtonPressHandler: () => {} }),
}));
jest.mock('../../contexts/ui-settings', () => ({
	// Mirrors production `useUISettings`: `patchUI` is a fresh closure on every render.
	useUISettings: () => ({
		uiSettings: mockUISettings,
		getUILabel: (key: string) => key,
		patchUI: (data: Partial<Settings>) => {
			patchSpy(data);
			// RxState writes land asynchronously; the document then re-emits.
			return Promise.resolve().then(() => {
				settings$.next({ ...settings$.getValue(), ...data });
			});
		},
		resetUI: async () => {},
	}),
}));

const mockUseBrowseCounts = useBrowseCounts as jest.MockedFunction<typeof useBrowseCounts>;

beforeEach(() => {
	jest.useFakeTimers();
	patchSpy.mockClear();
	mockUseBrowseCounts.mockReturnValue({ categories: 5, tags: 3, brands: 2, shortcuts: 1 });
	settings$.next(initialSettings);
});

afterEach(() => {
	jest.useRealTimers();
});

async function settle() {
	await act(async () => {
		await Promise.resolve();
	});
}

it('persists a switch change immediately (control)', async () => {
	render(<UISettingsForm />);

	fireEvent.click(screen.getByLabelText('showOutOfStock'));

	// The write lands after the change handler has validated the field (a microtask).
	await settle();
	expect(patchSpy).toHaveBeenCalledWith({ showOutOfStock: true });
	await settle();
});

it('persists a View Mode selection', async () => {
	render(<UISettingsForm />);

	fireEvent.click(screen.getByTestId('view-mode-grid'));
	act(() => {
		jest.advanceTimersByTime(1000);
	});

	// The write lands after the change handler has validated the field (a microtask).
	await settle();
	expect(patchSpy).toHaveBeenCalledWith({ viewMode: 'grid' });
	await settle();
});

it('names the inline Variations style after the view: expanded rows under a table, a popover on a tile', () => {
	render(<UISettingsForm />);
	const inline = () => screen.getByTestId('products-variations-style-inline');
	expect(inline().textContent).toBe('pos_products.variations_expanded_rows');
	fireEvent.click(screen.getByTestId('view-mode-grid'));
	expect(inline().textContent).toBe('pos_products.variations_popover');
});

it('persists the inline Variations selection', async () => {
	render(<UISettingsForm />);
	fireEvent.click(screen.getByTestId('products-variations-style-inline'));
	act(() => jest.advanceTimersByTime(1000));
	// The write lands after the change handler has validated the field (a microtask).
	await settle();
	expect(patchSpy).toHaveBeenCalledWith({ variationsStyle: 'inline' });
	await settle();
});

it('offers Browse by with All products first and dims a source with nothing to show', async () => {
	mockUseBrowseCounts.mockReturnValue({ categories: 5, tags: undefined, brands: 0, shortcuts: 2 });
	render(<UISettingsForm />);

	// The segmented controls are radios too; this field's are the browse-by ones, in order.
	const options = screen
		.getAllByRole('radio')
		.map((node) => node.getAttribute('data-testid'))
		.filter((id) => id?.startsWith('ui-settings-browse-by-'));
	expect(options).toEqual([
		'ui-settings-browse-by-all',
		'ui-settings-browse-by-categories',
		'ui-settings-browse-by-tags',
		'ui-settings-browse-by-brands',
		'ui-settings-browse-by-shortcuts',
	]);
	// No stored value reads as the default, Categories; All products is offered, not chosen.
	expect(screen.getByTestId('ui-settings-browse-by-categories')).toHaveAttribute(
		'aria-checked',
		'true'
	);
	expect(screen.getByTestId('ui-settings-browse-by-all')).toHaveAttribute('aria-checked', 'false');

	// Answered with terms: enabled, with its count.
	const categories = screen.getByTestId('ui-settings-browse-by-categories');
	expect(categories).not.toHaveAttribute('aria-disabled', 'true');
	expect(categories).toHaveTextContent('5 pos_products.n_categories');

	// Still loading: a choice, with no count and no empty reason.
	const tags = screen.getByTestId('ui-settings-browse-by-tags');
	expect(tags).not.toHaveAttribute('aria-disabled', 'true');
	expect(tags).not.toHaveTextContent('pos_products.n_tags');
	expect(tags).not.toHaveTextContent('pos_products.no_tags_yet');

	// Answered empty: dimmed, disabled, saying why.
	const brands = screen.getByTestId('ui-settings-browse-by-brands');
	expect(brands).toHaveAttribute('aria-disabled', 'true');
	expect(brands).toHaveTextContent('pos_products.no_brands_yet');
	fireEvent.click(brands);
	act(() => jest.advanceTimersByTime(1000));
	// The write lands after the change handler has validated the field (a microtask).
	await settle();
	expect(patchSpy).not.toHaveBeenCalled();

	fireEvent.click(tags);
	act(() => jest.advanceTimersByTime(1000));
	// The write lands after the change handler has validated the field (a microtask).
	await settle();
	expect(patchSpy).toHaveBeenCalledWith({ browseBy: 'tags' });
	await settle();
	expect(screen.getByTestId('ui-settings-browse-by-tags')).toHaveAttribute('aria-checked', 'true');
});

it('labels each segmented field with the form label that names its radiogroup', () => {
	render(<UISettingsForm />);
	for (const [name, segment] of [
		['viewMode', 'view-mode-grid'],
		['pos_products.variations_style', 'products-variations-style-drill'],
		['position', 'panel-position-left'],
		['sortDirection', 'sort-direction-asc'],
	]) {
		expect(screen.getByRole('radiogroup', { name })).toContainElement(screen.getByTestId(segment));
	}
});

it('persists a Sort By selection', async () => {
	render(<UISettingsForm />);

	fireEvent.click(screen.getByTestId('option-sku'));
	act(() => {
		jest.advanceTimersByTime(1000);
	});

	// The write lands after the change handler has validated the field (a microtask).
	await settle();
	expect(patchSpy).toHaveBeenCalledWith({ sortBy: 'sku' });
	await settle();
});

it('labels every Sort By option (the product-type sort once rendered blank)', () => {
	render(<UISettingsForm />);
	for (const value of SORT_FIELD_VALUES) {
		expect(screen.getByTestId(`option-${value}`).textContent).not.toBe('');
	}
	expect(screen.getByTestId('option-type')).toHaveTextContent('common.type');
});

it('persists a Sort Direction toggle', async () => {
	render(<UISettingsForm />);

	fireEvent.click(screen.getByTestId('sort-direction-desc'));
	act(() => {
		jest.advanceTimersByTime(1000);
	});

	// The write lands after the change handler has validated the field (a microtask).
	await settle();
	expect(patchSpy).toHaveBeenCalledWith({ sortDirection: 'desc' });
	await settle();
});

it('persists a Panel Position toggle', async () => {
	render(<UISettingsForm />);

	fireEvent.click(screen.getByTestId('panel-position-right'));
	act(() => {
		jest.advanceTimersByTime(1000);
	});

	// The write lands after the change handler has validated the field (a microtask).
	await settle();
	expect(patchSpy).toHaveBeenCalledWith({ position: 'right' });
	await settle();
});

it('closes its settings panel before opening filter-bar customisation', () => {
	render(<UISettingsForm />);
	fireEvent.click(screen.getByTestId('customize-filter-bar'));
	expect(pushSpy).toHaveBeenCalledWith('/(app)/(modals)/filter-bar');
	expect(closeSpy).toHaveBeenCalledTimes(1);
	expect(closeSpy.mock.invocationCallOrder[0]).toBeLessThan(pushSpy.mock.invocationCallOrder[0]);
});

jest.mock('@wcpos/components/icon', () => ({ Icon: () => null }));
