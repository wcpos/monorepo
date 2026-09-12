/** @jest-environment jsdom */
import * as React from 'react';

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

import { RegisterPanel } from './register-panel';

jest.mock('@wcpos/query', () => ({
	useDocField: jest.requireActual('@wcpos/core-test/mock-use-doc-field').mockUseDocField,
}));
let blind = false;
let serverNumber: number | null = null;
let syncStatus = 'pending';
let syncedRowsAt: string | null = null;
const voidMovement = jest.fn(async () => undefined);
const recordMovement = jest.fn(async () => ({ id: 'movement' }));
const startCounting = jest.fn(async () => undefined);
const print = jest.fn(async () => undefined);
const openDrawer = jest.fn(async () => undefined);
const showToast = jest.fn();
jest.mock('../../../../services/register-session/use-register-session', () => ({
	useRegisterSession: () => ({
		blind,
		session: { id: 'session', status: 'open', opened_by: 7, opened_at_gmt: '2026-09-11T09:02:00Z' },
		binding: { registerName: 'Front' },
		expected: { cash: '155', card: '30' },
		salesCount: 2,
		movements: [{ id: 'old', type: 'paid_out', amount: '7', reason: 'Milk' }],
		lastClosure: {
			number: 1,
			server_number: serverNumber,
			sync_status: syncStatus,
			server_closure_id: 'winner',
			sync_error: 'movement_refused',
			counted: { cash: '570' },
			till_expected: { cash: '570' },
			variance: { cash: '0' },
			closed_at: '2026-09-10T17:00:00Z',
			synced_rows_at: syncedRowsAt,
			server_findings: { gap: true },
		},
		actions: { voidMovement, recordMovement, startCounting },
	}),
}));
jest.mock('../../../../contexts/app-state', () => ({
	useStoreSession: () => ({ site: { populateResource: () => null } }),
}));
jest.mock('observable-hooks', () => ({
	useObservableSuspense: () => [{ id: 7, display_name: 'Alex' }],
}));
jest.mock('../../../../contexts/translations', () => ({
	useT: () => (key: string, values?: Record<string, unknown>) =>
		`${key}${values ? ` ${Object.values(values).join(' ')}` : ''}`,
}));
jest.mock('../../hooks/use-currency-format', () => ({
	useCurrencyFormat: () => ({ currencySymbol: '£', format: (v: number) => `£${v.toFixed(2)}` }),
}));
jest.mock('../contexts/overlay-side', () => ({ usePOSOverlaySide: () => 'right' }));
jest.mock('../../receipt/use-receipt-document', () => ({
	useReceiptDocument: () => ({ print, resolvedPrinter: { autoOpenDrawer: true } }),
}));
jest.mock('@wcpos/printer', () => ({
	usePrint: () => ({ print }),
	PrinterService: class {
		openDrawer = openDrawer;
	},
}));
jest.mock('../../receipt/hooks/use-resolved-printer', () => ({
	useResolvedPrinter: ({ template }: { template: unknown }) => ({
		resolvedPrinter: template ? { autoOpenDrawer: true } : null,
	}),
}));
jest.mock('@wcpos/components/toast', () => ({
	Toast: { show: (props: unknown) => showToast(props) },
}));
jest.mock('@wcpos/components/button', () => ({
	Button: ({
		children,
		onPress,
		testID,
		disabled,
	}: {
		children: React.ReactNode;
		onPress: () => void;
		testID: string;
		disabled?: boolean;
	}) => (
		<button data-testid={testID} disabled={disabled} onClick={onPress}>
			{children}
		</button>
	),
}));
jest.mock('@wcpos/components/input', () => ({
	Input: ({
		value,
		onChangeText,
		testID,
	}: {
		value: string;
		onChangeText: (v: string) => void;
		testID: string;
	}) => <input value={value} data-testid={testID} onChange={(e) => onChangeText(e.target.value)} />,
}));
jest.mock('@wcpos/components/text', () => ({
	Text: ({ children, testID }: { children: React.ReactNode; testID?: string }) => (
		<span data-testid={testID}>{children}</span>
	),
}));
jest.mock('@wcpos/components/dialog', () => ({
	Dialog: ({ children, open }: { children: React.ReactNode; open: boolean }) =>
		open ? <>{children}</> : null,
	DialogContent: ({ children, testID }: { children: React.ReactNode; testID?: string }) => (
		<div data-testid={testID}>{children}</div>
	),
	DialogTitle: ({ children, testID }: { children: React.ReactNode; testID?: string }) => (
		<h2 data-testid={testID}>{children}</h2>
	),
}));
beforeEach(() => {
	blind = false;
	syncedRowsAt = null;
	serverNumber = null;
	syncStatus = 'pending';
	jest.clearAllMocks();
});
it('hides every amount and the X report for blind cashiers', () => {
	blind = true;
	render(<RegisterPanel open onOpenChange={jest.fn()} />);
	fireEvent.click(screen.getByTestId('register-panel-movements'));
	expect(screen.getByTestId('register-panel-amount').textContent).toBe('Front');
	expect(screen.getByTestId('register-panel').textContent).not.toMatch(/£|155|570/);
	expect(screen.queryByTestId('register-panel-print')).toBeNull();
});
it('records paid out and Undo inserts a void', async () => {
	render(<RegisterPanel open onOpenChange={jest.fn()} />);
	expect(screen.getByTestId('register-panel-amount').textContent).toBe('£155.00');
	fireEvent.click(screen.getByTestId('register-panel-paid-out'));
	fireEvent.change(screen.getByTestId('movement-amount'), { target: { value: '20' } });
	fireEvent.change(screen.getByTestId('movement-reason'), { target: { value: 'Milk' } });
	fireEvent.click(screen.getByTestId('movement-confirm'));
	await waitFor(() =>
		expect(recordMovement).toHaveBeenCalledWith({ type: 'paid_out', amount: '20', reason: 'Milk' })
	);
	await waitFor(() => expect(showToast).toHaveBeenCalled());
	render(showToast.mock.calls[0][0].action);
	fireEvent.click(screen.getByTestId('toast-undo'));
	await waitFor(() => expect(voidMovement).toHaveBeenCalledWith('movement'));
});
it('no sale hides amount and opens the resolved drawer', async () => {
	render(<RegisterPanel open onOpenChange={jest.fn()} />);
	fireEvent.click(screen.getByTestId('register-panel-no-sale'));
	expect(screen.queryByTestId('movement-amount')).toBeNull();
	fireEvent.click(screen.getByTestId('movement-confirm'));
	await waitFor(() => expect(openDrawer).toHaveBeenCalled());
	expect(recordMovement).toHaveBeenCalledWith({ type: 'no_sale', amount: '0', reason: '' });
});
it('Close register starts counting and dismisses the panel', async () => {
	const onOpenChange = jest.fn();
	render(<RegisterPanel open onOpenChange={onOpenChange} />);
	fireEvent.click(screen.getByTestId('register-panel-close'));
	await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
	expect(startCounting).toHaveBeenCalled();
});

it('coalesces same-tick movement taps before React renders saving state', () => {
	recordMovement.mockImplementationOnce(() => new Promise(() => {}));
	render(<RegisterPanel open onOpenChange={jest.fn()} />);
	fireEvent.click(screen.getByTestId('register-panel-paid-out'));
	fireEvent.change(screen.getByTestId('movement-amount'), { target: { value: '20' } });
	act(() => {
		fireEvent.click(screen.getByTestId('movement-confirm'));
		fireEvent.click(screen.getByTestId('movement-confirm'));
	});
	expect(recordMovement).toHaveBeenCalledTimes(1);
});

it('shows Unsynced until every named row is acknowledged, then offers Reprint', () => {
	syncedRowsAt = null;
	const view = render(<RegisterPanel open onOpenChange={jest.fn()} />);
	expect(screen.getByTestId('register-panel-last-closure').textContent).toContain('£570.00');
	expect(screen.getByTestId('closure-unsynced')).toBeTruthy();
	expect(screen.queryByTestId('closure-reprint')).toBeNull();
	syncedRowsAt = '2026-09-12T12:00:00Z';
	view.rerender(<RegisterPanel open onOpenChange={jest.fn()} />);
	expect(screen.queryByTestId('closure-unsynced')).toBeNull();
	expect(screen.getByTestId('closure-reprint')).toBeTruthy();
});

it('shows the server number and offers Reprint for an acknowledged superseded closure', () => {
	serverNumber = 4;
	syncStatus = 'superseded';
	syncedRowsAt = '2026-09-12T12:00:00Z';
	render(<RegisterPanel open onOpenChange={jest.fn()} />);
	expect(screen.getByTestId('register-panel-last-closure').textContent).toContain(
		'register.closure_written_n 4'
	);
	expect(screen.getByTestId('closure-reprint')).toBeTruthy();
});
it('hides acknowledged closure reprinting from blind cashiers', () => {
	blind = true;
	syncedRowsAt = '2026-09-12T12:00:00Z';
	render(<RegisterPanel open onOpenChange={jest.fn()} />);
	expect(screen.queryByTestId('closure-reprint')).toBeNull();
});
it('shows the dead-lettered closure movement error', () => {
	syncStatus = 'failed';
	render(<RegisterPanel open onOpenChange={jest.fn()} />);
	expect(screen.getByTestId('closure-sync-error').textContent).toBe('movement_refused');
});
