/** @jest-environment jsdom */
import * as React from 'react';

import { act, fireEvent, render, screen } from '@testing-library/react';

import { DeviceScope } from '../lib/device';
import { QuantityKeypad, type QuantityKeypadProps } from './index';

// The keypad is the web presentation: load the web primitive (Radix under react-native-web),
// as the popover's outside-press suite does.
jest.mock('@rn-primitives/popover', () =>
	jest.requireActual(
		require.resolve('@rn-primitives/popover').replace(/index\.js$/, 'popover.web.js')
	)
);
jest.mock('react-native-reanimated', () => {
	const animation = { duration: () => animation, easing: () => animation };
	const mod: Record<string | symbol, unknown> = { __esModule: true, Easing: { bezier: jest.fn() } };
	return new Proxy(mod, { get: (target, key) => target[key] ?? animation });
});
jest.mock('../keyboard-controller', () => ({ KeyboardAvoidingView: () => null }));
jest.mock('react-native-safe-area-context', () => ({
	useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('expo-haptics', () => ({ impactAsync: jest.fn() }));
jest.mock('../loader', () => ({ Loader: () => null }));
// The Uniwind/SVG icon's ESM build is not loadable here; the name is what is under test.
jest.mock('../icon', () => ({
	Icon: ({ name }: { name: string }) => <span data-icon={name} />,
}));

const labels = {
	decrease: 'One fewer',
	increase: 'One more',
	remove: 'Remove',
	backspace: 'Delete last digit',
	done: 'Done',
};
const onChange = jest.fn();
const onRemove = jest.fn();
beforeEach(() => {
	jest.useFakeTimers();
	onChange.mockClear();
	onRemove.mockClear();
});
afterEach(() => jest.useRealTimers());

async function open(props: Partial<QuantityKeypadProps> = {}, phone = false) {
	render(
		<DeviceScope phone={phone}>
			<QuantityKeypad
				testID="cart-quantity-input"
				value={3}
				format={String}
				labels={labels}
				onChange={onChange}
				onRemove={onRemove}
				{...props}
			/>
		</DeviceScope>
	);
	await press('cart-quantity-input');
}
/** A press, then the timers and the promise Floating UI positions the panel with. */
async function press(id: string) {
	fireEvent.click(screen.getByTestId(id));
	await act(async () => jest.runOnlyPendingTimers());
}
const isOpen = () => screen.queryByTestId('quantity-keypad-value') !== null;
const panelKey = (keyName: string) => fireEvent.keyDown(document.activeElement!, { key: keyName });

it('opens on a press, with every key named and carrying its testID', async () => {
	await open();
	expect(screen.getByTestId('quantity-keypad-value')).toHaveTextContent('3');
	for (const digit of '0123456789') {
		expect(screen.getByTestId(`numpad-key-${digit}`)).toHaveAttribute('aria-label', digit);
	}
	expect(screen.getByTestId('numpad-key-decrease')).toHaveAttribute('aria-label', 'One fewer');
	expect(screen.getByTestId('numpad-key-increase')).toHaveAttribute('aria-label', 'One more');
	expect(screen.getByTestId('numpad-key-backspace')).toHaveAttribute(
		'aria-label',
		'Delete last digit'
	);
	expect(screen.getByTestId('numpad-done-button')).toHaveAttribute('aria-label', 'Done');
});

it('− at 1 is the trash: it removes the line and closes', async () => {
	await open({ value: 1 });
	const trash = screen.getByTestId('numpad-key-decrease');
	expect(trash).toHaveAttribute('aria-label', 'Remove');
	expect(trash.querySelector('[data-icon="delete"]')).not.toBeNull();
	await press('numpad-key-decrease');
	expect(onRemove).toHaveBeenCalledTimes(1);
	expect(onChange).not.toHaveBeenCalled();
	expect(isOpen()).toBe(false);
});

it('+ at 3 commits 4 at once and stays open on 4', async () => {
	await open({ value: 3 });
	await press('numpad-key-increase');
	expect(onChange).toHaveBeenCalledWith(4);
	expect(screen.getByTestId('quantity-keypad-value')).toHaveTextContent('4');
	// The stored quantity has not caught up yet; the next step counts from what is shown.
	await press('numpad-key-increase');
	expect(onChange).toHaveBeenLastCalledWith(5);
	expect(isOpen()).toBe(true);
});

it('typing 1 2 replaces the number, and ✓ commits 12', async () => {
	await open({ value: 3 });
	await press('numpad-key-1');
	await press('numpad-key-2');
	expect(screen.getByTestId('quantity-keypad-value')).toHaveTextContent('12');
	expect(onChange).not.toHaveBeenCalled();
	await press('numpad-done-button');
	expect(onChange).toHaveBeenCalledTimes(1);
	expect(onChange).toHaveBeenCalledWith(12);
	expect(isOpen()).toBe(false);
});

it('the physical keyboard types, and Enter commits', async () => {
	await open({ value: 3, decimalSeparator: ',' });
	// The panel holds focus, not its first key, so Enter is Done rather than a press of −.
	expect(document.activeElement).toBe(
		screen.getByTestId('quantity-keypad-value').closest('[tabindex="-1"]')
	);
	for (const k of ['2', ',', '5']) panelKey(k);
	expect(screen.getByTestId('quantity-keypad-value')).toHaveTextContent('2,5');
	panelKey('Enter');
	await act(async () => jest.runOnlyPendingTimers());
	expect(onChange).toHaveBeenCalledWith(2.5);
	expect(isOpen()).toBe(false);
});

it('Escape closes and keeps the stored quantity', async () => {
	await open({ value: 3 });
	await press('numpad-key-9');
	fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
	await act(async () => jest.runOnlyPendingTimers());
	expect(isOpen()).toBe(false);
	expect(onChange).not.toHaveBeenCalled();
});

it('a press outside commits what was typed: typing replaced the number', async () => {
	await open({ value: 3 });
	await press('numpad-key-7');
	await press('overlay-scrim');
	expect(isOpen()).toBe(false);
	expect(onChange).toHaveBeenCalledWith(7);
});

it('a lone 0 commits nothing', async () => {
	await open({ value: 3 });
	await press('numpad-key-0');
	await press('numpad-done-button');
	expect(onChange).not.toHaveBeenCalled();
});

it('grows down from the box, and up when the panel would leave the window', async () => {
	const rect = jest.spyOn(HTMLElement.prototype, 'getBoundingClientRect');
	rect.mockReturnValue({ top: 100, height: 36 } as DOMRect);
	await open();
	const panel = () => screen.getByTestId('quantity-keypad-value').closest('[data-grow]');
	expect(panel()).toHaveAttribute('data-grow', 'down');
	await press('numpad-done-button');

	rect.mockReturnValue({ top: window.innerHeight - 100, height: 36 } as DOMRect);
	await press('cart-quantity-input');
	expect(panel()).toHaveAttribute('data-grow', 'up');
	rect.mockRestore();
});

it('disabled: nothing opens', async () => {
	await open({ disabled: true });
	expect(isOpen()).toBe(false);
});

it('on a phone it is the sheet, with Done in ✓’s place', async () => {
	await open({ value: 2 }, true);
	expect(screen.getByTestId('numpad-done-button')).toHaveTextContent('Done');
	await press('numpad-key-5');
	await press('numpad-done-button');
	expect(onChange).toHaveBeenCalledWith(5);
});
