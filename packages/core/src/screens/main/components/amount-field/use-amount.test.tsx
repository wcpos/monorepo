/** @jest-environment jsdom */
import * as React from 'react';

import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';

import { DeviceScope } from '@wcpos/components/lib/device';

import { AmountField } from './amount-field.web';
import { useAmount } from './use-amount';

// Exercise the real keypad; only its platform dependencies and store source are faked.
jest.mock('@rn-primitives/popover', () =>
	jest.requireActual(
		require.resolve('@rn-primitives/popover').replace(/index\.js$/, 'popover.web.js')
	)
);
jest.mock('react-native-reanimated', () => {
	const animation = { duration: () => animation, easing: () => animation };
	return new Proxy(
		{ __esModule: true, Easing: { bezier: jest.fn() } },
		{ get: (target, key) => Reflect.get(target, key) ?? animation }
	);
});
jest.mock('@wcpos/components/keyboard-controller', () => ({ KeyboardAvoidingView: () => null }));
jest.mock('react-native-safe-area-context', () => ({
	useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('@wcpos/components/icon', () => ({ Icon: () => null }));
jest.mock('@wcpos/components/loader', () => ({ Loader: () => null }));
jest.mock('../../../../contexts/app-state', () => ({ useAppState: () => ({ store: {} }) }));
jest.mock('../../../../contexts/translations', () => ({ useT: () => (key: string) => key }));
const mockStore = { decimal_qty: false, price_decimal_sep: '.', price_num_decimals: 2 };
jest.mock('@wcpos/query', () => ({
	useDocField: (_doc: unknown, select: (store: typeof mockStore) => unknown) => select(mockStore),
	useRecordField: () => undefined,
}));

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

it.each([
	[false, 0],
	[true, 6],
] as const)(
	'decimal_qty %s gives a quantity %d entry places and the matching decimal key',
	async (enabled, places) => {
		mockStore.decimal_qty = enabled;
		const props = { kind: 'quantity', value: 1, onCommit: jest.fn() } as const;
		const { result } = renderHook(() => useAmount(props));
		render(
			<DeviceScope phone={false}>
				<AmountField {...props} testID="quantity" />
			</DeviceScope>
		);
		fireEvent.click(screen.getByTestId('quantity'));
		await act(async () => jest.runOnlyPendingTimers());
		expect(screen.getByTestId('quantity-keypad-value')).toBeTruthy();
		expect(screen.queryByTestId('keypad-key-decimal') !== null).toBe(enabled);
		expect(result.current.entryPlaces).toBe(places);
		// Display and commit rounding keep the full places either way: a stored 1.5 still reads 1.5.
		expect(result.current.places).toBe(6);
		expect(result.current.format(1.5)).toContain('1.5');
	}
);
