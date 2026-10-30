import * as React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';
import { FormProvider, useForm } from 'react-hook-form';

import { useFormControlAria } from '../form/aria';
import { FormItemContext } from '../form/context';
import { SavedFieldProvider, useMarkSaved } from '../form/saved-mark';
import { DeviceScope, useIsPhone } from '../lib/device';
import {
	PROPERTY_PLACEHOLDER_CLASS,
	PropertyAdd,
	PropertyAddRow,
	PropertyList,
	PropertyPlaceholder,
	PropertyRow,
	PropertyRowLabelsProvider,
	PropertyVerb,
} from './index';

// Keep RNW rendering; Jest does not compile Uniwind classes, so expose them on the DOM.
const mockWindow = { width: 1024, height: 768, scale: 1, fontScale: 1 };
jest.mock('react-native', () => {
	const actual = jest.requireActual('react-native');
	return {
		...actual,
		useWindowDimensions: () => mockWindow,
		Pressable: ({ className, ...props }: import('react-native').PressableProps) =>
			React.createElement(actual.Pressable, { ...props, dataSet: { classes: className } }),
		View: ({ className, ...props }: import('react-native').ViewProps) =>
			React.createElement(actual.View, { ...props, dataSet: { classes: className } }),
		Text: ({ className, ...props }: import('react-native').TextProps) =>
			React.createElement(actual.Text, { ...props, dataSet: { classes: className } }),
	};
});
jest.mock('expo-haptics', () => ({
	impactAsync: jest.fn(),
	ImpactFeedbackStyle: { Light: 'light' },
}));
jest.mock('../icon', () => ({
	Icon: ({ name }: { name: string }) => {
		const { Text } = jest.requireActual('react-native');
		return <Text testID={`icon-${name}`} />;
	},
}));
jest.mock('../loader', () => ({ Loader: () => null }));
jest.mock('react-native-reanimated', () => ({
	__esModule: true,
	default: { View: jest.requireActual<typeof import('react-native')>('react-native').View },
	FadeOut: { duration: () => undefined },
	ZoomIn: { duration: () => ({ easing: () => undefined }) },
	useReducedMotion: () => true,
	Easing: { bezier: () => undefined },
}));
jest.mock('../switch', () => ({
	Switch: ({ checked, disabled }: { checked: boolean; disabled?: boolean }) => (
		<input type="checkbox" checked={checked} disabled={disabled} readOnly />
	),
}));
jest.mock('@wcpos/utils/open-external-url', () => ({ openExternalURL: jest.fn() }));

const classes = (element: HTMLElement) => element.dataset.classes?.split(' ') ?? [];

it('renders the key, the value and the trailing slot, with no divider', () => {
	render(
		<PropertyList prefix="x">
			<PropertyRow
				testID="row"
				label="Email"
				verb={<PropertyVerb onPress={() => {}}>Remove</PropertyVerb>}
			>
				<PropertyPlaceholder>Add email</PropertyPlaceholder>
			</PropertyRow>
		</PropertyList>
	);
	const row = screen.getByTestId('row');
	expect(row.textContent).toBe('EmailAdd emailRemove');
	for (const token of ['min-h-ctl', 'flex-row', 'items-center', 'gap-3']) {
		expect(classes(row)).toContain(token);
	}
	expect(classes(screen.getByTestId('x-form'))).toContain('gap-0');
	for (const element of screen.getByTestId('x-form').querySelectorAll('[data-classes]')) {
		expect(classes(element as HTMLElement)).not.toContain('border-b');
	}
	const key = screen.getByText('Email');
	expect(classes(key)).toEqual(expect.arrayContaining(['text-muted-foreground', 'text-sm']));
	expect(classes(key.parentElement as HTMLElement)).toContain('w-32');
	expect(classes(screen.getByText('Add email'))).toEqual(
		expect.arrayContaining(PROPERTY_PLACEHOLDER_CLASS.split(' '))
	);
});

/** Presses mark a field saved, as the form's autosave does after a write lands. */
function Save({ name }: { name: string }) {
	const markSaved = useMarkSaved();
	return <button onClick={() => markSaved([name])}>{`save ${name}`}</button>;
}

/** Reads the form item a label-less control in the row would adopt. */
function Adopted() {
	return <span data-testid="adopted">{React.useContext(FormItemContext).nativeID}</span>;
}

describe('the row owns the trailing slot', () => {
	const verb = <PropertyVerb testID="verb">Edit</PropertyVerb>;
	const control = <span data-testid="control" />;
	it.each([
		['no field saved: the verb, then the control', 'other', 'Edit', true],
		["one of the row's fields saved: the mark replaces the verb", 'tax_class', 'Saved', true],
		['a field of another row saved: the verb stays', 'name', 'Edit', true],
	])('%s', (_case, saved, expected, hasControl) => {
		render(
			<PropertyRowLabelsProvider labels={{ saved: 'Saved', open: 'Open' }}>
				<SavedFieldProvider>
					<Save name={saved} />
					<PropertyRow
						prefix="line"
						id="tax"
						name={['tax_status', 'tax_class']}
						label="Tax"
						verb={verb}
						control={control}
					>
						Standard
					</PropertyRow>
				</SavedFieldProvider>
			</PropertyRowLabelsProvider>
		);
		fireEvent.click(screen.getByText(`save ${saved}`));
		const row = screen.getByTestId('line-row-tax');
		expect(row.textContent).toBe(`TaxStandard${expected}`);
		expect(!!screen.queryByTestId('control')).toBe(hasControl);
		// The control is last, so a mark arriving never moves it.
		const trailing = screen.getByTestId('control').parentElement as HTMLElement;
		expect(trailing.lastElementChild).toBe(screen.getByTestId('control'));
	});

	it('names the field by the id when no name is given', () => {
		render(
			<SavedFieldProvider>
				<Save name="code" />
				<PropertyRow prefix="coupon" id="code" label="Code" verb={verb} />
			</SavedFieldProvider>
		);
		fireEvent.click(screen.getByText('save code'));
		expect(screen.getByTestId('saved-code')).toBeTruthy();
		expect(screen.queryByTestId('verb')).toBeNull();
	});

	it('locked (rule 6): the value, where it is set and Open; a boolean is a disabled switch', () => {
		render(
			<>
				<PropertyRow
					testID="country"
					label="Base country"
					locked={{ where: 'Set in WooCommerce', href: 'https://shop/wp-admin' }}
				>
					United Kingdom
				</PropertyRow>
				<PropertyRow testID="taxes" label="Enable taxes" locked={{ where: 'Set in WooCommerce' }}>
					{true}
				</PropertyRow>
				<PropertyRow testID="city" label="City" locked={{ where: 'Set in WooCommerce' }} />
			</>
		);
		expect(screen.getByTestId('country').textContent).toBe(
			'Base countryUnited KingdomSet in WooCommerceOpen'
		);
		expect(screen.getByTestId('icon-openExternal')).toBeTruthy();
		expect(screen.getByTestId('taxes').querySelector('input:checked:disabled')).toBeTruthy();
		expect(screen.getByTestId('city').textContent).toBe('City—Set in WooCommerce');
	});
});

function Probe({ testID }: { testID: string }) {
	return <span data-testid={testID} />;
}

it.each([
	['a locked row', { locked: { where: 'Set in WooCommerce' } }, 'Set in WooCommerce', false],
	[
		'a verb',
		{ verb: <PropertyVerb>Use a different address</PropertyVerb> },
		'Use a different address',
		false,
	],
	['a Switch', { control: <Probe testID="switch" /> }, 'switch', true],
	['a Saved mark', { name: 'tax', verb: <PropertyVerb>Edit</PropertyVerb> }, 'saved-tax', true],
])(
	'on a phone, words wrap in flow under the value; a mark or a switch keeps the key line: %s',
	(_case, props, find, absolute) => {
		render(
			<DeviceScope phone>
				<SavedFieldProvider>
					<Save name="tax" />
					<PropertyRow label="Prices entered with tax" {...props}>
						{true}
					</PropertyRow>
				</SavedFieldProvider>
			</DeviceScope>
		);
		if (find === 'saved-tax') fireEvent.click(screen.getByText('save tax'));
		const node = screen.queryByTestId(find) ?? screen.getByText(find);
		const trailing = node.closest('[data-classes*="gap-2"]') as HTMLElement;
		expect(classes(trailing).includes('absolute')).toBe(absolute);
		expect(classes(trailing).includes('flex-wrap')).toBe(!absolute);
	}
);

it('the row is the form item: its key names every label-less control in it', () => {
	render(
		<PropertyRow prefix="coupon" id="amount" label="Amount">
			<Adopted />
		</PropertyRow>
	);
	expect(screen.getByTestId('adopted').textContent).toBe('coupon-amount');
	expect(screen.getByText('Amount').id || screen.getByText('Amount').getAttribute('id')).toBe(
		'coupon-amount-form-item'
	);
});

/** A label-less input as the form wrappers build it: named and messaged by `useFormControlAria`. */
function Field({ placeholder }: { placeholder: string }) {
	const { itemNativeID, ariaProps } = useFormControlAria({});
	return (
		<input
			placeholder={placeholder}
			aria-labelledby={ariaProps['aria-labelledby']}
			data-message={`${itemNativeID}-form-item-message`}
		/>
	);
}

function InForm({ children }: React.PropsWithChildren) {
	return <FormProvider {...useForm()}>{children}</FormProvider>;
}

it.each([
	['one control is named by the key', false, ['Key'], ['meta-key-form-item']],
	[
		'a compound row keeps each control its own name and message',
		true,
		['Key', 'Value'],
		[null, null],
	],
])('%s', (_case, compound, placeholders, labelledBy) => {
	render(
		<InForm>
			<PropertyRow prefix="meta" id="key" label="Custom field" compound={compound}>
				{placeholders.map((placeholder) => (
					<Field key={placeholder} placeholder={placeholder} />
				))}
			</PropertyRow>
		</InForm>
	);
	const inputs = placeholders.map((placeholder) => screen.getByPlaceholderText(placeholder));
	expect(inputs.map((input) => input.getAttribute('aria-labelledby'))).toEqual(labelledBy);
	const messages = new Set(inputs.map((input) => input.dataset.message));
	expect(messages.size).toBe(inputs.length);
});

it('pressing the key acts on the control it names (focus, toggle)', () => {
	const press = jest.fn();
	function Control() {
		const { setLabelPress } = React.useContext(FormItemContext);
		React.useEffect(() => setLabelPress?.(press), [setLabelPress]);
		return null;
	}
	render(<PropertyRow label="Scan sound" control={<Control />} />);
	fireEvent.click(screen.getByText('Scan sound'));
	expect(press).toHaveBeenCalledTimes(1);
});

it.each([
	['a dialog', false, false, ['w-32', 'shrink-0'], 'flex-row'],
	['a settings page', true, false, ['w-64', 'lg:w-72'], 'flex-row'],
	['stacked', false, true, [], undefined],
])('the key column in %s', (_case, wide, stacked, keyClasses, rowClass) => {
	render(
		<PropertyList wide={wide}>
			<PropertyRow testID="row" label="Theme" stacked={stacked} help="Pre-selected on every sale.">
				<Adopted />
			</PropertyRow>
		</PropertyList>
	);
	const key = screen.getByText('Theme').parentElement as HTMLElement;
	expect(classes(key)).toEqual(expect.arrayContaining(keyClasses));
	if (!keyClasses.length) expect(classes(key).some((c) => /^(lg:)?w-/.test(c))).toBe(false);
	expect(classes(screen.getByTestId('row')).includes('flex-row')).toBe(!!rowClass);
	expect(classes(screen.getByText('Pre-selected on every sale.'))).toContain('text-xs');
});

// The one layout boundary (768 × 480, lib/device) decides the hook and the row's classes alike:
// a phone on its side is a phone, and a DeviceScope (a gallery cell) overrides the window. Only
// the one-line layout aligns on the cross axis; a stacked column keeps the default stretch.
it.each([
	['a tablet', { width: 1024, height: 768 }, undefined, false, false],
	['a phone on its side', { width: 844, height: 390 }, undefined, false, true],
	['a gallery cell forced to a phone', { width: 1024, height: 768 }, true, false, true],
	['a gallery cell forced off a phone', { width: 375, height: 667 }, false, false, false],
	['a stacked row on a tablet', { width: 1024, height: 768 }, undefined, true, false],
])('%s: the hook and the row agree', (_case, window, phone, stacked, expected) => {
	Object.assign(mockWindow, window);
	function Phone() {
		return <span data-testid="phone">{String(useIsPhone())}</span>;
	}
	render(
		<DeviceScope phone={phone}>
			<Phone />
			<PropertyRow testID="row" label="Theme" stacked={stacked}>
				Light
			</PropertyRow>
		</DeviceScope>
	);
	Object.assign(mockWindow, { width: 1024, height: 768 });
	const line = !expected && !stacked;
	expect(screen.getByTestId('phone').textContent).toBe(String(expected));
	expect(classes(screen.getByTestId('row')).includes('flex-row')).toBe(line);
	expect(classes(screen.getByTestId('row')).includes('items-center')).toBe(line);
	expect(classes(screen.getByText('Theme').parentElement as HTMLElement).includes('w-32')).toBe(
		line
	);
});

it('a derived value reads in muted ink', () => {
	render(
		<PropertyRow label="Shipping" derived>
			Same as billing
		</PropertyRow>
	);
	expect(classes(screen.getByText('Same as billing'))).toContain('text-muted-foreground');
});

it('pads the key of a part of an open compound, and tops a multi-line value', () => {
	render(
		<PropertyRow testID="row" label="City" indent align="top">
			Leeds
		</PropertyRow>
	);
	expect(classes(screen.getByText('City').parentElement as HTMLElement)).toContain('pl-4');
	expect(classes(screen.getByTestId('row'))).toContain('items-start');
	// A bare string under a View throws on native, so a plain value renders as a Text.
	expect(classes(screen.getByText('Leeds'))).toEqual(
		expect.arrayContaining(['text-foreground', 'text-base'])
	);
});

it('an add is a 36-tall outline Button with the plus icon, and presses', () => {
	const onPress = jest.fn();
	render(
		<PropertyAddRow>
			<PropertyAdd testID="add" label="Company" onPress={onPress} />
		</PropertyAddRow>
	);
	const add = screen.getByTestId('add');
	expect(classes(add)).toEqual(
		expect.arrayContaining(['h-9', 'border-[length:var(--shape-ctl-border)]', 'border-border'])
	);
	expect(screen.getByTestId('icon-plus')).toBeTruthy();
	expect(classes(add.parentElement as HTMLElement)).toEqual(
		expect.arrayContaining(['flex-row', 'flex-wrap', 'gap-2', 'pt-2'])
	);
	fireEvent.click(add);
	expect(onPress).toHaveBeenCalledTimes(1);
});

it('a verb is a small link Button in primary ink', () => {
	render(
		<PropertyVerb testID="verb" onPress={() => {}}>
			Edit
		</PropertyVerb>
	);
	expect(classes(screen.getByTestId('verb'))).toEqual(
		expect.arrayContaining(['bg-transparent', 'h-9'])
	);
	expect(classes(screen.getByText('Edit'))).toEqual(
		expect.arrayContaining(['text-primary', 'text-sm', 'font-ui'])
	);
});
