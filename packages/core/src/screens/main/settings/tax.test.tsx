/** @jest-environment jsdom */
import * as React from 'react';

import { act, render } from '@testing-library/react';

import { TaxSettings } from './tax';

const mockLocalPatch = jest.fn().mockResolvedValue(undefined);
const mockUseForm = jest.fn((_options: unknown) => ({ control: {} }));
const mockUseFormChangeHandler = jest.fn();

const store = {
	id: 1,
	calc_taxes: 'yes',
	prices_include_tax: 'no',
	tax_based_on: 'base',
	shipping_tax_class: '',
	tax_round_at_subtotal: 'no',
	tax_display_shop: 'excl',
	tax_display_cart: 'excl',
	price_display_suffix: '',
	tax_total_display: 'itemized',
};

jest.mock('react-native', () => ({ View: ({ children }: React.PropsWithChildren) => children }));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('react-hook-form', () => ({ useForm: (options: unknown) => mockUseForm(options) }));
jest.mock('@hookform/resolvers/zod', () => ({ zodResolver: jest.fn() }));
jest.mock('@wcpos/components/button', () => ({ Button: () => null, ButtonText: () => null }));
jest.mock('@wcpos/components/form', () => ({
	Form: ({ children }: React.PropsWithChildren) => children,
	FormField: () => null,
	FormInput: () => null,
	FormRadioGroup: () => null,
	FormSelect: () => null,
	FormSwitch: () => null,
	useFormChangeHandler: (options: unknown) => mockUseFormChangeHandler(options),
}));
jest.mock('@wcpos/components/vstack', () => ({
	VStack: ({ children }: React.PropsWithChildren) => children,
}));
jest.mock('@wcpos/query', () => ({
	useDocField: (_document: unknown, selector: (value: typeof store) => unknown) => selector(store),
}));
jest.mock('@wcpos/utils/logger', () => ({
	getErrorMessage: jest.fn(),
	getLogger: () => ({ error: jest.fn() }),
}));
jest.mock('../../../contexts/app-state', () => ({ useStoreSession: () => ({ store }) }));
jest.mock('../../../contexts/translations', () => ({ useT: () => (key: string) => key }));
jest.mock('../components/form-errors', () => ({ FormErrors: () => null }));
jest.mock('../components/incl-excl-tax-radio-group', () => ({ InclExclRadioGroup: () => null }));
jest.mock('../components/tax-based-on-select', () => ({ TaxBasedOnSelect: () => null }));
jest.mock('../components/tax-class-select', () => ({ TaxClassSelect: () => null }));
jest.mock('../components/tax-display-radio-group', () => ({ TaxDisplayRadioGroup: () => null }));
jest.mock('../hooks/mutations/use-local-mutation', () => ({
	useLocalMutation: () => ({ localPatch: mockLocalPatch }),
}));
jest.mock('../hooks/use-rest-http-client', () => ({
	useRestHttpClient: () => ({ get: jest.fn() }),
}));
jest.mock('./components/settings-danger-zone', () => ({ SettingsDangerZone: () => null }));
jest.mock('./components/settings-row', () => ({
	SettingsRow: ({ children }: React.PropsWithChildren) => children,
}));
jest.mock('./components/settings-section', () => ({
	SettingsSection: ({ children }: React.PropsWithChildren) => children,
}));

describe('TaxSettings tax class persistence', () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	it('uses the standard UI option and persists its schema-valid wire value', async () => {
		render(<TaxSettings />);

		expect(mockUseForm).toHaveBeenCalledWith(
			expect.objectContaining({
				values: expect.objectContaining({ shipping_tax_class: 'standard' }),
			})
		);

		const onChange = mockUseFormChangeHandler.mock.calls[0][0].onChange;
		await act(() => onChange({ shipping_tax_class: 'standard' }));

		expect(mockLocalPatch).toHaveBeenCalledWith({
			document: store,
			data: { shipping_tax_class: '' },
		});
	});
});
