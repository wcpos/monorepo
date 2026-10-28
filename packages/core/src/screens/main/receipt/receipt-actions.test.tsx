/** @jest-environment jsdom */
import * as React from 'react';

import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';

import { Button } from '@wcpos/components/button';

import { useReceiptActions } from './receipt-actions';

jest.mock('../hooks/use-sync-order', () => ({
	useSyncOrder: () => ({ sync: jest.fn(), loading: false, disabled: false }),
}));
jest.mock('../../../contexts/translations', () => ({ useT: () => (key: string) => key }));
// Keep the real dialog and browser focus lifecycle; only its animation shell is unrelated.
jest.mock('@rn-primitives/dialog', () =>
	jest.requireActual(require.resolve('@rn-primitives/dialog').replace('index.js', 'dialog.web.js'))
);
jest.mock('@wcpos/components/lib/overlay', () => ({
	OverlayShell: ({ children }: React.PropsWithChildren) => children,
	useOverlay: () => ({ presentation: 'center' }),
	useOverlayPresentation: () => 'center',
	useSheetInset: () => undefined,
	OVERLAY_MOTION: { center: {} },
	isWeb: true,
}));
jest.mock('expo-router', () => ({ router: { back: jest.fn() } }));
jest.mock('@wcpos/components/icon', () => ({ Icon: () => null }));
jest.mock('@wcpos/components/loader', () => ({ Loader: () => null }));
jest.mock('./email', () => ({ EmailForm: () => null }));

// Losing the unsaved gate would offer an email without the numeric id its queue needs.
it('offers Sync only for unsaved sales and gates Email until saved', () => {
	const doc = { unsaved: true, document: undefined } as Parameters<typeof useReceiptActions>[0];
	const order = {} as Parameters<typeof useReceiptActions>[1];
	const { result, rerender } = renderHook(() => useReceiptActions(doc, order));
	expect(result.current.sync?.testID).toBe('receipt-sync-order-button');
	expect(result.current.choices.map((action) => action.testID)).toEqual([
		'receipt-email-button',
		'receipt-download-pdf-button',
		'receipt-print-button',
	]);
	expect(
		result.current.choices.find((action) => action.testID === 'receipt-email-button')?.disabled
	).toBe(true);
	doc.unsaved = false;
	rerender();
	expect(result.current.sync).toBeUndefined();
	const email = result.current.choices.find((action) => action.testID === 'receipt-email-button');
	expect(email?.disabled).toBe(false);
	act(() => email?.onPress?.({} as never));
	expect((result.current.dialog as React.ReactElement<{ open: boolean }>).props.open).toBe(true);
	doc.unsaved = true;
	doc.document = 'refund:1';
	rerender();
	expect(result.current.sync).toBeUndefined();
	expect(result.current.choices.map((action) => action.testID)).toEqual([
		'receipt-download-pdf-button',
		'receipt-print-button',
	]);
});

// Without a trigger, Radix cannot return focus to the detached Email entry by itself.
it('returns focus to Email after closing its dialog', async () => {
	const doc = { unsaved: false } as Parameters<typeof useReceiptActions>[0];
	const order = {} as Parameters<typeof useReceiptActions>[1];
	function Host() {
		const { choices, dialog } = useReceiptActions(doc, order);
		return (
			<>
				{choices.map(({ label, icon, ...action }) => (
					<Button key={action.testID} {...action} leftIcon={icon}>
						{label}
					</Button>
				))}
				{dialog}
			</>
		);
	}
	render(<Host />);
	const email = screen.getByTestId('receipt-email-button');
	email.focus();
	fireEvent.click(email);
	expect(screen.getByRole('dialog')).toBeTruthy();
	const close = screen.getByRole('button', { name: 'common.close' });
	close.focus();
	fireEvent.click(close);
	await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
	await waitFor(() => expect(document.activeElement).toBe(email));
});
