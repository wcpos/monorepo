/** @jest-environment jsdom */
import * as React from 'react';

import { act, fireEvent, render, screen } from '@testing-library/react';

import { DeviceScope } from '../lib/device';
import { QuantityKeypad, type QuantityKeypadHandle, type QuantityKeypadProps } from './index';

// The keypad is the web presentation: load the web primitive (Radix under react-native-web),
// as the popover's outside-press suite does.
jest.mock('@rn-primitives/popover', () =>
	jest.requireActual(
		require.resolve('@rn-primitives/popover').replace(/index\.js$/, 'popover.web.js')
	)
);
jest.mock('react-native-reanimated', () => {
	const animation = { duration: () => animation, easing: () => animation };
	const mod: Record<string | symbol, unknown> = {
		__esModule: true,
		Keyframe: jest.fn(() => ({ duration: jest.fn() })),
		Easing: { bezier: jest.fn() },
	};
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
/** A pointer press as a browser makes it: focus lands on the key, then the click. */
async function tap(id: string) {
	screen.getByTestId(id).focus();
	await press(id);
}
const panelNode = () => screen.getByTestId('quantity-keypad-value').closest('[tabindex]');
const shown = () => screen.getByTestId('quantity-keypad-value').textContent;
const isOpen = () => screen.queryByTestId('quantity-keypad-value') !== null;
const panelKey = (keyName: string) => fireEvent.keyDown(document.activeElement!, { key: keyName });

it('opens on a press, with every key named and carrying its testID', async () => {
	await open();
	expect(screen.getByTestId('quantity-keypad-value')).toHaveTextContent('3');
	for (const digit of '0123456789') {
		expect(screen.getByTestId(`keypad-key-${digit}`)).toHaveAttribute('aria-label', digit);
	}
	expect(screen.getByTestId('keypad-key-decrease')).toHaveAttribute('aria-label', 'One fewer');
	expect(screen.getByTestId('keypad-key-increase')).toHaveAttribute('aria-label', 'One more');
	expect(screen.getByTestId('keypad-key-backspace')).toHaveAttribute(
		'aria-label',
		'Delete last digit'
	);
	expect(screen.getByTestId('keypad-key-done')).toHaveAttribute('aria-label', 'Done');
	expect(screen.getByTestId('keypad-key-decimal')).toHaveAttribute('aria-label', '.');
});

it('six rows: the stepper, three of digits, separator 0 ⌫, and ✓ across the panel', async () => {
	await open();
	const rows = Array.from(panelNode()!.children);
	expect(rows).toHaveLength(6);
	const ids = (row: Element) =>
		Array.from(row.querySelectorAll('[data-testid]')).map((node) =>
			node.getAttribute('data-testid')
		);
	expect(ids(rows[4])).toEqual(['keypad-key-decimal', 'keypad-key-0', 'keypad-key-backspace']);
	expect(ids(rows[5])).toEqual(['keypad-key-done']);
});

it('the decimal key is labelled with the store separator and types a fraction once', async () => {
	await open({ value: 3, decimalSeparator: ',' });
	expect(screen.getByTestId('keypad-key-decimal')).toHaveTextContent(',');
	await press('keypad-key-1');
	await press('keypad-key-decimal');
	await press('keypad-key-decimal');
	await press('keypad-key-5');
	expect(shown()).toBe('1,5');
	await press('keypad-key-done');
	expect(onChange).toHaveBeenCalledWith(1.5);
});

it('− at 1 is the trash: it removes the line and closes', async () => {
	await open({ value: 1 });
	const trash = screen.getByTestId('keypad-key-decrease');
	expect(trash).toHaveAttribute('aria-label', 'Remove');
	expect(trash.querySelector('[data-icon="delete"]')).not.toBeNull();
	await press('keypad-key-decrease');
	expect(onRemove).toHaveBeenCalledTimes(1);
	expect(onChange).not.toHaveBeenCalled();
	expect(isOpen()).toBe(false);
});

it('+ at 3 commits 4 at once and stays open on 4', async () => {
	await open({ value: 3 });
	await press('keypad-key-increase');
	expect(onChange).toHaveBeenCalledWith(4);
	expect(screen.getByTestId('quantity-keypad-value')).toHaveTextContent('4');
	// The stored quantity has not caught up yet; the next step counts from what is shown.
	await press('keypad-key-increase');
	expect(onChange).toHaveBeenLastCalledWith(5);
	expect(isOpen()).toBe(true);
});

it('typing 1 2 replaces the number, and ✓ commits 12', async () => {
	await open({ value: 3 });
	await press('keypad-key-1');
	await press('keypad-key-2');
	expect(screen.getByTestId('quantity-keypad-value')).toHaveTextContent('12');
	expect(onChange).not.toHaveBeenCalled();
	await press('keypad-key-done');
	expect(onChange).toHaveBeenCalledTimes(1);
	expect(onChange).toHaveBeenCalledWith(12);
	expect(isOpen()).toBe(false);
});

it('a line takes more than four whole digits: a cashier is never stopped', async () => {
	await open({ value: 3 });
	for (const digit of '12345') await press(`keypad-key-${digit}`);
	expect(shown()).toBe('12345');
	await press('keypad-key-done');
	expect(onChange).toHaveBeenCalledWith(12345);
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
	await press('keypad-key-9');
	fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
	await act(async () => jest.runOnlyPendingTimers());
	expect(isOpen()).toBe(false);
	expect(onChange).not.toHaveBeenCalled();
});

it('a press outside commits what was typed: typing replaced the number', async () => {
	await open({ value: 3 });
	await press('keypad-key-7');
	await press('overlay-scrim');
	expect(isOpen()).toBe(false);
	expect(onChange).toHaveBeenCalledWith(7);
});

it('a lone 0 commits nothing', async () => {
	await open({ value: 3 });
	await press('keypad-key-0');
	await press('keypad-key-done');
	expect(onChange).not.toHaveBeenCalled();
});

it('grows down from the box, and up when the panel would leave the window', async () => {
	const rect = jest.spyOn(HTMLElement.prototype, 'getBoundingClientRect');
	rect.mockReturnValue({ top: 100, height: 36 } as DOMRect);
	await open();
	const panel = () => screen.getByTestId('quantity-keypad-value').closest('[data-grow]');
	expect(panel()).toHaveAttribute('data-grow', 'down');
	await press('keypad-key-done');

	rect.mockReturnValue({ top: window.innerHeight - 100, height: 36 } as DOMRect);
	await press('cart-quantity-input');
	expect(panel()).toHaveAttribute('data-grow', 'up');
	// Keys above in their usual order, ✓ under them, the stepper row last, over the box.
	const rows = Array.from(panelNode()!.children);
	expect(rows[0].querySelector('[data-testid="keypad-key-1"]')).not.toBeNull();
	expect(rows[rows.length - 2].querySelector('[data-testid="keypad-key-done"]')).not.toBeNull();
	expect(rows[rows.length - 1].querySelector('[data-testid="keypad-key-decrease"]')).not.toBeNull();
	expect(
		rows[rows.length - 1].querySelector('[data-testid="quantity-keypad-value"]')
	).not.toBeNull();
	rect.mockRestore();
});

it('disabled: nothing opens', async () => {
	await open({ disabled: true });
	expect(isOpen()).toBe(false);
});

it('on a phone it is the sheet, with Done in ✓’s place', async () => {
	await open({ value: 2 }, true);
	expect(screen.getByTestId('keypad-key-done')).toHaveTextContent('Done');
	await press('keypad-key-5');
	await press('keypad-key-done');
	expect(onChange).toHaveBeenCalledWith(5);
});

it('Enter after pointer presses is Done, not the last key again', async () => {
	await open({ value: 3 });
	await tap('keypad-key-1');
	await tap('keypad-key-2');
	expect(document.activeElement).toBe(panelNode());
	panelKey('Enter');
	await act(async () => jest.runOnlyPendingTimers());
	expect(onChange).toHaveBeenCalledTimes(1);
	expect(onChange).toHaveBeenCalledWith(12);
});

it('on the phone sheet the panel takes focus, so Enter is Done', async () => {
	await open({ value: 3 }, true);
	await act(async () => jest.advanceTimersByTime(1000)); // the sheet's rise, then its focus
	expect(document.activeElement).toBe(panelNode());
	panelKey('7');
	panelKey('Enter');
	await act(async () => jest.runOnlyPendingTimers());
	expect(onRemove).not.toHaveBeenCalled();
	expect(onChange).toHaveBeenCalledWith(7);
});

it('a typed number equal to the stored one still commits after a step', async () => {
	await open({ value: 3 });
	await press('keypad-key-increase'); // 4 committed, the store has not caught up
	await press('keypad-key-3');
	await press('keypad-key-done');
	expect(onChange.mock.calls).toEqual([[4], [3]]);
});

it('+ and − count from the typed number', async () => {
	await open({ value: 3 });
	await press('keypad-key-5');
	await press('keypad-key-increase');
	expect(onChange).toHaveBeenLastCalledWith(6);
	await press('keypad-key-5');
	await press('keypad-key-decrease');
	expect(onChange).toHaveBeenLastCalledWith(4);
	expect(shown()).toBe('4');
});

it('a typed 1 shows the trash, and − removes without committing the 1', async () => {
	await open({ value: 5 });
	await press('keypad-key-1');
	expect(screen.getByTestId('keypad-key-decrease')).toHaveAttribute('aria-label', 'Remove');
	await press('keypad-key-decrease');
	expect(onRemove).toHaveBeenCalledTimes(1);
	expect(onChange).not.toHaveBeenCalled();
});

it('ArrowUp and ArrowDown step, and ArrowDown stops at 1', async () => {
	await open({ value: 2 });
	panelKey('ArrowUp');
	expect(onChange).toHaveBeenLastCalledWith(3);
	panelKey('ArrowDown');
	panelKey('ArrowDown');
	expect(onChange).toHaveBeenLastCalledWith(1);
	panelKey('ArrowDown');
	expect(onRemove).not.toHaveBeenCalled();
	expect(onChange).toHaveBeenCalledTimes(3);
	expect(isOpen()).toBe(true);
});

it("takes '.' as the decimal key on a ',' store", async () => {
	await open({ value: 3, decimalSeparator: ',' });
	for (const k of ['1', '.', '5']) panelKey(k);
	expect(shown()).toBe('1,5');
});

it('dismiss() closes and keeps the stored quantity (a scanner burst)', async () => {
	const ref = React.createRef<QuantityKeypadHandle>();
	await open({ value: 3, ref });
	await press('keypad-key-4');
	await act(async () => ref.current?.dismiss());
	expect(isOpen()).toBe(false);
	expect(onChange).not.toHaveBeenCalled();
});

it('a step the store refuses is taken back: the stored quantity shows and + counts from it', async () => {
	onChange.mockResolvedValueOnce(false);
	await open({ value: 3 });
	await press('keypad-key-increase');
	expect(onChange).toHaveBeenLastCalledWith(4);
	expect(shown()).toBe('3');
	await press('keypad-key-increase');
	expect(onChange).toHaveBeenLastCalledWith(4);
});

it('a step the store takes (true) stands', async () => {
	onChange.mockResolvedValueOnce(true);
	await open({ value: 3 });
	await press('keypad-key-increase');
	expect(shown()).toBe('4');
	await press('keypad-key-increase');
	expect(onChange).toHaveBeenLastCalledWith(5);
});

describe('a stored quantity that moves while the keypad is open', () => {
	afterEach(() => onChange.mockReset());
	const keypad = (value: number) => (
		<DeviceScope phone={false}>
			<QuantityKeypad
				testID="cart-quantity-input"
				value={value}
				format={String}
				labels={labels}
				onChange={onChange}
				onRemove={onRemove}
			/>
		</DeviceScope>
	);

	it('replaces a stepped number once the step has settled (a later server revert)', async () => {
		const { rerender } = render(keypad(3));
		await press('cart-quantity-input');
		await press('keypad-key-increase');
		expect(shown()).toBe('4');
		// The store takes 4, then the server refuses it and the record goes back to 3.
		await act(async () => rerender(keypad(4)));
		await act(async () => rerender(keypad(3)));
		expect(shown()).toBe('3');
		await press('keypad-key-increase');
		expect(onChange).toHaveBeenLastCalledWith(4);
	});

	it('never clobbers a step still in flight: two fast presses keep both', async () => {
		const writes: ((ok: boolean) => void)[] = [];
		onChange.mockImplementation(() => new Promise((resolve) => writes.push(resolve)));
		const { rerender } = render(keypad(3));
		await press('cart-quantity-input');
		await press('keypad-key-increase');
		await press('keypad-key-increase');
		// The first write catching up while the second is pending.
		await act(async () => rerender(keypad(4)));
		expect(shown()).toBe('5');
		await act(async () => writes.forEach((resolve) => resolve(true)));
		expect(shown()).toBe('5');
		expect(onChange).toHaveBeenLastCalledWith(5);
	});
});

it('a step from a fraction lands on the quantity’s six places', async () => {
	// In floating point 1.015 + 1 is 2.0149999999999997 and 2.3 - 1 is 1.2999999999999998.
	await open({ value: 1.015 });
	await press('keypad-key-increase');
	expect(onChange).toHaveBeenLastCalledWith(2.015);
	await press('keypad-key-increase');
	await press('keypad-key-decrease');
	expect(onChange).toHaveBeenLastCalledWith(2.015);
});

it('a step keeps a line’s own fraction digits', async () => {
	await open({ value: 1.2345 });
	await press('keypad-key-increase');
	expect(onChange).toHaveBeenLastCalledWith(2.2345);
});

describe('without onRemove, a count (stock)', () => {
	const count = (props: Partial<QuantityKeypadProps> = {}) =>
		open({ onRemove: undefined, decimals: 0, ...props });

	it('− at 0 never becomes the trash and does nothing', async () => {
		await count({ value: 0 });
		expect(screen.getByTestId('keypad-key-decrease')).toHaveAttribute('aria-label', 'One fewer');
		await press('keypad-key-decrease');
		expect(onChange).not.toHaveBeenCalled();
		expect(shown()).toBe('0');
	});

	it('− at 1 steps to 0', async () => {
		await count({ value: 1 });
		await press('keypad-key-decrease');
		expect(onChange).toHaveBeenCalledWith(0);
		await press('keypad-key-decrease');
		expect(onChange).toHaveBeenCalledTimes(1);
	});

	it('a negative stock shows, − does nothing, and + steps up from it', async () => {
		await count({ value: -3 });
		expect(shown()).toBe('-3');
		await press('keypad-key-decrease');
		expect(onChange).not.toHaveBeenCalled();
		await press('keypad-key-increase');
		expect(onChange).toHaveBeenCalledWith(-2);
	});

	it('a typed 0 commits', async () => {
		await count({ value: 4 });
		await press('keypad-key-0');
		await press('keypad-key-done');
		expect(onChange).toHaveBeenCalledWith(0);
	});

	it('whole numbers: no decimal key, the physical separator ignored, any number of digits', async () => {
		await count({ value: 4 });
		expect(screen.queryByTestId('keypad-key-decimal')).toBeNull();
		await press('keypad-key-1');
		panelKey('.');
		for (const digit of '2345678') await press(`keypad-key-${digit}`);
		expect(shown()).toBe('12345678');
		await press('keypad-key-done');
		expect(onChange).toHaveBeenCalledWith(12345678);
	});
});

it('in a form, the trigger is named by the form label, then its own number', () => {
	render(
		<DeviceScope phone={false}>
			<QuantityKeypad
				testID="stock"
				value={3}
				format={String}
				labels={labels}
				onChange={onChange}
				labelledBy="stock-label"
			/>
		</DeviceScope>
	);
	const trigger = screen.getByTestId('stock');
	const [label, own] = trigger.getAttribute('aria-labelledby')!.split(' ');
	expect(label).toBe('stock-label');
	expect(trigger.id).toBe(own);
});
