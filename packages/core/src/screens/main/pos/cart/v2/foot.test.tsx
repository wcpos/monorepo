/** @jest-environment jsdom */
import * as React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';

import { CartFoot } from './foot';
let mockSession: { sessionsOn: boolean; session: object | null; overdue: boolean };
const mockOrder = { payload: { line_items: [] as object[], customer_note: 'Gift' } };
jest.mock('../../../../../services/register-session/use-register-session', () => ({
	useRegisterSession: () => mockSession,
}));
jest.mock('../../contexts/current-order', () => ({
	useCurrentOrder: () => ({ currentOrderRecord: mockOrder }),
}));
jest.mock('../../../../../contexts/translations', () => ({ useT: () => (key: string) => key }));
jest.mock('@wcpos/query', () => ({
	useDocField: <T,>(value: T, select: (value: T) => unknown) => select(value),
}));
jest.mock('@wcpos/components/text', () => ({ Text: jest.requireActual('react-native').Text }));
jest.mock('@wcpos/components/hstack', () => ({
	HStack: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
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
jest.mock('../buttons/pay', () => ({ PayButton: () => <button data-testid="checkout-button" /> }));
jest.mock('./order-sheet', () => ({
	OrderSheet: ({ open }: { open: boolean }) =>
		open ? <div data-testid="order-meta-dialog" /> : null,
}));
beforeEach(() => {
	mockSession = { sessionsOn: false, session: null, overdue: false };
	mockOrder.payload.line_items = [];
});
it('opens the register when sessions are on and none is open', () => {
	mockSession.sessionsOn = true;
	const onOpenRegister = jest.fn();
	render(<CartFoot onOpenRegister={onOpenRegister} onCloseRegister={jest.fn()} />);
	fireEvent.click(screen.getByTestId('checkout-open-register'));
	expect(onOpenRegister).toHaveBeenCalledTimes(1);
	expect(screen.queryByTestId('checkout-button')).toBeNull();
});
it('closes an overdue register with an empty cart', () => {
	mockSession.overdue = true;
	const onCloseRegister = jest.fn();
	render(<CartFoot onOpenRegister={jest.fn()} onCloseRegister={onCloseRegister} />);
	fireEvent.click(screen.getByTestId('checkout-close-register'));
	expect(onCloseRegister).toHaveBeenCalledTimes(1);
	expect(screen.queryByTestId('checkout-button')).toBeNull();
});
it.each([false, true])('pays otherwise (overdue %s)', (overdue) => {
	mockSession.overdue = overdue;
	mockOrder.payload.line_items = [{}];
	render(<CartFoot onOpenRegister={jest.fn()} onCloseRegister={jest.fn()} />);
	expect(screen.getByTestId('checkout-button')).toBeTruthy();
});
it('opens the order sheet from the note', () => {
	render(<CartFoot onOpenRegister={jest.fn()} onCloseRegister={jest.fn()} />);
	expect(screen.queryByTestId('order-meta-dialog')).toBeNull();
	fireEvent.click(screen.getByTestId('cart-note-row'));
	expect(screen.getByTestId('order-meta-dialog')).toBeTruthy();
});
