/** @jest-environment jsdom */
import * as React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';

import { createCartConfig } from '@wcpos/order-math';

import {
	DisplayCurrentTaxRates,
	type DisplayCurrentTaxRatesProps,
} from './display-current-tax-rates';

import type { TaxRateData } from '../../../contexts/tax-rates';

// No tax, cart, order or extra-data provider and no mock of their hooks: on native the panel
// renders at the root PortalHost, outside all of them, so everything must arrive as props.
jest.mock('react-native', () => ({
	...jest.requireActual('react-native'),
	Text: ({
		children,
		className,
		testID,
	}: React.PropsWithChildren<{ className?: string; testID?: string }>) => (
		<span data-testid={testID} data-classes={className} className={className}>
			{children}
		</span>
	),
}));

const mockClose = jest.fn();
jest.mock('@wcpos/components/popover', () => ({
	useRootContext: () => ({ onOpenChange: mockClose }),
}));
const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('expo-haptics', () => ({}));
jest.mock('@wcpos/components/icon', () => ({ Icon: () => null }));
jest.mock('@wcpos/components/loader', () => ({ Loader: () => null }));
jest.mock('@wcpos/components/table', () => ({ TABLE_HEAD_TEXT: 'head' }));
jest.mock('../../../../../contexts/translations', () => ({
	useT: () => (key: string, options?: Record<string, string>) =>
		options ? `${key} ${JSON.stringify(options)}` : key,
}));
// Reads the store's separators from app state, which the portal keeps; not the seam under test.
jest.mock('../../../hooks/use-number-format', () => ({
	useNumberFormat: () => ({ format: (value: number) => String(value) }),
}));

const rate = (fields: Partial<TaxRateData>) =>
	({
		id: 1,
		name: 'VAT',
		rate: '20.0000',
		class: 'standard',
		country: 'GB',
		state: '',
		postcodes: [],
		cities: [],
		priority: 1,
		compound: false,
		shipping: true,
		order: 0,
		...fields,
	}) as TaxRateData;

const props = (
	overrides: Partial<DisplayCurrentTaxRatesProps> = {}
): DisplayCurrentTaxRatesProps => {
	const rates = overrides.rates ?? [
		rate({}),
		rate({ id: 2, name: 'World', rate: '1.0000', country: '' }),
	];
	return {
		rates,
		allRates: rates,
		taxBasedOn: 'base',
		addressUsed: 'base',
		location: { country: 'GB', state: '', city: '', postcode: '' },
		hasOrder: false,
		taxClasses: [{ slug: 'standard', name: 'Standard rate' }],
		config: createCartConfig({
			rates,
			allRates: rates,
			calcTaxes: true,
			pricesIncludeTax: false,
			taxRoundAtSubtotal: false,
			dp: 2,
			shippingTaxClass: 'standard',
			taxClassSlugs: ['standard'],
			calcDiscountsSequentially: false,
		}),
		...overrides,
	};
};

beforeEach(() => {
	mockClose.mockClear();
	mockPush.mockClear();
});

it('renders the three nodes from props alone, with no tax provider above it', () => {
	render(<DisplayCurrentTaxRates {...props()} />);
	expect(screen.getByText('common.calculated_from')).toBeTruthy();
	expect(screen.getByText('common.shop_base_address')).toBeTruthy();
	expect(screen.getByText('common.shop_address')).toBeTruthy();
	expect(screen.getByText('United Kingdom (UK)')).toBeTruthy();
	expect(screen.getByText('common.rates_that_match_it')).toBeTruthy();
	expect(screen.getByText('Standard rate')).toBeTruthy();
	expect(screen.getByText('21%')).toBeTruthy();
	for (const [label, ink] of [
		['Standard rate', 'font-semibold'],
		['VAT', 'text-muted-foreground'],
	]) {
		const nodes = screen
			.getByText(label)
			.parentElement!.parentElement!.querySelectorAll('[data-classes]');
		expect(nodes.length).toBeGreaterThanOrEqual(3);
		for (const node of nodes) expect(node.getAttribute('data-classes')).toContain(ink);
	}
	// A worldwide rate reads plain "anywhere", not "anywhere in GB".
	expect(screen.getByText(/· common\.tax_why_anywhere$/)).toBeTruthy();
	expect(screen.getByText(/· common\.tax_why_anywhere_in \{"country":"GB"\}$/)).toBeTruthy();
});

it('the settings link closes the panel, then goes to Settings › Tax', () => {
	render(<DisplayCurrentTaxRates {...props()} />);
	fireEvent.click(screen.getByTestId('tax-based-on-change-setting'));
	expect(mockClose).toHaveBeenCalledWith(false);
	expect(mockPush).toHaveBeenCalledWith('/settings/tax');
});

it('View all hands the panel the address to match, closing first', () => {
	render(
		<DisplayCurrentTaxRates
			{...props({
				taxBasedOn: 'shipping',
				addressUsed: 'shipping',
				hasOrder: true,
				location: { country: 'US', state: 'OR', city: 'Portland', postcode: '97201' },
				rates: [rate({ country: 'US', state: 'OR' })],
			})}
		/>
	);
	fireEvent.click(screen.getByTestId('tax-based-on-view-all'));
	expect(mockClose).toHaveBeenCalledWith(false);
	expect(mockPush).toHaveBeenCalledWith({
		pathname: '/(app)/(modals)/tax-rates',
		params: { applies: '1', country: 'US', state: 'OR', city: 'Portland', postcode: '97201' },
	});
});

it('View all from an order with no address opens the plain panel: nothing to match', () => {
	render(
		<DisplayCurrentTaxRates
			{...props({
				taxBasedOn: 'billing',
				addressUsed: 'billing',
				hasOrder: true,
				location: { country: '', state: '', city: '', postcode: '' },
				rates: [],
			})}
		/>
	);
	fireEvent.click(screen.getByTestId('tax-based-on-view-all'));
	expect(mockPush).toHaveBeenCalledWith('/(app)/(modals)/tax-rates');
});

it("reads the order's address on an order, with its postal line", () => {
	render(
		<DisplayCurrentTaxRates
			{...props({
				taxBasedOn: 'shipping',
				addressUsed: 'shipping',
				hasOrder: true,
				location: { country: 'US', state: 'OR', city: 'Portland', postcode: '97201' },
				rates: [rate({ country: 'US', state: 'OR', name: 'Oregon' })],
			})}
		/>
	);
	expect(screen.getByText('common.address_on_the_order')).toBeTruthy();
	expect(screen.getByText('Portland OR 97201, United States (US)')).toBeTruthy();
	expect(screen.getByText(/· common\.tax_why_state$/)).toBeTruthy();
});

it('says the order has no shipping address and that tax uses its billing address', () => {
	render(
		<DisplayCurrentTaxRates
			{...props({ taxBasedOn: 'shipping', addressUsed: 'billing', hasOrder: true })}
		/>
	);
	expect(screen.getByText('common.customer_shipping_address')).toBeTruthy();
	expect(screen.getByText('common.address_on_the_order')).toBeTruthy();
	expect(screen.getByText('common.no_shipping_address_using_billing')).toBeTruthy();
});

it('labels the shop address when the order has no address with a country', () => {
	render(
		<DisplayCurrentTaxRates
			{...props({ taxBasedOn: 'shipping', addressUsed: 'base', hasOrder: true })}
		/>
	);
	expect(screen.getByText('common.shop_address')).toBeTruthy();
	expect(screen.getByText('common.no_order_address_using_shop')).toBeTruthy();
	expect(screen.queryByText('common.address_on_the_order')).toBeNull();
});

it('says the order has no billing address and that tax uses the shop address', () => {
	render(
		<DisplayCurrentTaxRates
			{...props({ taxBasedOn: 'billing', addressUsed: 'base', hasOrder: true })}
		/>
	);
	expect(screen.getByText('common.no_billing_address_using_shop')).toBeTruthy();
});

it('adds no fallback note when the address used is the configured one', () => {
	render(
		<DisplayCurrentTaxRates
			{...props({ taxBasedOn: 'shipping', addressUsed: 'shipping', hasOrder: true })}
		/>
	);
	expect(screen.queryByText('common.no_shipping_address_using_billing')).toBeNull();
	expect(screen.queryByText('common.no_order_address_using_shop')).toBeNull();
	expect(screen.queryByText('common.no_billing_address_using_shop')).toBeNull();
});

it("without an order the address is the shop's, whatever the setting", () => {
	render(<DisplayCurrentTaxRates {...props({ taxBasedOn: 'shipping', hasOrder: false })} />);
	expect(screen.getByText('common.shop_address')).toBeTruthy();
	expect(screen.queryByText('common.address_on_the_order')).toBeNull();
});

it('names the country from a code stored in lower case, and keeps the code as stored', () => {
	render(
		<DisplayCurrentTaxRates
			{...props({
				location: { country: 'us', state: '', city: '', postcode: '' },
				rates: [rate({ country: 'US' })],
			})}
		/>
	);
	expect(screen.getByText('United States (US)')).toBeTruthy();
	expect(screen.getByText('us')).toBeTruthy();
});

it('breaks at the rates when the address matched none, naming the country', () => {
	render(
		<DisplayCurrentTaxRates
			{...props({
				taxBasedOn: 'shipping',
				addressUsed: 'shipping',
				hasOrder: true,
				location: { country: 'IS', state: '', city: 'Reykjavík', postcode: '101' },
				rates: [],
			})}
		/>
	);
	expect(screen.getByText('common.no_rate_matches_it')).toBeTruthy();
	expect(screen.getByText('common.store_has_no_tax_rate_for {"country":"Iceland"}')).toBeTruthy();
	expect(screen.getByText('common.add_one_in_woocommerce_tax')).toBeTruthy();
});

it('says the rates for the country miss this address when the store has some for it', () => {
	render(
		<DisplayCurrentTaxRates
			{...props({
				taxBasedOn: 'shipping',
				addressUsed: 'shipping',
				hasOrder: true,
				location: { country: 'US', state: 'OR', city: 'Portland', postcode: '97201' },
				rates: [],
				allRates: [rate({ country: 'US', state: 'CA', name: 'California' })],
			})}
		/>
	);
	expect(
		screen.getByText('common.no_rate_covers_this_address_in {"country":"United States (US)"}')
	).toBeTruthy();
});

it('falls back to a countryless cause when the address has no country', () => {
	render(
		<DisplayCurrentTaxRates
			{...props({ location: { country: '', state: '', city: '', postcode: '' }, rates: [] })}
		/>
	);
	expect(screen.getByText('common.store_has_no_tax_rate_for_this_address')).toBeTruthy();
});
