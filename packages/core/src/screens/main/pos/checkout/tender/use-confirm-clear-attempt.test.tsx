/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';

import { useConfirmClearAttempt } from './use-confirm-clear-attempt';

jest.mock('../../../../../contexts/translations', () => ({
	useT: () => jest.requireActual('../../../../../../jest/translate').createTestT(),
}));
const mockOpenChange = React.createContext<(open: boolean) => void>(() => {});
jest.mock('@wcpos/components/alert-dialog', () => {
	const div = ({ children, testID }: React.PropsWithChildren<{ testID?: string }>) => (
		<div data-testid={testID}>{children}</div>
	);
	return {
		AlertDialog: ({
			children,
			open,
			onOpenChange,
		}: React.PropsWithChildren<{ open: boolean; onOpenChange: (open: boolean) => void }>) =>
			open ? (
				<mockOpenChange.Provider value={onOpenChange}>
					{/* The platform's own close (Escape, Android back). */}
					<button data-testid="dismiss" onClick={() => onOpenChange(false)} />
					{children}
				</mockOpenChange.Provider>
			) : null,
		AlertDialogContent: div,
		AlertDialogHeader: div,
		AlertDialogTitle: ({ children }: React.PropsWithChildren) => (
			<div data-testid="title">{children}</div>
		),
		AlertDialogDescription: ({ children }: React.PropsWithChildren) => (
			<div data-testid="body">{children}</div>
		),
		AlertDialogFooter: div,
		AlertDialogCancel: ({ children, testID }: React.PropsWithChildren<{ testID: string }>) => {
			const onOpenChange = React.useContext(mockOpenChange);
			return (
				<button data-testid={testID} onClick={() => onOpenChange(false)}>
					{children}
				</button>
			);
		},
		AlertDialogAction: ({
			children,
			testID,
			onPress,
			variant,
		}: React.PropsWithChildren<{ testID: string; onPress: () => void; variant: string }>) => (
			<button data-testid={testID} data-variant={variant} onClick={onPress}>
				{children}
			</button>
		),
	};
});

const asked: { answer?: Promise<boolean> } = {};
// The flow asks from an event (the Clear attempt press), as here.
function Host() {
	const clear = useConfirmClearAttempt({});
	return (
		<>
			<button
				data-testid="clear"
				onClick={() => {
					asked.answer = clear.confirmClearAttempt();
				}}
			/>
			{clear.dialog}
		</>
	);
}
const ask = () => {
	fireEvent.click(screen.getByTestId('clear'));
	return asked.answer!;
};

it('asks with the title, the body and a destructive Clear attempt; the confirm answers yes', async () => {
	render(<Host />);
	expect(screen.queryByTestId('checkout-clear-attempt-dialog')).toBeNull();
	const answer = ask();
	expect(screen.getByTestId('title').textContent).toBe('Clear this payment attempt?');
	expect(screen.getByTestId('body').textContent).toMatch(/^Only clear it once the provider/);
	const confirm = screen.getByTestId('checkout-clear-attempt-confirm');
	expect(confirm.textContent).toBe('Clear attempt');
	expect(confirm.dataset.variant).toBe('destructive');
	fireEvent.click(confirm);
	await expect(answer).resolves.toBe(true);
	expect(screen.queryByTestId('checkout-clear-attempt-dialog')).toBeNull();
});

it.each(['checkout-clear-attempt-cancel', 'dismiss'])('%s answers no', async (testID) => {
	render(<Host />);
	const answer = ask();
	fireEvent.click(screen.getByTestId(testID));
	await expect(answer).resolves.toBe(false);
	expect(screen.queryByTestId('checkout-clear-attempt-dialog')).toBeNull();
});

it('unmounting with the question open answers no', async () => {
	const view = render(<Host />);
	const answer = ask();
	view.unmount();
	await expect(answer).resolves.toBe(false);
});
