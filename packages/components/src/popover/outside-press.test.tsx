import * as React from 'react';
import { Pressable, Text } from 'react-native';

import { act, fireEvent, render, screen } from '@testing-library/react';
import { toast as sonnerToast } from 'sonner';

import { DeviceScope } from '../lib/device';
import { Toaster } from '../toast/sonner.web';
import { Popover, PopoverContent, PopoverTrigger } from './index';

// What an outside press reaches is a web question: load the web primitive (Radix under
// react-native-web), as the POS footer's tax-based-on suite does.
jest.mock('@rn-primitives/popover', () =>
	jest.requireActual(
		require.resolve('@rn-primitives/popover').replace(/index\.js$/, 'popover.web.js')
	)
);
// The overlay shell's native motion and insets; the web path never uses them.
jest.mock('react-native-reanimated', () => {
	const animation = { duration: () => animation, easing: () => animation };
	const mod: Record<string | symbol, unknown> = { __esModule: true, Easing: { bezier: jest.fn() } };
	return new Proxy(mod, { get: (target, key) => target[key] ?? animation });
});
jest.mock('../keyboard-controller', () => ({ KeyboardAvoidingView: () => null }));
jest.mock('react-native-safe-area-context', () => ({
	useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
// jsdom has no PointerEvent; Radix reads `pointerType` (a touch dismisses on the click, not the pointer-down).
window.PointerEvent ??= class extends MouseEvent {
	pointerType: string;
	constructor(type: string, init: PointerEventInit = {}) {
		super(type, init);
		this.pointerType = init.pointerType ?? '';
	}
} as unknown as typeof PointerEvent;
// sonner captures the pointer on a toast's pointer-down; jsdom has no pointer capture.
Element.prototype.setPointerCapture ??= () => {};

const onTilePress = jest.fn();
beforeEach(() => {
	jest.useFakeTimers();
	onTilePress.mockClear();
});
afterEach(() => jest.useRealTimers());

/** An open popover over a pressable stand-in for a POS product tile. */
function renderOpen(phone: boolean, extra?: React.ReactNode) {
	render(
		<DeviceScope phone={phone}>
			<Popover>
				<PopoverTrigger testID="trigger" />
				<PopoverContent testID="content">
					<Text testID="inside">20% VAT</Text>
				</PopoverContent>
			</Popover>
			<Pressable testID="tile" onPress={onTilePress} />
			{extra}
		</DeviceScope>
	);
	fireEvent.click(screen.getByTestId('trigger'));
	act(() => jest.runOnlyPendingTimers()); // Radix arms its outside listener a tick after mount.
	expect(screen.getByTestId('content')).toBeTruthy();
}

/**
 * jsdom has no layout, so this stands in for the browser's hit test: a press lands on the newest
 * layer portalled over the page whose style covers the viewport and takes pointer events,
 * unless the element belongs to that layer (the panel sits inside it).
 */
function press(element: HTMLElement, pointerType: string) {
	let target = element;
	for (const layer of Array.from(document.body.children).reverse()) {
		if (layer.contains(element)) break;
		const style = getComputedStyle(layer);
		const sides = ['top', 'right', 'bottom', 'left'].map((side) => style.getPropertyValue(side));
		const covers = /absolute|fixed/.test(style.position) && sides.every((v) => v === '0px');
		if (covers && style.pointerEvents !== 'none') {
			target = layer as HTMLElement;
			break;
		}
	}
	pressExactly(target, pointerType);
}

/** The press sequence on exactly this element, past the hit-test stand-in. */
function pressExactly(target: HTMLElement, pointerType: string) {
	fireEvent.pointerDown(target, { pointerType, button: 0 });
	fireEvent.mouseDown(target, { button: 0 });
	fireEvent.pointerUp(target, { pointerType, button: 0 });
	fireEvent.mouseUp(target, { button: 0 });
	fireEvent.click(target, { button: 0 });
	act(() => jest.runOnlyPendingTimers());
}

// The anchored card is where Radix's non-modal popover let the press through; the phone
// sheet's drawn scrim already covered the page (its dismiss is in popover.test.tsx).
it.each(['mouse', 'touch'])('anchored, %s: an outside press closes and presses nothing', (type) => {
	renderOpen(false);
	press(screen.getByTestId('tile'), type);
	expect(screen.queryByTestId('content')).toBeNull();
	expect(onTilePress).not.toHaveBeenCalled();
	press(screen.getByTestId('tile'), type); // The page is live again once it has closed.
	expect(onTilePress).toHaveBeenCalledTimes(1);
});

/**
 * The toaster paints over the outside-press layer because it renders into the body with sonner's
 * own z-index (toaster.web.test.tsx), which the stand-in above cannot model: it knows DOM order,
 * not stacking. So the press goes straight to the action; the real-browser probe on #2313 shows
 * the same press reaching the toast over the layer. Left here is Radix's outside handler, which
 * would close the popover on it.
 */
it.each(['mouse', 'touch'])(
	'anchored, %s: a toast action runs and leaves the popover open',
	(type) => {
		const onUndo = jest.fn();
		renderOpen(false, <Toaster />);
		act(() => {
			sonnerToast('Removed from cart', { action: { label: 'Undo', onClick: onUndo } });
		});
		act(() => jest.runOnlyPendingTimers()); // sonner publishes a toast on a timer.
		pressExactly(document.querySelector<HTMLElement>('[data-sonner-toaster] [data-action]')!, type);
		expect(onUndo).toHaveBeenCalledTimes(1);
		expect(screen.getByTestId('content')).toBeTruthy();
		expect(onTilePress).not.toHaveBeenCalled();
		act(() => {
			sonnerToast.dismiss();
		});
	}
);

describe.each([false, true])('phone: %s', (phone) => {
	it('Escape closes the popover', () => {
		renderOpen(phone);
		fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
		act(() => jest.runOnlyPendingTimers());
		expect(screen.queryByTestId('content')).toBeNull();
	});

	it('a press inside the content leaves it open', () => {
		renderOpen(phone);
		press(screen.getByTestId('inside'), 'mouse');
		expect(screen.getByTestId('content')).toBeTruthy();
	});
});
