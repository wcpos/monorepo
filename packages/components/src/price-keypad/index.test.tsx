/** @jest-environment jsdom */
import * as React from 'react';

import { act, fireEvent, render, screen } from '@testing-library/react';

import { DeviceScope } from '../lib/device';
import { PriceKeypad, type PriceKeypadHandle, type PriceKeypadProps } from './index';

// The keypad is the web presentation: load the web primitive (Radix under react-native-web),
// as the quantity keypad's suite does.
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
	backspace: 'Delete last digit',
	done: 'Done',
	discount: (percent: number) => `Discount (${percent}%)`,
	discountKey: (percent: number) => `−${percent}%`,
};
const format = (value: number) => `£${value.toFixed(2)}`;
const onChange = jest.fn();
beforeEach(() => {
	jest.useFakeTimers();
	onChange.mockClear();
});
afterEach(() => jest.useRealTimers());

async function open(props: Partial<PriceKeypadProps> = {}, phone = false) {
	render(
		<DeviceScope phone={phone}>
			<PriceKeypad
				testID="cart-price"
				value={3.2}
				format={format}
				discounts={[5, 10, 15]}
				labels={labels}
				onChange={onChange}
				{...props}
			/>
		</DeviceScope>
	);
	await press('cart-price');
}
/** A press, then the timers and the promise Floating UI positions the panel with. */
async function press(id: string) {
	fireEvent.click(screen.getByTestId(id));
	await act(async () => jest.runOnlyPendingTimers());
}
const shown = () => screen.getByTestId('price-keypad-value').textContent;
const display = () => screen.getByTestId('price-keypad-value').parentElement!.textContent;
const isOpen = () => screen.queryByTestId('price-keypad-value') !== null;
const panelNode = () => screen.getByTestId('price-keypad-value').closest('[tabindex]');
const panelKey = (key: string) => fireEvent.keyDown(document.activeElement!, { key });

it('rests as the formatted price and opens on a press, with every key named', async () => {
	render(
		<DeviceScope phone={false}>
			<PriceKeypad
				testID="cart-price"
				value={3.2}
				format={format}
				discounts={[5, 10, 15]}
				labels={labels}
				onChange={onChange}
			/>
		</DeviceScope>
	);
	expect(screen.getByTestId('cart-price')).toHaveTextContent('£3.20');
	expect(isOpen()).toBe(false);
	await press('cart-price');
	expect(shown()).toBe('£3.20');
	for (const digit of '0123456789') {
		expect(screen.getByTestId(`numpad-key-${digit}`)).toHaveAttribute('aria-label', digit);
	}
	expect(screen.getByTestId('numpad-key-decimal')).toHaveAttribute('aria-label', '.');
	expect(screen.getByTestId('numpad-key-backspace')).toHaveAttribute(
		'aria-label',
		'Delete last digit'
	);
	expect(screen.getByTestId('numpad-done-button')).toHaveAttribute('aria-label', 'Done');
	const quick = screen.getByTestId('cart-price-discount-10');
	expect(quick).toHaveAttribute('aria-label', 'Discount (10%)');
	expect(quick).toHaveTextContent('−10%');
});

it('seven rows: display, quick keys, three of digits, separator 0 ⌫, ✓; no quick row without discounts', async () => {
	await open();
	expect(panelNode()!.children).toHaveLength(7);
	await press('numpad-done-button');
	document.body.innerHTML = '';
	await open({ discounts: [] });
	expect(panelNode()!.children).toHaveLength(6);
	expect(screen.queryByTestId('cart-price-discount-5')).toBeNull();
});

it('draws three quick keys at most', async () => {
	await open({ discounts: [5, 10, 15, 20] });
	expect(screen.queryByTestId('cart-price-discount-20')).toBeNull();
});

it('fewer quick keys stretch to fill the row, as ✓ fills its own', async () => {
	await open({ discounts: [10] });
	expect(screen.getByTestId('cart-price-discount-10')).toHaveStyle({ width: '192px' });
	await press('numpad-done-button');
	document.body.innerHTML = '';
	await open({ discounts: [5, 10] });
	expect(screen.getByTestId('cart-price-discount-5')).toHaveStyle({ width: '96px' });
	expect(screen.getByTestId('cart-price-discount-10')).toHaveStyle({ width: '96px' });
	await press('numpad-done-button');
	document.body.innerHTML = '';
	await open();
	expect(screen.getByTestId('cart-price-discount-15')).toHaveStyle({ width: '64px' });
});

it('typing replaces the price, and ✓ commits it', async () => {
	await open();
	await press('numpad-key-4');
	await press('numpad-key-decimal');
	await press('numpad-key-5');
	expect(shown()).toBe('4.5');
	expect(onChange).not.toHaveBeenCalled();
	await press('numpad-done-button');
	expect(onChange).toHaveBeenCalledTimes(1);
	expect(onChange).toHaveBeenCalledWith(4.5);
	expect(isOpen()).toBe(false);
});

it('a quick key shows the derivation and the discounted price, and ✓ commits it', async () => {
	await open();
	await press('cart-price-discount-10');
	expect(shown()).toBe('£2.88');
	expect(display()).toContain('£3.20 −10 %');
	expect(screen.getByTestId('cart-price-discount-10')).toHaveAttribute('aria-pressed', 'true');
	await press('numpad-done-button');
	expect(onChange).toHaveBeenCalledWith(2.88);
});

it('the lit key pressed again shows the stored price, and ✓ writes nothing', async () => {
	await open();
	await press('cart-price-discount-10');
	await press('cart-price-discount-10');
	expect(shown()).toBe('£3.20');
	expect(display()).not.toContain('−10 %');
	await press('numpad-done-button');
	expect(onChange).not.toHaveBeenCalled();
});

it('a digit after a quick key starts fresh', async () => {
	await open();
	await press('cart-price-discount-5');
	await press('numpad-key-2');
	expect(shown()).toBe('2');
	expect(screen.getByTestId('cart-price-discount-5')).toHaveAttribute('aria-pressed', 'false');
	await press('numpad-done-button');
	expect(onChange).toHaveBeenCalledWith(2);
});

it('0 is a price: a free line commits', async () => {
	await open();
	await press('numpad-key-0');
	await press('numpad-done-button');
	expect(onChange).toHaveBeenCalledWith(0);
});

it('Escape closes and keeps the stored price', async () => {
	await open();
	await press('numpad-key-9');
	fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
	await act(async () => jest.runOnlyPendingTimers());
	expect(isOpen()).toBe(false);
	expect(onChange).not.toHaveBeenCalled();
});

it('a press outside commits what was typed', async () => {
	await open();
	await press('numpad-key-7');
	await press('overlay-scrim');
	expect(isOpen()).toBe(false);
	expect(onChange).toHaveBeenCalledWith(7);
});

it('the decimal key types the store separator, once', async () => {
	await open({ decimalSeparator: ',' });
	expect(screen.getByTestId('numpad-key-decimal')).toHaveTextContent(',');
	await press('numpad-key-1');
	await press('numpad-key-decimal');
	await press('numpad-key-decimal');
	await press('numpad-key-5');
	expect(shown()).toBe('1,5');
	await press('numpad-done-button');
	expect(onChange).toHaveBeenCalledWith(1.5);
});

it("a discount rounds to the currency's places", async () => {
	await open({ decimals: 0 });
	await press('cart-price-discount-15');
	expect(shown()).toBe('£3.00');
	await press('numpad-done-button');
	expect(onChange).toHaveBeenCalledWith(3);
});

it("stops typing at the currency's places", async () => {
	await open({ decimals: 2 });
	for (const key of ['1', 'decimal', '2', '3', '4']) await press(`numpad-key-${key}`);
	expect(shown()).toBe('1.23');
});

it('no decimal key for a currency without places, and the physical separator is ignored', async () => {
	await open({ decimals: 0 });
	expect(screen.queryByTestId('numpad-key-decimal')).toBeNull();
	expect(screen.getByTestId('numpad-key-0')).toHaveStyle({ width: '128px' });
	for (const key of ['1', '.', ',', '5']) panelKey(key);
	expect(shown()).toBe('15');
});

it('opened and closed with ✓, nothing pressed: nothing is written', async () => {
	await open();
	await press('numpad-done-button');
	expect(onChange).not.toHaveBeenCalled();
});

it('opened and pressed outside, nothing pressed: nothing is written', async () => {
	await open();
	await press('overlay-scrim');
	expect(isOpen()).toBe(false);
	expect(onChange).not.toHaveBeenCalled();
});

it('typing exactly the stored price writes nothing', async () => {
	await open();
	for (const key of ['3', 'decimal', '2']) await press(`numpad-key-${key}`);
	await press('numpad-done-button');
	expect(onChange).not.toHaveBeenCalled();
});

it('a lone decimal press is not typing: a stray tap never zeroes the line', async () => {
	await open();
	await press('numpad-key-decimal');
	await press('numpad-done-button');
	expect(onChange).not.toHaveBeenCalled();
});

it('the physical keyboard types, and Enter commits', async () => {
	await open({ decimalSeparator: ',' });
	expect(document.activeElement).toBe(panelNode());
	for (const key of ['2', '.', '5', '0', 'Backspace']) panelKey(key);
	expect(shown()).toBe('2,5');
	panelKey('Enter');
	await act(async () => jest.runOnlyPendingTimers());
	expect(onChange).toHaveBeenCalledWith(2.5);
	expect(isOpen()).toBe(false);
});

it('grows down from the price, and up when the panel would leave the window', async () => {
	const rect = jest.spyOn(HTMLElement.prototype, 'getBoundingClientRect');
	rect.mockReturnValue({ top: 100, height: 44 } as DOMRect);
	await open();
	const panel = () => screen.getByTestId('price-keypad-value').closest('[data-grow]');
	expect(panel()).toHaveAttribute('data-grow', 'down');
	await press('numpad-done-button');

	rect.mockReturnValue({ top: window.innerHeight - 200, height: 44 } as DOMRect);
	await press('cart-price');
	expect(panel()).toHaveAttribute('data-grow', 'up');
	// The quick keys and digits above, the display last, over the price.
	const rows = Array.from(panelNode()!.children);
	expect(rows[0].querySelector('[data-testid="cart-price-discount-5"]')).not.toBeNull();
	expect(rows[rows.length - 1].querySelector('[data-testid="price-keypad-value"]')).not.toBeNull();
	rect.mockRestore();
});

it('on a phone it is the sheet, with Done across the last row', async () => {
	await open({}, true);
	expect(screen.getByTestId('numpad-done-button')).toHaveTextContent('Done');
	await press('cart-price-discount-5');
	await press('numpad-done-button');
	expect(onChange).toHaveBeenCalledWith(3.04);
});

it('dismiss() closes and keeps the stored price (a scanner burst)', async () => {
	const ref = React.createRef<PriceKeypadHandle>();
	await open({ ref });
	await press('numpad-key-4');
	await act(async () => ref.current?.dismiss());
	expect(isOpen()).toBe(false);
	expect(onChange).not.toHaveBeenCalled();
});

it('disabled: nothing opens', async () => {
	await open({ disabled: true });
	expect(isOpen()).toBe(false);
});
