/** @jest-environment jsdom */
import * as React from 'react';

import { fireEvent, render, screen, within } from '@testing-library/react';

import { CartFoot } from './foot';
let mockSession: { sessionsOn: boolean; session: object | null; overdue: boolean };
const mockOrder = { payload: { line_items: [] as object[], customer_note: 'Gift' } };
jest.mock('../../../../services/register-session/use-register-status', () => ({
	useRegisterStatus: () => mockSession,
}));
jest.mock('../contexts/current-order', () => ({
	useCurrentOrder: () => ({ currentOrderRecord: mockOrder }),
}));
jest.mock('../../../../contexts/translations', () => ({ useT: () => (key: string) => key }));
jest.mock('@wcpos/query', () => ({
	useDocField: <T,>(value: T, select: (value: T) => unknown) => select(value),
}));
jest.mock('@wcpos/components/text', () => ({ Text: jest.requireActual('react-native').Text }));
jest.mock('@wcpos/components/hstack', () => ({
	HStack: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
}));
// The note row's surface and glyphs reach the icon sets (Uniwind's ESM); the foot needs only the press.
jest.mock('@wcpos/components/icon', () => ({ Icon: () => null }));
jest.mock('@wcpos/components/pressable-surface', () => ({
	PressableSurface: ({
		testID,
		onPress,
		children,
	}: React.PropsWithChildren<{ testID: string; onPress: () => void }>) => (
		<button data-testid={testID} onClick={onPress}>
			{children}
		</button>
	),
}));
jest.mock('@wcpos/components/button', () => ({
	Button: ({
		testID,
		onPress,
		children,
	}: React.PropsWithChildren<{ testID: string; onPress: () => void }>) => (
		<button data-testid={testID} onClick={onPress}>
			{children}
		</button>
	),
}));
jest.mock('@wcpos/components/icon-button', () => ({
	IconButton: ({ testID, onPress }: { testID: string; onPress: () => void }) => (
		<button data-testid={testID} onClick={onPress} />
	),
}));
const mockTooltip = jest.fn();
jest.mock('@wcpos/components/tooltip', () => ({
	Tooltip: ({ children, ...props }: { children: React.ReactNode; showOnNative?: boolean }) => {
		mockTooltip(props);
		return (
			<div data-testid="tooltip" data-show-on-native={String(!!props.showOnNative)}>
				{children}
			</div>
		);
	},
	TooltipContent: ({ children }: { children: React.ReactNode }) => (
		<div role="tooltip">{children}</div>
	),
	TooltipTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
jest.mock('./buttons/pay', () => ({ PayButton: () => <button data-testid="checkout-button" /> }));
beforeEach(() => {
	mockSession = { sessionsOn: false, session: null, overdue: false };
	mockOrder.payload.line_items = [];
});
it('opens the register when sessions are on and none is open', () => {
	mockSession.sessionsOn = true;
	const onOpenRegister = jest.fn();
	render(
		<CartFoot onOpenRegister={onOpenRegister} onCloseRegister={jest.fn()} onOpenSheet={jest.fn()} />
	);
	fireEvent.click(screen.getByTestId('checkout-open-register'));
	expect(onOpenRegister).toHaveBeenCalledTimes(1);
	expect(screen.queryByTestId('checkout-button')).toBeNull();
});
it('closes an overdue register with an empty cart', () => {
	mockSession.overdue = true;
	const onCloseRegister = jest.fn();
	render(
		<CartFoot
			onOpenRegister={jest.fn()}
			onCloseRegister={onCloseRegister}
			onOpenSheet={jest.fn()}
		/>
	);
	fireEvent.click(screen.getByTestId('checkout-close-register'));
	expect(onCloseRegister).toHaveBeenCalledTimes(1);
	expect(screen.queryByTestId('checkout-button')).toBeNull();
});
it('offers no close without a close handler', () => {
	mockSession.overdue = true;
	render(<CartFoot onOpenRegister={jest.fn()} onOpenSheet={jest.fn()} />);
	expect(screen.queryByTestId('checkout-close-register')).toBeNull();
	expect(screen.getByTestId('checkout-button')).toBeTruthy();
});
it.each([false, true])('pays otherwise (overdue %s)', (overdue) => {
	mockSession.overdue = overdue;
	mockOrder.payload.line_items = [{}];
	render(
		<CartFoot onOpenRegister={jest.fn()} onCloseRegister={jest.fn()} onOpenSheet={jest.fn()} />
	);
	expect(screen.getByTestId('checkout-button')).toBeTruthy();
});
it('asks the cart root for the order sheet from the note and from the menu button', () => {
	// The sheet is the cart root's, pinned to the order it opened for; the foot only asks.
	const onOpenSheet = jest.fn();
	render(
		<CartFoot onOpenRegister={jest.fn()} onCloseRegister={jest.fn()} onOpenSheet={onOpenSheet} />
	);
	fireEvent.click(screen.getByTestId('cart-note-row'));
	fireEvent.click(screen.getByTestId('order-meta-button'));
	expect(onOpenSheet).toHaveBeenCalledTimes(2);
});
// Revert: ⋮ has no tooltip, so hovering it on web says nothing (climb T3).
it('names the ⋮ on hover, web only, and a press still asks for the order sheet', () => {
	const onOpenSheet = jest.fn();
	render(
		<CartFoot onOpenRegister={jest.fn()} onCloseRegister={jest.fn()} onOpenSheet={onOpenSheet} />
	);
	const button = screen.getByTestId('order-meta-button');
	const tooltip = button.closest('[data-testid="tooltip"]') as HTMLElement;
	expect(within(tooltip).getByRole('tooltip').textContent).toBe('pos_cart.order_details');
	// No `showOnNative`: on a phone the press must open the sheet, not a tooltip.
	expect(tooltip.getAttribute('data-show-on-native')).toBe('false');
	fireEvent.click(button);
	expect(onOpenSheet).toHaveBeenCalledTimes(1);
});
