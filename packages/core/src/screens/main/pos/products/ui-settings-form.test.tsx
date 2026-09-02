/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { act, fireEvent, render, screen } from '@testing-library/react';
import { BehaviorSubject } from 'rxjs';

import { UISettingsForm } from './ui-settings-form';

type Settings = {
	viewMode: 'grid' | 'table';
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
	return {
		Form: FormProvider,
		FormField: (props: any) => (
			<FormFieldContext.Provider value={{ name: props.name }}>
				<Controller {...props} />
			</FormFieldContext.Provider>
		),
		FormSwitch: ({ label, value, onChange }: any) => (
			<>
				<input
					type="checkbox"
					aria-label={label}
					checked={!!value}
					onChange={(e) => onChange(e.target.checked)}
				/>
				<FieldStateReader />
			</>
		),
		useFormChangeHandler,
	};
});

jest.mock('@wcpos/components/select', () => {
	const SelectCtx = React.createContext<(o: any) => void>(() => {});
	return {
		Select: ({ onValueChange, children }: any) => (
			<SelectCtx.Provider value={onValueChange}>{children}</SelectCtx.Provider>
		),
		SelectTrigger: ({ children }: any) => <>{children}</>,
		SelectValue: () => null,
		SelectContent: ({ children }: any) => <>{children}</>,
		SelectGroup: ({ children }: any) => <>{children}</>,
		SelectItem: ({ value, label }: any) => {
			const onValueChange = React.useContext(SelectCtx);
			return (
				<button
					type="button"
					data-testid={`option-${value}`}
					onClick={() => onValueChange({ value, label })}
				>
					{label}
				</button>
			);
		},
	};
});

jest.mock('@wcpos/components/toggle-group', () => {
	const ToggleCtx = React.createContext<(v: string) => void>(() => {});
	return {
		ToggleGroup: ({ onValueChange, children }: any) => (
			<ToggleCtx.Provider value={onValueChange}>{children}</ToggleCtx.Provider>
		),
		ToggleGroupItem: ({ value, testID, children }: any) => {
			const onValueChange = React.useContext(ToggleCtx);
			return (
				<button type="button" data-testid={testID} onClick={() => onValueChange(value)}>
					{children}
				</button>
			);
		},
	};
});

jest.mock('@wcpos/components/slider', () => ({
	Slider: ({ value, onValueChange }: any) => (
		<input
			type="range"
			data-testid="slider"
			value={value}
			onChange={(e) => onValueChange(Number(e.target.value))}
		/>
	),
}));
jest.mock('@wcpos/components/text', () => ({
	Text: ({ children }: any) => <span>{children}</span>,
}));
jest.mock('@wcpos/components/vstack', () => ({ VStack: ({ children }: any) => children }));
jest.mock('@wcpos/components/hstack', () => ({ HStack: ({ children }: any) => children }));
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
