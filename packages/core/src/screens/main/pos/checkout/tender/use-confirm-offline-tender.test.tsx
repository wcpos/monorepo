/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';

import type { PaymentMethodDescriptor } from '@wcpos/order-math';

import { useConfirmOfflineTender } from './use-confirm-offline-tender';

jest.mock('@wcpos/query', () => ({
	useDocField: <T,>(source: T, select: (value: T) => unknown) => select(source),
}));
jest.mock('../../../../../contexts/app-state', () => ({
	useStoreSession: () => ({ store: { price_num_decimals: 2 } }),
}));
jest.mock('../../../../../contexts/translations', () => ({
	useT: () => jest.requireActual('../../../../../../jest/translate').createTestT(),
}));
jest.mock('../../../hooks/use-currency-format', () => ({
	useCurrencyFormat: () => ({ format: (value: number) => `$${value.toFixed(2)}` }),
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
				<mockOpenChange.Provider value={onOpenChange}>{children}</mockOpenChange.Provider>
			) : null,
		AlertDialogContent: div,
		AlertDialogHeader: div,
		AlertDialogTitle: ({ children }: React.PropsWithChildren) => (
			<div data-testid="title">{children}</div>
		),
		AlertDialogDescription: div,
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

const cash = { id: 'pos_cash', title: 'Cash' } as PaymentMethodDescriptor;
const asked: { answer?: Promise<boolean> } = {};
// The flow asks from an event (the Take press), as here.
function Host() {
	const offline = useConfirmOfflineTender({ currencySymbol: '$' });
	return (
		<>
			<button
				data-testid="take"
				onClick={() => {
					asked.answer = offline.confirmOfflineTender({
						method: cash,
						amountMinor: 1050,
						queuedOffline: false,
					});
				}}
			/>
			{offline.dialog}
		</>
	);
}
const ask = () => {
	fireEvent.click(screen.getByTestId('take'));
	return asked.answer!;
};

it('names the amount and method in the title; Cancel answers no', async () => {
	render(<Host />);
	expect(screen.queryByTestId('checkout-offline-confirm')).toBeNull();
	const answer = ask();
	expect(screen.getByTestId('title').textContent).toBe('Take $10.50 in Cash while offline?');
	expect(screen.getByTestId('checkout-offline-confirm').textContent).toBe('Take $10.50 in Cash');
	// Taking the sale is the constructive act: never the destructive red.
	expect(screen.getByTestId('checkout-offline-confirm').dataset.variant).toBe('default');
	fireEvent.click(screen.getByTestId('checkout-offline-cancel'));
	await expect(answer).resolves.toBe(false);
	expect(screen.queryByTestId('checkout-offline-confirm')).toBeNull();
});

it('the confirm answers yes', async () => {
	render(<Host />);
	const answer = ask();
	fireEvent.click(screen.getByTestId('checkout-offline-confirm'));
	await expect(answer).resolves.toBe(true);
});

it('unmounting with the question open answers no', async () => {
	const view = render(<Host />);
	const answer = ask();
	view.unmount();
	await expect(answer).resolves.toBe(false);
});
