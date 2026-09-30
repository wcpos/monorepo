/** @jest-environment jsdom */
import * as React from 'react';

import { act, fireEvent, render, screen } from '@testing-library/react';

import { DeviceScope } from '@wcpos/components/lib/device';

import { TaxBasedOn } from './index';

// jest resolves the native primitives; hover versus press is a web question, so load the web
// builds (Radix under react-native-web). The hover card too, so a revert to it is judged on
// how it behaves in a browser.
jest.mock('@rn-primitives/popover', () =>
	jest.requireActual(
		require.resolve('@rn-primitives/popover').replace(/index\.js$/, 'popover.web.js')
	)
);
jest.mock('@rn-primitives/hover-card', () =>
	jest.requireActual(
		require.resolve('@rn-primitives/hover-card').replace(/index\.js$/, 'hover-card.web.js')
	)
);
// The overlay shell's native motion and insets; the web path never uses them.
jest.mock('react-native-reanimated', () => {
	const animation = { duration: jest.fn().mockReturnThis(), easing: jest.fn().mockReturnThis() };
	return {
		__esModule: true,
		default: { View: () => null },
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
const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('expo-haptics', () => ({}));
jest.mock('@wcpos/components/icon', () => ({ Icon: () => null }));
jest.mock('@wcpos/components/loader', () => ({ Loader: () => null }));
jest.mock('@wcpos/components/table', () =>
	Object.fromEntries(
		'Table TableBody TableCell TableHead TableHeader TableRow'
			.split(' ')
			.map((name) => [name, ({ children }: React.PropsWithChildren) => children])
	)
);
jest.mock('../../../../../contexts/translations', () => ({ useT: () => (key: string) => key }));
jest.mock('../../../contexts/tax-rates', () => ({
	useTaxLocation: () => ({
		rates: [{ id: 1, name: 'VAT', rate: '20.0000', class: 'standard' }],
		taxBasedOn: 'base',
		location: { country: 'GB' },
	}),
}));

beforeEach(() => {
	jest.useFakeTimers();
	mockPush.mockClear();
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
		fireEvent.click(screen.getByText('common.view_all_tax_rates'));
		act(() => jest.advanceTimersByTime(1000));
		expect(mockPush).toHaveBeenCalledWith('/(app)/(modals)/tax-rates');
		expect(screen.queryByTestId('tax-based-on-content')).toBeNull();
	});
});
