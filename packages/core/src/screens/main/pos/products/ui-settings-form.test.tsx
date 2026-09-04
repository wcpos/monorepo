/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { act, fireEvent, render, screen } from '@testing-library/react';
import { BehaviorSubject } from 'rxjs';

import type { FormItemProps } from '@wcpos/components/form';

import { UISettingsForm } from './ui-settings-form';

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

// uuid ships ESM only; the house pattern is to stub it per suite.
jest.mock('uuid', () => ({ v4: () => 'quick-filter-id' }));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: pushSpy }) }));

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
	return { Form: FormProvider, FormField, FormSwitch, useFormChangeHandler };
});

/**
 * The Select and ToggleGroup doubles keep the production prop contracts (`onValueChange`
 * receives an Option / a string) and render each choice as a plain button, so a click
 * goes through the same field `onChange` the real popovers call.
 */
jest.mock('@wcpos/components/select', () => {
	type SelectOption = { value: string; label: string };
	type OnValueChange = (option: SelectOption | undefined) => void;
	const SelectCtx = React.createContext<OnValueChange>(() => {});
	function Select({
		onValueChange,
		children,
	}: React.PropsWithChildren<{ onValueChange?: OnValueChange }>) {
		return <SelectCtx.Provider value={onValueChange ?? (() => {})}>{children}</SelectCtx.Provider>;
	}
	function PassThrough({ children }: React.PropsWithChildren) {
		return <>{children}</>;
	}
	function SelectItem({ value, label, testID }: SelectOption & { testID?: string }) {
		const onValueChange = React.useContext(SelectCtx);
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
	return {
		Select,
		SelectTrigger: PassThrough,
		SelectValue: () => null,
		SelectContent: PassThrough,
		SelectGroup: PassThrough,
		SelectItem,
	};
});

jest.mock('@wcpos/components/toggle-group', () => {
	type OnValueChange = (value: string | undefined) => void;
	const ToggleCtx = React.createContext<OnValueChange>(() => {});
	function ToggleGroup({
		onValueChange,
		children,
	}: React.PropsWithChildren<{ onValueChange?: OnValueChange }>) {
		return <ToggleCtx.Provider value={onValueChange ?? (() => {})}>{children}</ToggleCtx.Provider>;
	}
	function ToggleGroupItem({
		value,
		testID,
		children,
	}: React.PropsWithChildren<{ value: string; testID?: string }>) {
		const onValueChange = React.useContext(ToggleCtx);
		return (
			<button type="button" data-testid={testID} onClick={() => onValueChange(value)}>
				{children}
			</button>
		);
	}
	return { ToggleGroup, ToggleGroupItem };
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
jest.mock('../../../../contexts/translations', () => ({ useT: () => (key: string) => key }));
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

beforeEach(() => {
	jest.useFakeTimers();
	patchSpy.mockClear();
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

	expect(patchSpy).toHaveBeenCalledWith({ showOutOfStock: true });
	await settle();
});

it('persists a View Mode selection', async () => {
	render(<UISettingsForm />);

	fireEvent.click(screen.getByTestId('option-grid'));
	act(() => {
		jest.advanceTimersByTime(1000);
	});

	expect(patchSpy).toHaveBeenCalledWith({ viewMode: 'grid' });
	await settle();
});

it('persists a Sort By selection', async () => {
	render(<UISettingsForm />);

	fireEvent.click(screen.getByTestId('option-sku'));
	act(() => {
		jest.advanceTimersByTime(1000);
	});

	expect(patchSpy).toHaveBeenCalledWith({ sortBy: 'sku' });
	await settle();
});

it('persists a Sort Direction toggle', async () => {
	render(<UISettingsForm />);

	fireEvent.click(screen.getByTestId('sort-direction-desc'));
	act(() => {
		jest.advanceTimersByTime(1000);
	});

	expect(patchSpy).toHaveBeenCalledWith({ sortDirection: 'desc' });
	await settle();
});

it('persists a Panel Position toggle', async () => {
	render(<UISettingsForm />);

	fireEvent.click(screen.getByTestId('panel-position-right'));
	act(() => {
		jest.advanceTimersByTime(1000);
	});

	expect(patchSpy).toHaveBeenCalledWith({ position: 'right' });
	await settle();
});

it('opens the filter-bar customisation modal', () => {
	render(<UISettingsForm />);
	fireEvent.click(screen.getByTestId('customize-filter-bar'));
	expect(pushSpy).toHaveBeenCalledWith('/(app)/(modals)/filter-bar');
});
