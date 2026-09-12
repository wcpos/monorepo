/** @jest-environment jsdom */
import * as React from 'react';

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

import { RegisterPanel } from './register-panel';

let blind = false;
let movements: Record<string, unknown>[] = [];
const voidMovement = jest.fn(async () => undefined);
const recordMovement = jest.fn(async () => ({ id: 'movement' }));
const retryMovement = jest.fn(async () => undefined);
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
		movements,
		lastClosed: { counted: { cash: '570' }, closed_at_gmt: '2026-09-10T17:00:00Z' },
		actions: { voidMovement, recordMovement, retryMovement, startCounting },
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
const confirmButton = () => screen.getByTestId('movement-confirm') as HTMLButtonElement;
beforeEach(() => {
	blind = false;
	movements = [{ id: 'old', type: 'paid_out', amount: '7', reason: 'Milk', sync_status: 'synced' }];
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
	fireEvent.change(screen.getByTestId('movement-reason'), { target: { value: 'Wrong change' } });
	fireEvent.click(screen.getByTestId('movement-confirm'));
	await waitFor(() => expect(openDrawer).toHaveBeenCalled());
	expect(recordMovement).toHaveBeenCalledWith({
		type: 'no_sale',
		amount: '0',
		reason: 'Wrong change',
	});
});

it('will not record a movement the server would refuse for a blank reason', () => {
	render(<RegisterPanel open onOpenChange={jest.fn()} />);
	fireEvent.click(screen.getByTestId('register-panel-paid-in'));
	fireEvent.change(screen.getByTestId('movement-amount'), { target: { value: '20' } });
	// The server requires a reason on every non-void movement; a blank one 400s after the
	// cash is already in the drawer.
	expect(confirmButton().disabled).toBe(true);
	expect(screen.getByTestId('movement-invalid').textContent).toContain('reason');
	fireEvent.change(screen.getByTestId('movement-reason'), { target: { value: 'Change' } });
	expect(confirmButton().disabled).toBe(false);
});

it('will not open the drawer for a no sale the server would refuse', () => {
	render(<RegisterPanel open onOpenChange={jest.fn()} />);
	fireEvent.click(screen.getByTestId('register-panel-no-sale'));
	// No amount to gate on, so today this button is never disabled and every no-sale 400s.
	expect(confirmButton().disabled).toBe(true);
	fireEvent.click(screen.getByTestId('movement-confirm'));
	expect(recordMovement).not.toHaveBeenCalled();
	expect(openDrawer).not.toHaveBeenCalled();
});

it.each([
	['10,50', '10.50'],
	['10.', '10'],
	['.5', '0.5'],
	[' 10 ', '10'],
])('normalises %s to the amount grammar the server accepts', async (typed, sent) => {
	render(<RegisterPanel open onOpenChange={jest.fn()} />);
	fireEvent.click(screen.getByTestId('register-panel-paid-in'));
	fireEvent.change(screen.getByTestId('movement-amount'), { target: { value: typed } });
	fireEvent.change(screen.getByTestId('movement-reason'), { target: { value: 'Change' } });
	expect(confirmButton().disabled).toBe(false);
	fireEvent.click(screen.getByTestId('movement-confirm'));
	await waitFor(() =>
		expect(recordMovement).toHaveBeenCalledWith({
			type: 'paid_in',
			amount: sent,
			reason: 'Change',
		})
	);
});

it.each(['1e2', '1 0', '10.50.1', '0'])(
	'keeps confirm dead for %s, which the server would refuse',
	(typed) => {
		render(<RegisterPanel open onOpenChange={jest.fn()} />);
		fireEvent.click(screen.getByTestId('register-panel-paid-in'));
		fireEvent.change(screen.getByTestId('movement-amount'), { target: { value: typed } });
		fireEvent.change(screen.getByTestId('movement-reason'), { target: { value: 'Change' } });
		expect(confirmButton().disabled).toBe(true);
		expect(screen.getByTestId('movement-invalid').textContent).toContain('amount');
	}
);

it('shows refused movements at the top of the pane and offers a retry', async () => {
	movements = [
		{ id: 'old', type: 'paid_out', amount: '7', reason: 'Milk', sync_status: 'synced' },
		{
			id: 'lost',
			type: 'paid_in',
			amount: '20',
			reason: 'Change',
			sync_status: 'failed',
			sync_error: 'rest_invalid_param',
		},
	];
	render(<RegisterPanel open onOpenChange={jest.fn()} />);
	// Today nothing in the register UI reads sync_status, so this row is indistinguishable
	// from a delivered one and the cash goes missing silently.
	expect(screen.getByTestId('register-panel-refused').textContent).toContain('1');
	fireEvent.click(screen.getByTestId('register-panel-retry-refused'));
	await waitFor(() => expect(retryMovement).toHaveBeenCalledWith('lost'));
});

it('says nothing about refused movements when every row is delivered', () => {
	render(<RegisterPanel open onOpenChange={jest.fn()} />);
	expect(screen.queryByTestId('register-panel-refused')).toBeNull();
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
	fireEvent.change(screen.getByTestId('movement-reason'), { target: { value: 'Milk' } });
	act(() => {
		fireEvent.click(screen.getByTestId('movement-confirm'));
		fireEvent.click(screen.getByTestId('movement-confirm'));
	});
	expect(recordMovement).toHaveBeenCalledTimes(1);
});
