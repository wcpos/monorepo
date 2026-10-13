/** @jest-environment jsdom */
import * as React from 'react';

import { act, createEvent, fireEvent, render, screen } from '@testing-library/react';

// Jest has no platform extensions, so `./hotkeys` is the native file here; eslint resolves it to
// the web one and sees a duplicate.
// eslint-disable-next-line import/no-duplicates
import { Hotkeys as NativeHotkeys } from './hotkeys';
// eslint-disable-next-line import/no-duplicates
import { Hotkeys } from './hotkeys.web';
import { CommandsProvider, registerSurface, resetSurfaces } from '../commands';

// The provider's inputs, as `extensions/commands/provider.test.tsx` mocks them.
const mockLog = jest.fn();
const mockSetCurrentOrderID = jest.fn();
const mockSelectReceipt = jest.fn();
const mockMode = { receiptOrders: new Set<string>(), selectedReceiptOrder: null };
const mockCurrent = { uuid: 'b', payload: { line_items: [{}] } };
const mockOpenOrders = [{ id: 'a' }, { id: 'b' }];

let mockFocused = true;
jest.mock('expo-router', () => ({
	useSegments: () => ['(app)', '(drawer)', '(pos)', '(columns)', 'cart'],
}));
jest.mock('expo-router/react-navigation', () => ({ useIsFocused: () => mockFocused }));
jest.mock('@wcpos/query', () => ({
	useRecordField: <T,>(source: T, select: (value: T) => unknown) => select(source),
}));
jest.mock('../../screens/main/pos/hooks/use-action-context', () => ({
	useActionContext: () => ({ ctx: mockActionCtx }),
}));
const mockActionCtx = Object.freeze({ log: (...args: unknown[]) => mockLog(...args) });
jest.mock('../../screens/main/pos/contexts/current-order/context', () => ({
	useCurrentOrder: () => ({ currentOrderRecord: mockCurrent, openOrders: mockOpenOrders }),
	useCurrentOrderActions: () => mockActions,
}));
const mockActions = {
	getCurrentOrderRecord: () => mockCurrent,
	setCurrentOrderID: (id: string) => mockSetCurrentOrderID(id),
};
jest.mock('../../screens/main/pos/checkout/checkout-mode', () => ({
	useCheckoutMode: () => mockMode,
	getCheckoutModeSnapshot: () => mockMode,
	useOrderCheckoutStage: () => 'cart',
	selectReceipt: (id: string | null) => mockSelectReceipt(id),
}));
// The help sheet's host components (see help-sheet.test.tsx).
jest.mock('@wcpos/components/v2/dialog', () => {
	function Wrapper({ children, testID }: React.PropsWithChildren<{ testID?: string }>) {
		return <div data-testid={testID}>{children}</div>;
	}
	return {
		Dialog: ({ open, children }: React.PropsWithChildren<{ open: boolean }>) =>
			open ? <>{children}</> : null,
		DialogBody: Wrapper,
		DialogContent: Wrapper,
		DialogHeader: Wrapper,
		DialogTitle: Wrapper,
	};
});
jest.mock('@wcpos/components/button', () => ({
	Button: ({ children, testID }: React.PropsWithChildren<{ testID: string }>) => (
		<button data-testid={testID}>{children}</button>
	),
}));
jest.mock('../../screens/main/pos/contexts/overlay-side/v2', () => ({
	usePanelSide: () => 'right',
}));
jest.mock('../../contexts/translations', () => ({ useT: () => (key: string) => key }));

const chord = (code: string, key: string) => ({ code, key, altKey: true });
const ALT_N = chord('KeyN', 'n');
const ran = (command: string, source = 'key') =>
	expect(mockLog).toHaveBeenCalledWith('debug', 'Command ran', {
		category: ['wcpos', 'pos', 'commands'],
		context: { type: 'command.run', command, source },
	});

function Mounted() {
	return (
		<CommandsProvider>
			<Hotkeys />
			<input data-testid="search" />
		</CommandsProvider>
	);
}
function mount() {
	return render(<Mounted />);
}

let detachCart: () => void;
beforeEach(() => {
	jest.clearAllMocks();
	mockFocused = true;
	resetSurfaces();
	// The cart column registers `cart` while it shows the cart.
	detachCart = registerSurface('cart', () => undefined);
});

it('Alt+N on the page runs pos.cart.new with source key', async () => {
	mount();
	await act(async () => {
		fireEvent.keyDown(document.body, ALT_N);
	});
	expect(mockSetCurrentOrderID).toHaveBeenCalledWith('');
	ran('pos.cart.new');
});

it('Alt+N runs inside a focused input too, and prevents the default', async () => {
	mount();
	const input = screen.getByTestId('search');
	input.focus();
	const event = createEvent.keyDown(input, ALT_N);
	await act(async () => {
		fireEvent(input, event);
	});
	expect(event.defaultPrevented).toBe(true);
	expect(mockSetCurrentOrderID).toHaveBeenCalledWith('');
});

it('a refused chord runs nothing and moves nothing', async () => {
	detachCart(); // the column shows the register picker, not the cart
	mount();
	await act(async () => {
		fireEvent.keyDown(document.body, ALT_N);
		fireEvent.keyDown(document.body, chord('ArrowRight', 'ArrowRight'));
	});
	expect(mockSetCurrentOrderID).not.toHaveBeenCalled();
	expect(mockSelectReceipt).not.toHaveBeenCalled();
	expect(mockLog).toHaveBeenCalledWith('info', 'A shortcut was not available', {
		category: ['wcpos', 'pos', 'commands'],
		context: { type: 'command.refused', command: 'pos.cart.new', source: 'key' },
	});
});

it('drops a chord pressed again while its run is still pending', async () => {
	let settle: () => void = () => undefined;
	const pay = jest.fn(() => new Promise<void>((resolve) => (settle = resolve)));
	registerSurface('pay', pay);
	mount();
	const ALT_P = chord('KeyP', 'p');
	await act(async () => {
		fireEvent.keyDown(document.body, ALT_P);
		fireEvent.keyDown(document.body, ALT_P);
	});
	expect(pay).toHaveBeenCalledTimes(1);
	await act(async () => settle());
	ran('pos.checkout.open');
	await act(async () => {
		fireEvent.keyDown(document.body, ALT_P);
	});
	expect(pay).toHaveBeenCalledTimes(2);
	await act(async () => settle());
});

it('Alt+/ opens the help sheet', async () => {
	mount();
	expect(screen.queryByTestId('hotkeys-help-sheet')).toBeNull();
	await act(async () => {
		fireEvent.keyDown(document.body, chord('Slash', '/'));
	});
	expect(screen.getByTestId('hotkeys-help-sheet')).toBeTruthy();
	ran('pos.help.open');
});

it('Alt+/ over the open sheet closes it; another chord closes it first, then runs', async () => {
	jest.useFakeTimers();
	try {
		mount();
		await act(async () => {
			fireEvent.keyDown(document.body, chord('Slash', '/'));
		});
		expect(screen.getByTestId('hotkeys-help-sheet')).toBeTruthy();
		await act(async () => {
			fireEvent.keyDown(document.body, chord('Slash', '/'));
		});
		expect(screen.queryByTestId('hotkeys-help-sheet')).toBeNull();
		await act(async () => {
			fireEvent.keyDown(document.body, chord('Slash', '/'));
		});
		await act(async () => {
			fireEvent.keyDown(document.body, ALT_N);
		});
		expect(screen.queryByTestId('hotkeys-help-sheet')).toBeNull();
		expect(mockSetCurrentOrderID).not.toHaveBeenCalled();
		await act(async () => {
			jest.runOnlyPendingTimers();
		});
		expect(mockSetCurrentOrderID).toHaveBeenCalledWith('');
	} finally {
		jest.useRealTimers();
	}
});

it('binds nothing while the POS screen is not the focused drawer screen, and closes the sheet', async () => {
	const { rerender } = mount();
	await act(async () => {
		fireEvent.keyDown(document.body, chord('Slash', '/'));
	});
	expect(screen.getByTestId('hotkeys-help-sheet')).toBeTruthy();
	mockFocused = false;
	rerender(<Mounted />);
	expect(screen.queryByTestId('hotkeys-help-sheet')).toBeNull();
	await act(async () => {
		fireEvent.keyDown(document.body, ALT_N);
	});
	expect(mockSetCurrentOrderID).not.toHaveBeenCalled();
});

it('leaves a key another handler answered, and a dead key inside a field, alone', async () => {
	mount();
	const prevented = createEvent.keyDown(document.body, ALT_N);
	prevented.preventDefault();
	await act(async () => {
		fireEvent(document.body, prevented);
	});
	expect(mockSetCurrentOrderID).not.toHaveBeenCalled();
	const input = document.createElement('input');
	document.body.appendChild(input);
	input.focus();
	await act(async () => {
		fireEvent.keyDown(input, { ...ALT_N, key: 'Dead' });
		fireEvent.keyDown(input, { ...ALT_N, key: 'ń' }); // Polish Pro: the letter itself
	});
	expect(mockSetCurrentOrderID).not.toHaveBeenCalled();
	await act(async () => {
		fireEvent.keyDown(document.body, { ...ALT_N, key: 'Dead' });
	});
	expect(mockSetCurrentOrderID).toHaveBeenCalledWith('');
	input.remove();
});

it('a second press before a deferred run fires runs the command once', async () => {
	jest.useFakeTimers();
	try {
		const pay = jest.fn(async () => undefined);
		registerSurface('pay', pay);
		const ALT_P = chord('KeyP', 'p');
		mount();
		await act(async () => {
			fireEvent.keyDown(document.body, chord('Slash', '/'));
		});
		await act(async () => {
			fireEvent.keyDown(document.body, ALT_P);
			fireEvent.keyDown(document.body, ALT_P);
		});
		await act(async () => {
			jest.runOnlyPendingTimers();
		});
		expect(pay).toHaveBeenCalledTimes(1);
	} finally {
		jest.useRealTimers();
	}
});

it('renders nothing on native', () => {
	const { container } = render(<NativeHotkeys />);
	expect(container.innerHTML).toBe('');
});
