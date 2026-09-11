/** @jest-environment jsdom */
import * as React from 'react';

import { render, screen } from '@testing-library/react';

import { BillingAddressForm } from './billing-address-form';
import { ShippingAddressForm } from './shipping-address-form';

jest.mock('react-hook-form', () => ({
	useFormContext: () => ({
		control: {},
		getValues: () => '',
		watch: () => '',
	}),
}));

jest.mock('@wcpos/components/form', () => ({
	FormField: ({
		name,
		render,
	}: {
		name: string;
		render: (args: { field: { name: string; value: string } }) => React.ReactNode;
	}) => render({ field: { name, value: '' } }),
	FormInput: () => null,
	FormCombobox: ({
		customComponent: Component,
		...props
	}: {
		customComponent: React.ElementType;
	}) => <Component {...props} />,
}));

jest.mock('@wcpos/components/combobox', () => ({
	Combobox: ({ children }: React.PropsWithChildren) => <>{children}</>,
	ComboboxContent: ({ children }: React.PropsWithChildren) => <>{children}</>,
	ComboboxEmpty: ({ children }: React.PropsWithChildren) => <>{children}</>,
	ComboboxInput: () => null,
	ComboboxItem: ({ children }: React.PropsWithChildren) => <>{children}</>,
	ComboboxItemText: () => null,
	ComboboxList: () => null,
	ComboboxTrigger: ({ children, testID }: React.PropsWithChildren<{ testID: string }>) => (
		<button data-testid={testID}>{children}</button>
	),
	ComboboxValue: () => null,
}));

jest.mock('@wcpos/components/hstack', () => ({
	HStack: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));

jest.mock('@wcpos/components/vstack', () => ({
	VStack: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));

jest.mock('../../../contexts/countries', () => ({
	CountriesProvider: ({ children }: React.PropsWithChildren) => <>{children}</>,
	useCountries: () => [],
}));

jest.mock('../../../contexts/translations', () => ({
	useT: () => (key: string) => key,
}));

jest.mock('./country-state-select/state-forminput', () => ({
	StateFormInput: () => null,
}));

function AddressForms() {
	return (
		<>
			<BillingAddressForm />
			<ShippingAddressForm />
		</>
	);
}

it('gives the billing and shipping country triggers distinct IDs', () => {
	render(<AddressForms />);

	expect(screen.getByTestId('billing-country-combobox-trigger')).toBeTruthy();
	expect(screen.getByTestId('shipping-country-combobox-trigger')).toBeTruthy();
});
