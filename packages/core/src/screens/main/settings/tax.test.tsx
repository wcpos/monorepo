/** @jest-environment jsdom */
import * as React from 'react';

import { act, render } from '@testing-library/react';

import { TaxSettings } from './tax';
import { SettingsDangerZone } from './components/settings-danger-zone';

const mockLocalPatch = jest.fn().mockResolvedValue(undefined);
const mockUseForm = jest.fn((_options: unknown) => ({ control: {} }));
const mockUseFormChangeHandler = jest.fn();
const extraData: { taxClasses: { slug: string; name: string }[] } = {
	taxClasses: [
		{ slug: 'standard', name: 'Standard rate' },
		{ slug: 'reduced-rate', name: 'Reduced rate' },
	],
};
const site: { url?: string } = { url: 'https://example.test/' };

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
jest.mock('@wcpos/components/text', () => ({
	Text: ({ children }: React.PropsWithChildren) => <span>{children}</span>,
}));
jest.mock('@wcpos/components/docs-link', () => ({
	DocsLink: ({ href, children }: React.PropsWithChildren<{ href: string }>) => (
		<a href={href}>{children}</a>
	),
}));
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
	useDocField: <T,>(document: T, selector: (value: T) => unknown) => selector(document),
}));
jest.mock('@wcpos/utils/logger', () => ({
	getErrorMessage: jest.fn(),
	getLogger: () => ({ error: jest.fn() }),
}));
jest.mock('../../../contexts/app-state', () => ({
	useStoreSession: () => ({ store, site }),
}));
jest.mock('../contexts/extra-data', () => ({ useExtraData: () => ({ extraData }) }));
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
jest.mock('./components/settings-danger-zone', () => ({ SettingsDangerZone: jest.fn(() => null) }));
jest.mock('./components/settings-row', () => ({
	SettingsRow: ({ children, testID }: React.PropsWithChildren<{ testID?: string }>) => (
		<div data-testid={testID}>{children}</div>
	),
}));
jest.mock('./components/settings-section', () => ({
	SettingsSection: ({ children }: React.PropsWithChildren) => children,
}));

describe('TaxSettings tax class persistence', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		store.shipping_tax_class = '';
	});

	it('shows the standard class label without persisting its UI value', async () => {
		const { getByTestId } = render(<TaxSettings />);

		expect(getByTestId('settings-tax-locked-shipping_tax_class').textContent).toBe('Standard rate');

		const onChange = mockUseFormChangeHandler.mock.calls[0][0].onChange;
		await act(() => onChange({ shipping_tax_class: 'standard' }));

		expect(mockLocalPatch).toHaveBeenCalledWith({
			document: store,
			data: {},
		});
	});

	it('keeps only the five editable settings in form values', () => {
		render(<TaxSettings />);

		expect(mockUseForm).toHaveBeenCalledWith(
			expect.objectContaining({
				values: {
					tax_based_on: 'base',
					tax_display_shop: 'excl',
					tax_display_cart: 'excl',
					price_display_suffix: '',
					tax_total_display: 'itemized',
				},
			})
		);
	});

	it('excludes locked keys from a form change while preserving editable changes', async () => {
		render(<TaxSettings />);
		const onChange = mockUseFormChangeHandler.mock.calls[0][0].onChange;
		await act(() =>
			onChange({
				calc_taxes: 'no',
				prices_include_tax: 'yes',
				shipping_tax_class: 'reduced-rate',
				tax_round_at_subtotal: 'yes',
				tax_based_on: 'shipping',
			})
		);

		expect(mockLocalPatch).toHaveBeenCalledWith({
			document: store,
			data: { tax_based_on: 'shipping' },
		});
		expect(mockLocalPatch.mock.calls[0][0].data).not.toHaveProperty('calc_taxes');
	});

	it('renders the four locked store values', () => {
		const { getByTestId } = render(<TaxSettings />);
		expect(getByTestId('settings-tax-locked-calc_taxes').textContent).toBe('common.yes');
		expect(getByTestId('settings-tax-locked-prices_include_tax').textContent).toBe('common.no');
		expect(getByTestId('settings-tax-locked-tax_round_at_subtotal').textContent).toBe('common.no');
		expect(getByTestId('settings-tax-locked-shipping_tax_class').textContent).toBe('Standard rate');
	});

	it.each([
		['inherit', 'common.tax_class_based_on_cart_items'],
		['standard', 'Standard rate'],
		['reduced-rate', 'Reduced rate'],
	])('renders the shipping tax class %s live from the store', (value, label) => {
		const { getByTestId, rerender } = render(<TaxSettings />);
		store.shipping_tax_class = value;
		rerender(<TaxSettings />);
		expect(getByTestId('settings-tax-locked-shipping_tax_class').textContent).toBe(label);
	});

	it('links to the site WooCommerce tax settings', () => {
		const { getByRole } = render(<TaxSettings />);
		expect(getByRole('link').getAttribute('href')).toBe(
			'https://example.test/wp-admin/admin.php?page=wc-settings&tab=tax'
		);
		expect(getByRole('link').textContent).toBe('settings.tax_locked_link');
	});

	it('does not render Restore server settings', () => {
		render(<TaxSettings />);
		expect(SettingsDangerZone).not.toHaveBeenCalled();
	});

	it('renders no link, and no crash, for a site document without a url', () => {
		const url = site.url;
		delete site.url;
		try {
			const { queryByRole, getByTestId } = render(<TaxSettings />);
			expect(queryByRole('link')).toBeNull();
			expect(getByTestId('settings-tax-locked-calc_taxes').textContent).toBe('common.yes');
		} finally {
			site.url = url;
		}
	});

	it('falls back to the stored slug while the tax classes are unavailable', () => {
		const classes = extraData.taxClasses;
		extraData.taxClasses = [];
		store.shipping_tax_class = 'reduced-rate';
		try {
			const { getByTestId } = render(<TaxSettings />);
			expect(getByTestId('settings-tax-locked-shipping_tax_class').textContent).toBe(
				'reduced-rate'
			);
		} finally {
			extraData.taxClasses = classes;
			store.shipping_tax_class = '';
		}
	});
});
