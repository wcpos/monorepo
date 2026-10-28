/** @jest-environment jsdom */
import * as React from 'react';

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { of } from 'rxjs';

import { RegisterPanel } from './register-panel';

jest.mock('@wcpos/components/icon', () => ({ Icon: () => null }));

jest.mock('@wcpos/query', () => ({
	useDocField: jest.requireActual('@wcpos/core-test/mock-use-doc-field').mockUseDocField,
}));
let blind = false;
let expected: Record<string, string> = { cash: '155', card: '30' };
const baseTerms = {
	float: '100',
	cashSales: { amount: '62', count: 2 },
	paidIn: [] as { amount: string; note?: string }[],
	paidOut: { amount: '7', count: 1, note: 'Milk' },
	cashRefunds: { amount: '0', count: 0 },
	noSales: 0,
	voids: 0,
	expected: '155',
};
let terms: typeof baseTerms | undefined = baseTerms;
let capabilities: string[] | undefined;
let movements: Record<string, unknown>[] = [];
let refusedMovements: Record<string, unknown>[] = [];
let currentSession: Record<string, unknown> | null = null;
let serverNumber: number | null = null;
let syncStatus = 'pending';
let syncedRowsAt: string | null = null;
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
		session: currentSession,
		binding: { registerName: 'Front' },
		expected,
		terms,
		salesCount: 2,
		movements,
		refusedMovements,
		lastClosure: {
			id: 'c',
			number: 1,
			server_number: serverNumber,
			sync_status: syncStatus,
			server_closure_id: 'winner',
			sync_error: 'movement_refused',
			counted: { cash: '570' },
			till_expected: { cash: '570' },
			variance: { cash: '0' },
			opened_at: '2026-09-09T23:00:00Z',
			closed_at: '2026-09-10T17:00:00Z',
			synced_rows_at: syncedRowsAt,
			server_findings: { gap: true },
		},
		actions: { voidMovement, recordMovement, retryMovement, startCounting },
	}),
}));
const mockSite = {
	populateResource: () => null,
	populate$: () => of([{ id: 7, display_name: 'Alex' }]),
};
jest.mock('../../../../contexts/app-state', () => ({
	useAppState: () => ({ store: { name: 'Shop', currency: 'GBP' }, site: {} }),
	useStoreSession: () => ({ site: mockSite, wpCredentials: { capabilities } }),
}));
jest.mock('../../../../hooks/use-store-day', () => ({
	useStoreDay: () => ({ timezone: 'UTC' }),
	useViewedStore: () => ({ name: 'Shop', currency: 'GBP' }),
}));
jest.mock('../../../../hooks/use-locale', () => ({ useLocale: () => ({ code: 'en-GB' }) }));
jest.mock('observable-hooks', () => ({
	...jest.requireActual('observable-hooks'),
	useObservableSuspense: () => [{ id: 7, display_name: 'Alex' }],
}));
jest.mock('../../../../contexts/translations', () => ({
	useT: () => (key: string, values?: Record<string, unknown>) =>
		`${key}${values ? ` ${Object.values(values).join(' ')}` : ''}`,
}));
jest.mock('../../hooks/use-currency-format', () => ({
	useCurrencyFormat: () => ({ currencySymbol: '£', format: (v: number) => `£${v.toFixed(2)}` }),
}));
jest.mock('../contexts/overlay-side', () => ({ usePanelSide: () => 'right' }));
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
// The refused band is a Notice; the stand-in keeps its testID, title and action buttons.
jest.mock('@wcpos/components/notice', () => ({
	Notice: ({
		testID,
		title,
		actions,
	}: {
		testID?: string;
		title: string;
		actions?: { label: string; onPress: () => void; testID?: string }[];
	}) => (
		<div data-testid={testID}>
			{title}
			{actions?.map((action) => (
				<button key={action.label} data-testid={action.testID} onClick={action.onPress}>
					{action.label}
				</button>
			))}
		</div>
	),
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
jest.mock('@wcpos/components/icon-button', () => ({
	IconButton: ({ onPress, testID }: { onPress: () => void; testID: string }) => (
		<button data-testid={testID} onClick={onPress} />
	),
}));
jest.mock('@wcpos/components/input', () => {
	function Field({
		value,
		onChangeText,
		testID,
	}: {
		value: string;
		onChangeText: (v: string) => void;
		testID: string;
	}) {
		return (
			<input value={value} data-testid={testID} onChange={(e) => onChangeText(e.target.value)} />
		);
	}
	function Wrap({ children }: { children?: React.ReactNode }) {
		return <div>{children}</div>;
	}
	// The movement amount is the `hero` variant: Input.Root / InputField.
	return {
		Input: Object.assign(Field, { Root: Wrap, Left: Wrap, Right: Wrap, InputField: Field }),
	};
});
jest.mock('@wcpos/components/chip', () => ({
	Chip: ({
		label,
		on,
		onPress,
		testID,
	}: {
		label: string;
		on?: boolean;
		onPress: () => void;
		testID: string;
	}) => (
		<button data-testid={testID} aria-pressed={on} onClick={onPress}>
			{label}
		</button>
	),
}));
jest.mock('@wcpos/components/keypad', () => ({
	...jest.requireActual('@wcpos/components/keypad'),
	Keypad: ({
		rows,
		onPress,
		testID,
	}: {
		rows: { name: string; label: string }[][];
		onPress: (name: string) => void;
		testID: string;
	}) => (
		<div>
			{rows.flat().map((key) => (
				<button
					key={key.name}
					data-testid={`${testID}-key-${key.name}`}
					onClick={() => onPress(key.name)}
				>
					{key.label}
				</button>
			))}
		</div>
	),
}));
jest.mock('@wcpos/components/text', () => ({
	Text: ({ children, testID }: { children: React.ReactNode; testID?: string }) => (
		<span data-testid={testID}>{children}</span>
	),
	// The real MenuRow wraps its row in the text recipe's provider.
	TextClassContext: { Provider: ({ children }: { children: React.ReactNode }) => <>{children}</> },
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
	DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
	DialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
	DialogBody: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
	DialogFooter: jest.requireActual('../../../../../jest/footer.test-utils').DialogFooter,
}));
jest.mock('../../hooks/use-payment-methods', () => ({
	usePaymentMethods: () => ({
		byId: new Map([['stripe_terminal_for_woocommerce', { title: 'Stripe Terminal' }]]),
	}),
}));
const confirmButton = () => screen.getByTestId('movement-confirm') as HTMLButtonElement;
beforeEach(() => {
	blind = false;
	expected = { cash: '155', card: '30' };
	terms = baseTerms;
	capabilities = ['view_woocommerce_pos_reports'];
	currentSession = {
		id: 'session',
		status: 'open',
		opened_by: 7,
		opened_at_gmt: '2026-09-11T09:02:00Z',
	};
	movements = [{ id: 'old', type: 'paid_out', amount: '7', reason: 'Milk', sync_status: 'synced' }];
	refusedMovements = [];
	syncedRowsAt = null;
	serverNumber = null;
	syncStatus = 'pending';
	jest.clearAllMocks();
});
it('lists a non-cash tender only while it holds money; cash is the derivation, not a tender', () => {
	expected = { cash: '0.0000', card: '0.0000', stripe_terminal_for_woocommerce: '-5.0000' };
	render(<RegisterPanel open onOpenChange={jest.fn()} />);
	expect(screen.queryByText('Cash')).toBeNull();
	expect(screen.queryByText('Card')).toBeNull();
	expect(screen.getByText('Stripe Terminal')).toBeTruthy();
});

it("the body is the drawer's derivation and ends in Expected", () => {
	const view = render(<RegisterPanel open onOpenChange={jest.fn()} />);
	// In order: float, cash sales, refunds, in, out, the sum line, then the tenders kept apart.
	expect(screen.getByTestId('register-panel').textContent).toMatch(
		/register\.float.*£100\.00register\.cash_sales 2£62\.00register\.cash_refunds.*register\.paid_in.*register\.paid_out 1 · Milk\u2212£7\.00register\.expected_in_drawer£155\.00register\.other_tendersCard£30\.00/
	);
	expect(screen.getByTestId('register-panel-expected').textContent).toContain('£155.00');
	// No session: no derivation, only the closure.
	terms = undefined;
	view.rerender(<RegisterPanel open onOpenChange={jest.fn()} />);
	expect(screen.queryByTestId('register-panel-expected')).toBeNull();
	expect(screen.getByTestId('register-panel-last-closure')).toBeTruthy();
});

it('hides every amount and the X report for blind cashiers', () => {
	blind = true;
	render(<RegisterPanel open onOpenChange={jest.fn()} />);
	fireEvent.click(screen.getByTestId('register-panel-movements'));
	expect(screen.getByTestId('register-panel-amount').textContent).toBe('Front');
	expect(screen.getByTestId('register-panel').textContent).not.toMatch(/£|155|570/);
	expect(screen.queryByTestId('register-panel-print')).toBeNull();
});
// Revert: stringify the session-report failure instead of translating it in this caller too.
it('translates a failed X-report dispatch in the register panel', async () => {
	render(<RegisterPanel open onOpenChange={jest.fn()} />);
	fireEvent.click(screen.getByTestId('register-panel-movements'));
	fireEvent.click(screen.getByTestId('register-panel-print'));
	await waitFor(() => expect(screen.getByText('reports.reprint_failed')).toBeTruthy());
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

it('the keypad decimal key stores a canonical point whatever the locale shows', () => {
	render(<RegisterPanel open onOpenChange={jest.fn()} />);
	fireEvent.click(screen.getByTestId('register-panel-paid-out'));
	fireEvent.click(screen.getByTestId('movement-reason-supplier'));
	fireEvent.click(screen.getByTestId('movement-key-7'));
	fireEvent.click(screen.getByTestId('movement-key-decimal'));
	fireEvent.click(screen.getByTestId('movement-key-5'));
	fireEvent.click(screen.getByTestId('movement-key-0'));
	fireEvent.click(screen.getByTestId('movement-key-0'));
	expect((screen.getByTestId('movement-confirm') as HTMLButtonElement).disabled).toBe(false);
});

it('a reason chip fills the reason and the verb names the amount', () => {
	render(<RegisterPanel open onOpenChange={jest.fn()} />);
	fireEvent.click(screen.getByTestId('register-panel-paid-out'));
	expect(confirmButton().textContent).toBe('register.take_cash_out');
	fireEvent.click(screen.getByTestId('movement-reason-supplier'));
	fireEvent.click(screen.getByTestId('movement-key-7'));
	expect(confirmButton().textContent).toBe('register.take_out £7.00');
	// The mocked translator returns keys, so the chip's label is its key.
	expect((screen.getByTestId('movement-reason') as HTMLInputElement).value).toBe(
		'register.reason_supplier'
	);
	expect(screen.getByTestId('movement-reason-supplier').getAttribute('aria-pressed')).toBe('true');
	expect(confirmButton().disabled).toBe(false);
});

it('the consequence line says what is left after a paid out', () => {
	render(<RegisterPanel open onOpenChange={jest.fn()} />);
	fireEvent.click(screen.getByTestId('register-panel-paid-out'));
	expect(screen.getByTestId('movement-after').textContent).toBe('register.drawer_holds £155.00');
	fireEvent.click(screen.getByTestId('movement-key-7'));
	expect(screen.getByTestId('movement-after').textContent).toContain('£148.00');
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

const lost = {
	id: 'lost',
	type: 'paid_in',
	amount: '20',
	reason: 'Change',
	sync_status: 'failed',
	sync_error: 'rest_invalid_param',
};

it('shows refused movements at the top of the pane and offers a retry', async () => {
	movements = [
		{ id: 'old', type: 'paid_out', amount: '7', reason: 'Milk', sync_status: 'synced' },
		lost,
	];
	refusedMovements = [lost];
	render(<RegisterPanel open onOpenChange={jest.fn()} />);
	// Today nothing in the register UI reads sync_status, so this row is indistinguishable
	// from a delivered one and the cash goes missing silently.
	expect(screen.getByTestId('register-panel-refused').textContent).toContain('1');
	fireEvent.click(screen.getByTestId('register-panel-retry-refused'));
	await waitFor(() => expect(retryMovement).toHaveBeenCalledWith('lost'));
});

it('keeps the refused banner and its retry after the session has closed', async () => {
	// The close succeeds and the session stops being current. The cash still moved, and the
	// server still accepts a movement recorded before counting started — so both the record
	// and the way to send it have to survive the transition.
	currentSession = null;
	movements = [];
	refusedMovements = [lost];
	render(<RegisterPanel open onOpenChange={jest.fn()} />);
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
	fireEvent.click(screen.getByTestId('register-panel-close-register'));
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

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
// Revert: navigate to Sales, omit the selected closure, or leave the register overlay open.
it('opens the last closure in Reports Closures and dismisses the register panel', () => {
	const onOpenChange = jest.fn();
	render(<RegisterPanel open onOpenChange={onOpenChange} />);
	fireEvent.click(screen.getByTestId('register-panel-open-closure'));
	expect(mockPush).toHaveBeenCalledWith({
		pathname: '/reports',
		params: expect.objectContaining({ closureId: 'c', openedAt: '2026-09-09T23:00:00Z' }),
	});
	expect(onOpenChange).toHaveBeenCalledWith(false);
});

// Revert: leave the disabled closure control unexplained for blind cashiers.
it('explains the closure restriction only while blind counting is enabled', () => {
	blind = true;
	capabilities = [];
	const view = render(<RegisterPanel open onOpenChange={jest.fn()} />);
	expect((screen.getByTestId('register-panel-open-closure') as HTMLButtonElement).disabled).toBe(
		true
	);
	expect(screen.getByTestId('register-panel-closure-restricted').textContent).toBe(
		'register.closure_blind_restricted'
	);
	blind = false;
	capabilities = ['view_woocommerce_pos_reports'];
	view.rerender(<RegisterPanel open onOpenChange={jest.fn()} />);
	expect(screen.queryByTestId('register-panel-closure-restricted')).toBeNull();
	expect((screen.getByTestId('register-panel-open-closure') as HTMLButtonElement).disabled).toBe(
		false
	);
});

// Revert: use blind counting, rather than a known capability denial, to disable the link.
it.each([[undefined], [[]], [['view_woocommerce_pos_reports']]])(
	'keeps unknown report capabilities navigable, but hides blind amounts (%j)',
	(capabilitiesValue) => {
		blind = true;
		capabilities = capabilitiesValue;
		const denied = capabilitiesValue?.length === 0;
		render(<RegisterPanel open onOpenChange={jest.fn()} />);
		const link = screen.getByTestId('register-panel-open-closure') as HTMLButtonElement;
		expect(link.disabled).toBe(denied);
		expect(link.textContent).not.toContain('£570');
		expect(screen.getByTestId('register-panel-closure-restricted')).toBeTruthy();
		fireEvent.click(link);
		expect(mockPush).toHaveBeenCalledTimes(denied ? 0 : 1);
	}
);
