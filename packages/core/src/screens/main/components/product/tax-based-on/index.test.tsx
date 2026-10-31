/** @jest-environment jsdom */
import * as React from 'react';

import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';

import { DeviceScope } from '@wcpos/components/lib/device';

import { TaxBasedOn } from './index';

// jest resolves the native primitives; hover versus press is a web question, so load the web
// build (Radix under react-native-web).
jest.mock('@rn-primitives/popover', () =>
	jest.requireActual(
		require.resolve('@rn-primitives/popover').replace(/index\.js$/, 'popover.web.js')
	)
);
// The overlay shell's native motion and insets; the web path never uses them.
jest.mock('react-native-reanimated', () => {
	const animation = { duration: jest.fn().mockReturnThis(), easing: jest.fn().mockReturnThis() };
	return {
		__esModule: true,
		default: { View: () => null },
		Keyframe: jest.fn(() => ({ duration: jest.fn() })),
		Easing: { bezier: jest.fn() },
		...Object.fromEntries(
			'FadeIn FadeOut SlideInLeft SlideOutLeft SlideInRight SlideOutRight SlideInDown SlideOutDown'
				.split(' ')
				.map((name) => [name, animation])
		),
	};
});
jest.mock('@wcpos/components/keyboard-controller', () => ({ KeyboardAvoidingView: () => null }));
jest.mock('react-native-safe-area-context', () => ({
	useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
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

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('expo-haptics', () => ({}));
jest.mock('@wcpos/components/icon', () => ({
	Icon: ({ name, className }: { name: string; className?: string }) => {
		const { TextClassContext } = jest.requireActual('@wcpos/components/text');
		const { cn } = jest.requireActual('@wcpos/components/lib/utils');
		return <i data-icon={name} data-classes={cn(React.useContext(TextClassContext), className)} />;
	},
}));
jest.mock('@wcpos/components/loader', () => ({ Loader: () => null }));
// The table's pulse row is native motion; the panel only reads the head recipe.
jest.mock('@wcpos/components/table', () => ({ TABLE_HEAD_TEXT: 'head' }));
jest.mock('../../../../../contexts/translations', () => ({ useT: () => (key: string) => key }));
const mockLocation = {
	rates: [{ id: 1, name: 'VAT', rate: '20.0000', class: 'standard', country: 'GB' }],
	taxBasedOn: 'base',
	addressUsed: 'base',
	location: { country: 'GB', state: '', city: '', postcode: '' },
	hasOrder: false,
	vatExempt: false,
};
jest.mock('../../../contexts/tax-rates', () => ({
	useTaxLocation: () => mockLocation,
	useTaxSettings: () => ({ allRates: mockLocation.rates }),
}));
jest.mock('../../../pos/hooks/use-cart-config', () => ({
	useCartConfig: () =>
		jest.requireActual('@wcpos/order-math').createCartConfig({
			rates: mockLocation.rates,
			allRates: mockLocation.rates,
			calcTaxes: true,
			pricesIncludeTax: false,
			taxRoundAtSubtotal: false,
			dp: 2,
			shippingTaxClass: 'standard',
			taxClassSlugs: ['standard'],
			calcDiscountsSequentially: false,
		}),
}));
jest.mock('../../../contexts/extra-data', () => ({ useExtraData: () => ({ extraData: {} }) }));
jest.mock('@wcpos/query', () => ({
	useDocField: () => [{ slug: 'standard', name: 'Standard rate' }],
}));
jest.mock('../../../hooks/use-number-format', () => ({
	useNumberFormat: () => ({ format: (value: number) => String(value) }),
}));

beforeEach(() => {
	jest.useFakeTimers();
	mockPush.mockClear();
	mockLocation.hasOrder = false;
	mockLocation.vatExempt = false;
	mockLocation.taxBasedOn = 'base';
	mockLocation.addressUsed = 'base';
});
afterEach(() => jest.useRealTimers());

// The anchored card (the POS on a tablet or desktop) and the phone sheet.
describe.each([false, true])('phone: %s', (phone) => {
	const renderTaxBasedOn = () =>
		render(
			<DeviceScope phone={phone}>
				<TaxBasedOn />
			</DeviceScope>
		);

	// Revert: the hover card opens 700 ms after a mouse rests on the trigger, which is how it
	// came to cover the first product tiles in the POS (monorepo#2284).
	it('a pointer resting on the trigger does not open the tax rates', () => {
		renderTaxBasedOn();
		const trigger = screen.getByTestId('tax-based-on-trigger');
		fireEvent.pointerOver(trigger, { pointerType: 'mouse' });
		fireEvent.pointerEnter(trigger, { pointerType: 'mouse' });
		act(() => jest.advanceTimersByTime(1000));
		expect(screen.queryByTestId('tax-based-on-content')).toBeNull();
	});

	it('a press opens the tax rates, and View all closes them before navigating', () => {
		renderTaxBasedOn();
		fireEvent.click(screen.getByTestId('tax-based-on-trigger'));
		expect(screen.getByTestId('tax-based-on-content')).toBeTruthy();
		fireEvent.click(screen.getByTestId('tax-based-on-view-all'));
		act(() => jest.advanceTimersByTime(1000));
		expect(mockPush).toHaveBeenCalledWith({
			pathname: '/(app)/(modals)/tax-rates',
			params: { applies: '1', country: 'GB', state: '', city: '', postcode: '' },
		});
		expect(screen.queryByTestId('tax-based-on-content')).toBeNull();
	});

	it('the setting links to Settings › Tax, closing the panel first', () => {
		renderTaxBasedOn();
		fireEvent.click(screen.getByTestId('tax-based-on-trigger'));
		expect(screen.getByText('common.shop_address')).toBeTruthy();
		expect(screen.getByText('United Kingdom (UK)')).toBeTruthy();
		expect(screen.getByText('Standard rate')).toBeTruthy();
		expect(screen.getAllByText('20%')).toHaveLength(2);
		fireEvent.click(screen.getByTestId('tax-based-on-change-setting'));
		act(() => jest.advanceTimersByTime(1000));
		expect(mockPush).toHaveBeenCalledWith('/settings/tax');
		expect(screen.queryByTestId('tax-based-on-content')).toBeNull();
	});

	it('an order with no billing address breaks the chain at the address', () => {
		mockLocation.hasOrder = true;
		mockLocation.taxBasedOn = 'billing';
		mockLocation.addressUsed = 'billing';
		const { location, rates } = mockLocation;
		mockLocation.location = { country: '', state: '', city: '', postcode: '' };
		// Nothing matched: a worldwide rate on an empty address would not be a failure.
		mockLocation.rates = [];
		try {
			renderTaxBasedOn();
			const nodes = screen.getByTestId('tax-based-on-trigger').querySelectorAll('[data-classes]');
			expect(nodes).toHaveLength(3);
			for (const node of nodes)
				expect(node.getAttribute('data-classes')).toContain(
					node.getAttribute('data-icon') === 'chevronDown' ? 'text-muted-foreground' : 'text-bad'
				);
			fireEvent.click(screen.getByTestId('tax-based-on-trigger'));
			expect(screen.getByText('common.order_has_no_billing_address')).toBeTruthy();
			expect(screen.getByText('common.none')).toBeTruthy();
		} finally {
			mockLocation.location = location;
			mockLocation.rates = rates;
		}
	});

	it('says so when the current order is tax exempt', () => {
		renderTaxBasedOn();
		fireEvent.click(screen.getByTestId('tax-based-on-trigger'));
		expect(screen.queryByText('common.order_tax_exempt')).toBeNull();
		cleanup();
		mockLocation.hasOrder = true;
		mockLocation.vatExempt = true;
		renderTaxBasedOn();
		fireEvent.click(screen.getByTestId('tax-based-on-trigger'));
		expect(screen.getByText('common.order_tax_exempt')).toBeTruthy();
	});

	it('on the Products screen (no order) the address is the shop base whatever the setting', () => {
		mockLocation.taxBasedOn = 'billing';
		renderTaxBasedOn();
		fireEvent.click(screen.getByTestId('tax-based-on-trigger'));
		const panel = within(screen.getByTestId('tax-based-on-content'));
		expect(panel.getByText('common.customer_billing_address')).toBeTruthy();
		expect(panel.getByText('common.shop_address')).toBeTruthy();
	});
});
