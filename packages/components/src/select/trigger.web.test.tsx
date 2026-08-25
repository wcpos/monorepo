import * as React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';

import { EMPTY_OPTION } from './controlled-value';
import { shouldToggleFromPress } from './pointer-type';
import { Trigger, Value } from './trigger.web';

const mockOnOpenChange = jest.fn();
let mockRootValue: { value: string; label: string } | undefined;

jest.mock('@rn-primitives/select', () => ({
	useRootContext: () => ({ open: false, onOpenChange: mockOnOpenChange, value: mockRootValue }),
}));

// Ships untranspiled JSX, which this package's ts-only transform can't parse.
jest.mock('@rn-primitives/slot', () => ({
	Slot: ({ children }: { children: React.ReactNode }) => children,
}));

/**
 * Radix's real Trigger is `asChild`, so it renders its child with its own
 * handlers merged in. The handlers under test here are ours, so the stub keeps
 * the child and drops Radix's — that isolates the trigger's own decision about
 * when to toggle from Radix's mouse/keyboard paths.
 */
jest.mock('@radix-ui/react-select', () => ({
	Trigger: ({ children }: { children: React.ReactNode }) => children,
}));

/**
 * jsdom has no PointerEvent, and React reads `pointerType` straight off the
 * native event — so a MouseEvent carrying a `pointerType` is the same shape
 * React sees in a browser.
 */
function firePointerEvent(element: Element, type: string, pointerType: string) {
	const event = new MouseEvent(type, { bubbles: true, cancelable: true, button: 0 });
	Object.defineProperty(event, 'pointerType', { value: pointerType });
	fireEvent(element, event);
}

function renderTrigger() {
	render(<Trigger testID="trigger" />);
	return screen.getByTestId('trigger');
}

beforeEach(() => {
	mockOnOpenChange.mockClear();
	mockRootValue = undefined;
});

describe('web Select trigger — pointer type gating (#863)', () => {
	/**
	 * The iPadOS regression. WebKit dispatches the compatibility `click` after a
	 * touch with `pointerType: 'mouse'`, so a trigger that reads the click's own
	 * pointer type sees a mouse click and never opens — and Radix's own touch
	 * path (`onClick`) is the one react-native-web's Pressable overwrites, so
	 * nothing else opens it either.
	 */
	it('opens when WebKit reports the post-touch click as a mouse click', () => {
		const trigger = renderTrigger();

		firePointerEvent(trigger, 'pointerdown', 'touch');
		firePointerEvent(trigger, 'click', 'mouse');

		expect(mockOnOpenChange).toHaveBeenCalledTimes(1);
		expect(mockOnOpenChange).toHaveBeenCalledWith(true);
	});

	it('opens on touch in engines that report the click as a touch (Chromium)', () => {
		const trigger = renderTrigger();

		firePointerEvent(trigger, 'pointerdown', 'touch');
		firePointerEvent(trigger, 'click', 'touch');

		expect(mockOnOpenChange).toHaveBeenCalledTimes(1);
		expect(mockOnOpenChange).toHaveBeenCalledWith(true);
	});

	it('opens on pen input', () => {
		const trigger = renderTrigger();

		firePointerEvent(trigger, 'pointerdown', 'pen');
		firePointerEvent(trigger, 'click', 'mouse');

		expect(mockOnOpenChange).toHaveBeenCalledTimes(1);
	});

	it('stays out of the way of a mouse click (Radix opens it on pointerdown)', () => {
		const trigger = renderTrigger();

		firePointerEvent(trigger, 'pointerdown', 'mouse');
		firePointerEvent(trigger, 'click', 'mouse');

		expect(mockOnOpenChange).not.toHaveBeenCalled();
	});

	it('stays out of the way of keyboard activation (Radix opens it on keydown)', () => {
		const trigger = renderTrigger();

		fireEvent.keyDown(trigger, { key: 'Enter' });
		fireEvent.keyUp(trigger, { key: 'Enter' });
		// Browsers also synthesise a click for keyboard activation of a button.
		firePointerEvent(trigger, 'click', '');

		expect(mockOnOpenChange).not.toHaveBeenCalled();
	});

	it('does not let a previous touch leak into a later keyboard activation', () => {
		const trigger = renderTrigger();

		firePointerEvent(trigger, 'pointerdown', 'touch');
		firePointerEvent(trigger, 'click', 'mouse');
		expect(mockOnOpenChange).toHaveBeenCalledTimes(1);

		fireEvent.keyDown(trigger, { key: 'Enter' });
		fireEvent.keyUp(trigger, { key: 'Enter' });
		firePointerEvent(trigger, 'click', '');

		expect(mockOnOpenChange).toHaveBeenCalledTimes(1);
	});

	it.each(['Enter', ' '])(
		'does not let an aborted touch leak into a later %j activation',
		(key) => {
			const trigger = renderTrigger();

			firePointerEvent(trigger, 'pointerdown', 'touch');
			fireEvent.keyDown(trigger, { key });
			fireEvent.keyUp(trigger, { key });
			firePointerEvent(trigger, 'click', '');

			expect(mockOnOpenChange).not.toHaveBeenCalled();
		}
	);

	it('does nothing when disabled', () => {
		render(<Trigger testID="disabled-trigger" disabled />);
		const trigger = screen.getByTestId('disabled-trigger');

		firePointerEvent(trigger, 'pointerdown', 'touch');
		firePointerEvent(trigger, 'click', 'mouse');

		expect(mockOnOpenChange).not.toHaveBeenCalled();
	});

	it('still calls a caller-supplied onPointerDown', () => {
		const onPointerDown = jest.fn();
		render(<Trigger testID="pd-trigger" onPointerDown={onPointerDown} />);

		firePointerEvent(screen.getByTestId('pd-trigger'), 'pointerdown', 'touch');

		expect(onPointerDown).toHaveBeenCalledTimes(1);
	});

	it('still calls a caller-supplied onKeyDown', () => {
		const onKeyDown = jest.fn();
		render(<Trigger testID="kd-trigger" onKeyDown={onKeyDown} />);

		fireEvent.keyDown(screen.getByTestId('kd-trigger'), { key: 'Enter' });

		expect(onKeyDown).toHaveBeenCalledTimes(1);
	});
});

describe('web Select value — placeholder', () => {
	it('shows the label of the current selection', () => {
		mockRootValue = { value: 'pending', label: 'Pending' };
		render(<Value placeholder="Status" />);

		expect(screen.getByText('Pending')).toBeTruthy();
	});

	/**
	 * The cleared selection. A controlled select clears to `EMPTY_OPTION` rather than
	 * `undefined` so Radix stays controlled, which means "no selection" reaches this
	 * component as a defined Option with an empty value — reading `label ?? placeholder`
	 * would render its blank label and the trigger would lose its placeholder.
	 */
	it('shows the placeholder for a cleared selection', () => {
		mockRootValue = EMPTY_OPTION;
		render(<Value placeholder="Status" />);

		expect(screen.getByText('Status')).toBeTruthy();
	});

	it('shows the placeholder when there is no value at all', () => {
		render(<Value placeholder="Status" />);

		expect(screen.getByText('Status')).toBeTruthy();
	});
});

describe('shouldToggleFromPress', () => {
	it.each(['touch', 'pen'])('toggles for %s', (pointerType) => {
		expect(shouldToggleFromPress(pointerType)).toBe(true);
	});

	it.each([['mouse'], [null], [undefined], ['']])('does not toggle for %s', (pointerType) => {
		expect(shouldToggleFromPress(pointerType)).toBe(false);
	});
});
