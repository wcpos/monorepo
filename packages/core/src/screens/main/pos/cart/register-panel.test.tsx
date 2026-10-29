/** @jest-environment jsdom */
import * as React from 'react';

import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { of } from 'rxjs';

import { RegisterPanel } from './register-panel';

jest.mock('@wcpos/components/table', () => ({ TABLE_HEAD_TEXT: 'text-muted-foreground' }));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('@wcpos/components/icon', () => ({ Icon: () => null }));

jest.mock('@wcpos/query', () => ({
	useDocField: jest.requireActual('@wcpos/core-test/mock-use-doc-field').mockUseDocField,
}));
let mockRegisters = [{ id: 'front' }, { id: 'back' }];
jest.mock('../../../../services/register/use-register-binding', () => ({
	useRegisterBinding: () => ({ registers: mockRegisters }),
}));
let mockOverdue = false;
let mockHasClosure = true;
let mockClosureOverrides: Record<string, unknown> = {};
jest.mock('../../reports/closures/closure-panel', () => ({
	ClosurePanel: ({
		row,
		onBack,
		onClose,
	}: {
		row: { id: string };
		onBack: () => void;
		onClose: () => void;
	}) => (
		<div data-testid="closure-panel">
			{row.id}
			<button data-testid="closure-back" onClick={onBack} />
			<button data-testid="closure-close" onClick={onClose} />
		</div>
	),
}));
let blind = false;
let currentFiguresPending = false;
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
		countingHere: mockCountingHere,
		overdue: mockOverdue,
		closeTime: '17:30',
		figuresPending: currentFiguresPending,
		session: currentSession,
		binding: { registerName: 'Front' },
		expected,
		terms,
		salesCount: 2,
		movements,
		refusedMovements,
		lastClosure: mockHasClosure
			? {
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
					business_day: '2026-09-10',
					...mockClosureOverrides,
				}
			: null,
		actions: {
			voidMovement,
			recordMovement,
			retryMovement,
			startCounting,
			backToSelling: mockBackToSelling,
			closeSession: mockCloseSession,
		},
	}),
}));
const mockSite = {
	populateResource: () => null,
	populate$: () => of([{ id: 7, display_name: 'Alex' }]),
};
jest.mock('../../../../contexts/app-state', () => ({
	useAppState: () => ({ store: { name: 'Shop', currency: 'GBP' }, site: {} }),
	useStoreSession: () => ({
		store: { id: 1, name: 'Shop' },
		site: mockSite,
		wpCredentials: { capabilities },
	}),
}));
jest.mock('../../../../hooks/use-store-day', () => ({
	...jest.requireActual('../../../../hooks/use-store-day'),
	useStoreDay: () => ({ timezone: 'UTC' }),
	useViewedStore: () => ({ name: 'Shop', currency: 'GBP' }),
}));
jest.mock('../../../../hooks/use-locale', () => ({
	useLocale: () => ({ code: 'en-GB', shortCode: 'en' }),
}));
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
	ButtonText: ({ children }: { children: React.ReactNode }) => <>{children}</>,
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
	Text: ({
		children,
		testID,
		className,
	}: {
		children: React.ReactNode;
		testID?: string;
		className?: string;
	}) => (
		<span data-testid={testID} data-classes={className}>
			{children}
		</span>
	),
	// The real MenuRow wraps its row in the text recipe's provider.
	TextClassContext: { Provider: ({ children }: { children: React.ReactNode }) => <>{children}</> },
}));
jest.mock('@wcpos/components/dialog', () => ({
	Dialog: ({
		children,
		open,
		onOpenChange,
	}: {
		children: React.ReactNode;
		open: boolean;
		onOpenChange: (open: boolean) => void;
	}) =>
		open ? (
			<>
				<button data-testid="panel-x" onClick={() => onOpenChange(false)} />
				{children}
			</>
		) : null,
	DialogContent: ({ children, testID }: { children: React.ReactNode; testID?: string }) => (
		<div data-testid={testID}>{children}</div>
	),
	DialogTitle: ({ children, testID }: { children: React.ReactNode; testID?: string }) => (
		<h2 data-testid={testID}>{children}</h2>
	),
	DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
	DialogDescription: ({ children, testID }: { children: React.ReactNode; testID?: string }) => (
		<p data-testid={testID}>{children}</p>
	),
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
	currentFiguresPending = false;
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
	const ledger = screen.getByTestId('register-panel-ledger');
	expect(
		within(ledger)
			.getAllByRole('listitem')
			.map((row) => row.textContent)
	).toEqual([
		'register.opened_suffix 09:02register.float£100.00',
		'register.term_count register.cash_sales 2register.taken£62.00',
		'register.term_count register.paid_out 1−£7.00Milk−£7.00register.void',
		'register.expected_in_drawer£155.00',
	]);
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
	expect(screen.queryByTestId('register-panel-drawer')).toBeNull();
	expect(screen.getByTestId('register-panel').textContent).not.toMatch(/£|155|570/);
	expect(screen.queryByTestId('register-panel-print')).toBeNull();
});
// Revert: stringify the session-report failure instead of translating it in this caller too.
it('translates a failed X-report dispatch in the register panel', async () => {
	render(<RegisterPanel open onOpenChange={jest.fn()} />);
	fireEvent.click(screen.getByTestId('register-panel-print'));
	await waitFor(() => expect(screen.getByText('reports.reprint_failed')).toBeTruthy());
});
it('records paid out and Undo inserts a void', async () => {
	render(<RegisterPanel open onOpenChange={jest.fn()} />);
	expect(screen.getByTestId('register-panel-drawer').textContent).toContain('£155.00');
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
it('Close register starts the count and pushes the count pane', async () => {
	const onOpenChange = jest.fn();
	render(<RegisterPanel open onOpenChange={onOpenChange} />);
	fireEvent.click(screen.getByTestId('register-panel-close-register'));
	await waitFor(() => expect(screen.getByTestId('count-amount')).toBeTruthy());
	expect(onOpenChange).not.toHaveBeenCalled();
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

it('shows the dead-lettered closure movement error', () => {
	syncStatus = 'failed';
	render(<RegisterPanel open onOpenChange={jest.fn()} />);
	expect(screen.getByTestId('closure-sync-error').textContent).toBe('movement_refused');
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

it.each([[undefined], [[]], [['view_woocommerce_pos_reports']]])(
	'a blind closure row never opens the amount-bearing pane (%j)',
	(value) => {
		const previousBlind = blind,
			previousCapabilities = capabilities;
		try {
			blind = true;
			capabilities = value;
			render(<RegisterPanel open onOpenChange={jest.fn()} />);
			const row = screen.getByTestId('register-panel-open-closure') as HTMLButtonElement;
			expect(row.disabled).toBe(true);
			expect(row.textContent).not.toContain('£');
			fireEvent.click(row);
			expect(screen.queryByTestId('closure-panel')).toBeNull();
			expect(screen.getByTestId('register-panel-closure-restricted')).toBeTruthy();
		} finally {
			blind = previousBlind;
			capabilities = previousCapabilities;
		}
	}
);

it('says the figures are still to come on a seeded session and will not close the register', () => {
	currentSession = {
		...currentSession,
		counted_float: null,
		expected_float: null,
		server_expected_at: null,
	};
	currentFiguresPending = true;
	terms = { ...baseTerms, float: '0' };
	render(<RegisterPanel open onOpenChange={jest.fn()} />);
	expect(screen.getByTestId('register-panel-figures-pending').textContent).toContain(
		'register.figures_after_sync'
	);
	const floatRow = screen.getByTestId('register-panel-float');
	expect(floatRow?.textContent).toContain('—');
	expect(floatRow?.textContent).not.toContain('£0.00');
	expect(screen.getByTestId('register-panel-drawer').textContent).toContain('—');
	expect(screen.getByTestId('register-panel-expected').textContent).toContain('—');
	expect(screen.getByTestId('register-panel-expected').textContent).not.toContain('£');
	const close = screen.getByTestId('register-panel-close-register');
	expect(close.hasAttribute('disabled')).toBe(true);
	fireEvent.click(close);
	expect(startCounting).not.toHaveBeenCalled();
});

it('the header is the recipe: disc, register name, store · open since · live age · opener', () => {
	jest.useFakeTimers();
	jest.setSystemTime(new Date('2026-09-11T12:22:00Z'));
	try {
		render(<RegisterPanel open onOpenChange={jest.fn()} />);
		expect(screen.getByTestId('register-panel-disc')).toBeTruthy();
		expect(screen.getByRole('heading').textContent).toBe('Front');
		expect(screen.getByTestId('register-panel-description').textContent).toBe(
			'Shop · register.open_since 09:02 · register.age_h_m 3 20 · Alex'
		);
		act(() => jest.advanceTimersByTime(60_000));
		expect(screen.getByTestId('register-panel-description').textContent).toContain(
			'register.age_h_m 3 21'
		);
	} finally {
		jest.useRealTimers();
	}
});
it('a sole register is titled Register and an age below an hour reads minutes', () => {
	const previous = mockRegisters;
	jest.useFakeTimers();
	jest.setSystemTime(new Date('2026-09-11T09:22:00Z'));
	try {
		mockRegisters = [{ id: 'front' }];
		render(<RegisterPanel open onOpenChange={jest.fn()} />);
		expect(screen.getByRole('heading').textContent).toBe('register.register');
		expect(screen.getByTestId('register-panel-description').textContent).toContain(
			'register.age_m 20'
		);
	} finally {
		mockRegisters = previous;
		jest.useRealTimers();
	}
});
it('the two figure tiles separate drawer money from net sales across every tender', () => {
	const previousExpected = expected,
		previousTerms = terms;
	try {
		expected = { cash: '345.03', card: '30', other: '-5' };
		terms = { ...baseTerms, cashRefunds: { amount: '2', count: 1 } };
		render(<RegisterPanel open onOpenChange={jest.fn()} />);
		expect(screen.getByTestId('register-panel-drawer').textContent).toBe(
			'register.in_the_drawer£345.03'
		);
		expect(screen.getByTestId('register-panel-session-sales').textContent).toBe(
			'register.session_sales£85.00register.sales_count 2'
		);
	} finally {
		expected = previousExpected;
		terms = previousTerms;
	}
});
it('a baseline without server terms (older plugin): Session sales is the count, no money', () => {
	currentSession = {
		...currentSession,
		server_expected_at: '2026-09-11T10:00:00Z',
		server_expected: { cash: '155', card: '30' },
	};
	render(<RegisterPanel open onOpenChange={jest.fn()} />);
	expect(screen.getByTestId('register-panel-session-sales').textContent).toBe(
		'register.session_salesregister.sales_count 2'
	);
	expect(screen.getByTestId('register-panel-drawer').textContent).toBe(
		'register.in_the_drawer£155.00'
	);
});
it('a blind cashier gets one figure tile with the sales count and no money', () => {
	const previous = blind;
	try {
		blind = true;
		render(<RegisterPanel open onOpenChange={jest.fn()} />);
		expect(screen.queryByTestId('register-panel-drawer')).toBeNull();
		expect(screen.getByTestId('register-panel-session-sales').textContent).toBe(
			'register.session_salesregister.sales_count 2'
		);
		expect(screen.getByTestId('register-panel').textContent).not.toContain('£');
	} finally {
		blind = previous;
	}
});
it('a seeded session: both figure tiles read — with the sync note', () => {
	const previous = currentFiguresPending;
	try {
		currentFiguresPending = true;
		render(<RegisterPanel open onOpenChange={jest.fn()} />);
		expect(screen.getByTestId('register-panel-drawer').textContent).toBe(
			'register.in_the_drawer—register.figures_after_sync'
		);
		expect(screen.getByTestId('register-panel-session-sales').textContent).toBe(
			'register.session_sales—register.figures_after_sync'
		);
	} finally {
		currentFiguresPending = previous;
	}
});

it('zero terms are not drawn; a voided movement step disappears', () => {
	const previousTerms = terms,
		previousMovements = movements;
	try {
		terms = {
			...baseTerms,
			cashSales: { amount: '0', count: 0 },
			paidOut: { amount: '0', count: 0, note: '' },
		};
		movements = [
			{ id: 'old', type: 'paid_out', amount: '7', voided_by: 'void' },
			{ id: 'void', type: 'void', voids: 'old' },
		];
		render(<RegisterPanel open onOpenChange={jest.fn()} />);
		const ledger = screen.getByTestId('register-panel-ledger');
		expect(within(ledger).getAllByRole('listitem')).toHaveLength(2);
		expect(ledger.textContent).not.toMatch(/paid_in|paid_out|cash_sales|cash_refunds|no_sale/);
		expect(screen.getByTestId('register-panel-expected').textContent).toContain('£155.00');
	} finally {
		terms = previousTerms;
		movements = previousMovements;
	}
});
it('a refused movement is a bad sub-line with Refused and still offers Void', async () => {
	const previous = movements;
	try {
		movements = [lost];
		render(<RegisterPanel open onOpenChange={jest.fn()} />);
		expect(
			within(screen.getByTestId('movement-row-lost'))
				.getByText('Change')
				.getAttribute('data-classes')
		).toContain('text-bad');
		expect(screen.getByTestId('movement-row-lost').textContent).toContain('register.refused_row');
		expect(screen.getByTestId('movement-row-lost').textContent).toContain('£20.00');
		fireEvent.click(screen.getByTestId('movement-void-lost'));
		await waitFor(() => expect(voidMovement).toHaveBeenCalledWith('lost'));
	} finally {
		movements = previous;
	}
});
it('server-baseline movements still draw a step without local sub-lines', () => {
	const previousTerms = terms,
		previousMovements = movements;
	try {
		movements = [];
		terms = { ...baseTerms, paidIn: [{ amount: '10' }] };
		render(<RegisterPanel open onOpenChange={jest.fn()} />);
		expect(screen.getByTestId('register-panel-paid-in-row').textContent).toContain('£10.00');
		expect(screen.getByTestId('register-panel-movements').textContent).toContain('−£7.00');
		expect(screen.queryByTestId('movement-void-old')).toBeNull();
	} finally {
		terms = previousTerms;
		movements = previousMovements;
	}
});
it('no-sale sub-lines carry a reason and Void but never an amount', () => {
	const previousTerms = terms,
		previousMovements = movements;
	try {
		terms = { ...baseTerms, noSales: 1 };
		movements = [{ id: 'no-sale', type: 'no_sale', amount: '0', reason: 'Wrong change' }];
		render(<RegisterPanel open onOpenChange={jest.fn()} />);
		expect(screen.getByTestId('register-panel-no-sales').textContent).toContain(
			'register.term_count register.no_sale 1'
		);
		expect(screen.getByTestId('movement-row-no-sale').textContent).toBe(
			'Wrong changeregister.void'
		);
	} finally {
		terms = previousTerms;
		movements = previousMovements;
	}
});

it.each([
	['0', 'synced', 0, 'reports.exact'],
	['2', 'synced', 0, '£2.00 register.over'],
	['-2', 'synced', 0, '£2.00 register.short'],
	['2', null, 1, 'register.unsynced'],
	['-2', 'synced', 1, 'reports.corrected'],
])(
	'the closure row names the closure, day, time and counted cash with its result (%s, %s, %s)',
	(variance, synced, corrections, badge) => {
		const previous = mockClosureOverrides;
		jest.useFakeTimers();
		jest.setSystemTime(new Date('2026-09-11T12:00:00Z'));
		try {
			mockClosureOverrides = {
				server_number: 4,
				variance: { cash: variance },
				synced_rows_at: synced,
				corrections_count: corrections,
			};
			render(<RegisterPanel open onOpenChange={jest.fn()} />);
			expect(screen.getByTestId('register-panel-open-closure').textContent).toBe(
				`reports.closure_n 4 · common.yesterday 17:00 · £570.00${badge}`
			);
			expect(screen.queryByTestId('closure-reprint')).toBeNull();
		} finally {
			mockClosureOverrides = previous;
			jest.useRealTimers();
		}
	}
);
it('pressing the closure row pushes the closure pane; back returns to the register', () => {
	const onOpenChange = jest.fn();
	render(<RegisterPanel open onOpenChange={onOpenChange} />);
	fireEvent.click(screen.getByTestId('register-panel-open-closure'));
	expect(screen.getByTestId('closure-panel').textContent).toBe('c');
	expect(screen.queryByTestId('register-panel-ledger')).toBeNull();
	expect(onOpenChange).not.toHaveBeenCalled();
	fireEvent.click(screen.getByTestId('closure-back'));
	expect(screen.getByTestId('register-panel-ledger')).toBeTruthy();
	expect(screen.queryByTestId('closure-panel')).toBeNull();
});
it('closing the pushed pane dismisses the panel and reopening starts at the register', () => {
	const onOpenChange = jest.fn();
	const view = render(<RegisterPanel open onOpenChange={onOpenChange} />);
	fireEvent.click(screen.getByTestId('register-panel-open-closure'));
	fireEvent.click(screen.getByTestId('closure-close'));
	expect(onOpenChange).toHaveBeenCalledWith(false);
	view.rerender(<RegisterPanel open={false} onOpenChange={onOpenChange} />);
	view.rerender(<RegisterPanel open onOpenChange={onOpenChange} />);
	expect(screen.getByTestId('register-panel-ledger')).toBeTruthy();
	expect(screen.queryByTestId('closure-panel')).toBeNull();
});
it('a blind cashier gets no money even in a short closure badge', () => {
	const previous = mockClosureOverrides,
		previousBlind = blind;
	try {
		mockClosureOverrides = { variance: { cash: '-2' }, synced_rows_at: 'synced' };
		blind = true;
		render(<RegisterPanel open onOpenChange={jest.fn()} />);
		expect(screen.getByTestId('register-panel').textContent).not.toContain('£');
		expect(screen.getByTestId('register-panel-closure-restricted')).toBeTruthy();
	} finally {
		mockClosureOverrides = previous;
		blind = previousBlind;
	}
});

it('a closure without a business-day stamp labels its recorded close day', () => {
	const previous = mockClosureOverrides;
	jest.useFakeTimers();
	jest.setSystemTime(new Date('2026-09-11T12:00:00Z'));
	try {
		mockClosureOverrides = { business_day: undefined };
		render(<RegisterPanel open onOpenChange={jest.fn()} />);
		expect(screen.getByTestId('register-panel-open-closure').textContent).toContain(
			'common.yesterday 17:00'
		);
	} finally {
		mockClosureOverrides = previous;
		jest.useRealTimers();
	}
});

it.each([false, true])('Close register names the close time only when overdue (%s)', (overdue) => {
	const previous = mockOverdue;
	try {
		mockOverdue = overdue;
		render(<RegisterPanel open onOpenChange={jest.fn()} />);
		expect(screen.getByTestId('register-panel-close-register').textContent).toBe(
			overdue ? 'register.close_register_past 17:30' : 'register.close_register'
		);
	} finally {
		mockOverdue = previous;
	}
});
it('closed with a last closure: closed time, the closure row only, Close register disabled', () => {
	const previousSession = currentSession,
		previousTerms = terms;
	try {
		currentSession = null;
		terms = undefined;
		render(<RegisterPanel open onOpenChange={jest.fn()} />);
		expect(screen.getByTestId('register-panel-description').textContent).toBe(
			'Shop · register.closed_at_time 17:00'
		);
		expect(screen.getByTestId('register-panel-open-closure')).toBeTruthy();
		expect(screen.queryByTestId('register-panel-drawer')).toBeNull();
		expect(screen.queryByTestId('register-panel-session-sales')).toBeNull();
		expect(screen.queryByTestId('register-panel-paid-in')).toBeNull();
		expect(screen.queryByTestId('register-panel-ledger')).toBeNull();
		expect(screen.queryByTestId('register-panel-print')).toBeNull();
		expect(screen.getByTestId('register-panel-close-register').hasAttribute('disabled')).toBe(true);
		fireEvent.click(screen.getByTestId('register-panel-close-register'));
		expect(startCounting).not.toHaveBeenCalled();
	} finally {
		currentSession = previousSession;
		terms = previousTerms;
	}
});
it('closed without a closure or refused movement renders nothing', () => {
	const previousSession = currentSession,
		previousClosure = mockHasClosure;
	try {
		currentSession = null;
		mockHasClosure = false;
		render(<RegisterPanel open onOpenChange={jest.fn()} />);
		expect(screen.queryByTestId('register-panel')).toBeNull();
	} finally {
		currentSession = previousSession;
		mockHasClosure = previousClosure;
	}
});

const mockBackToSelling = jest.fn(async () => undefined);
const mockOpenCarts = { count: 0 };
jest.mock('../contexts/current-order/use-open-orders-handle', () => ({
	useOpenOrdersHandle: () => ({ subscribe: () => () => {}, value: mockOpenCarts }),
}));
jest.mock('./approve-sheet', () => ({ ApproveSheet: () => null }));
it.each(['count-back', 'panel-x'])(
	'%s returns the count to selling, then leaves the count pane',
	async (control) => {
		const previous = currentSession;
		try {
			currentSession = { ...currentSession, status: 'counting' };
			const onOpenChange = jest.fn();
			render(<RegisterPanel open onOpenChange={onOpenChange} />);
			fireEvent.click(screen.getByTestId('register-panel-close-register'));
			await waitFor(() => expect(screen.getByTestId('count-back')).toBeTruthy());
			fireEvent.click(screen.getByTestId(control));
			await waitFor(() => expect(mockBackToSelling).toHaveBeenCalledTimes(1));
			if (control === 'panel-x')
				await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
			else {
				await waitFor(() =>
					expect(screen.getByTestId('register-panel-close-register')).toBeTruthy()
				);
				expect(onOpenChange).not.toHaveBeenCalled();
			}
		} finally {
			currentSession = previous;
		}
	}
);

let mockCountingHere = false;
it('opens on the count pane while this device is counting, only when opened', async () => {
	const previous = currentSession,
		previousHere = mockCountingHere;
	try {
		currentSession = { ...currentSession, status: 'counting' };
		mockCountingHere = true;
		const view = render(<RegisterPanel open={false} onOpenChange={jest.fn()} />);
		view.rerender(<RegisterPanel open onOpenChange={jest.fn()} />);
		await waitFor(() => expect(screen.getByTestId('count-back')).toBeTruthy());
		fireEvent.click(screen.getByTestId('count-back'));
		await waitFor(() => expect(screen.getByTestId('register-panel-close-register')).toBeTruthy());
		view.rerender(<RegisterPanel open onOpenChange={jest.fn()} />);
		expect(screen.queryByTestId('count-back')).toBeNull();
	} finally {
		currentSession = previous;
		mockCountingHere = previousHere;
	}
});
it('a requested count starts counting before showing the pane', async () => {
	render(<RegisterPanel open initialPane="count" onOpenChange={jest.fn()} />);
	await waitFor(() => expect(screen.getByTestId('count-back')).toBeTruthy());
	expect(startCounting).toHaveBeenCalledTimes(1);
});

jest.mock('./closure-written', () => ({
	ClosureWritten: ({ onDone }: { onDone: () => void }) => (
		<button data-testid="closure-done" onClick={onDone} />
	),
}));
const mockCloseSession = jest.fn(async () => ({ id: 'written' }));
it('pushes the written moment after close, survives the session disappearing, and Done closes', async () => {
	const previous = currentSession,
		previousClosure = mockHasClosure;
	try {
		const onOpenChange = jest.fn();
		const view = render(<RegisterPanel open initialPane="count" onOpenChange={onOpenChange} />);
		await waitFor(() => expect(screen.getByTestId('count-close')).toBeTruthy());
		fireEvent.change(screen.getByTestId('count-amount'), { target: { value: '155' } });
		fireEvent.click(screen.getByTestId('count-close'));
		await waitFor(() => expect(screen.getByTestId('closure-done')).toBeTruthy());
		currentSession = null;
		mockHasClosure = false;
		view.rerender(<RegisterPanel open initialPane="count" onOpenChange={onOpenChange} />);
		expect(screen.getByTestId('closure-done')).toBeTruthy();
		expect(onOpenChange).not.toHaveBeenCalled();
		fireEvent.click(screen.getByTestId('closure-done'));
		await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
	} finally {
		currentSession = previous;
		mockHasClosure = previousClosure;
	}
});
