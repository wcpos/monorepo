/** @jest-environment jsdom */
import * as React from 'react';

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { of } from 'rxjs';

import { TillStrip } from './till-strip';

jest.mock('@wcpos/components/text', () => ({ Text: require('react-native').Text }));
jest.mock('@wcpos/components/icon', () => ({ Icon: () => null }));
jest.mock('@wcpos/components/icon-button', () => ({
	IconButton: ({ onPress, testID }: { onPress: () => void; testID: string }) => (
		<button data-testid={testID} onClick={onPress} />
	),
}));
jest.mock('@wcpos/components/button', () => ({
	ButtonText: require('react-native').Text,
	Button: ({
		onPress,
		testID,
		children,
		disabled,
	}: {
		onPress: () => void;
		testID: string;
		children: React.ReactNode;
		disabled?: boolean;
	}) => (
		<button data-testid={testID} onClick={onPress} disabled={disabled}>
			{children}
		</button>
	),
}));
jest.mock('../../../contexts/translations', () => ({
	useT: () => jest.requireActual('../../../../jest/translate').createTestT(),
}));
const credentials = of([{ id: 7, display_name: 'Dylan' }]);
const appState = () => ({
	store: {
		id: 1,
		timezone: 'Asia/Tokyo',
		currency: 'GBP',
		currency_pos: 'left',
		price_num_decimals: 2,
		price_decimal_sep: '.',
		price_thousand_sep: ',',
	},
	wpCredentials: { capabilities: ['view_woocommerce_pos_reports'] },
	site: { populate$: () => credentials },
});
jest.mock('../../../contexts/app-state', () => ({
	useAppState: () => appState(),
	useStoreSession: () => appState(),
}));
jest.mock('@wcpos/query', () => ({
	useDocField: (doc: unknown, pick: (doc: unknown) => unknown) => (doc ? pick(doc) : undefined),
}));
let size = 'lg';
jest.mock('../../../contexts/theme', () => ({ useTheme: () => ({ screenSize: size }) }));
const initialTerms = () => ({
	float: '100',
	cashSales: { amount: '343.70', count: 6 },
	paidIn: [] as { amount: string; note?: string }[],
	paidOut: { amount: '150', count: 1, note: 'to bank' },
	cashRefunds: { amount: '0', count: 0 },
	noSales: 0,
	voids: 0,
	expected: '293.70',
});
const initialData = () => ({
	session: { id: 's', opened_at_gmt: '2026-09-17T04:00:00Z', opened_by: 7, status: 'open' } as {
		id: string;
		opened_at_gmt: string;
		opened_by: number;
		status: string;
	} | null,
	blind: false,
	sessionsOn: true,
	binding: { registerId: 'front' as string | null, registerName: 'Front till' },
	terms: initialTerms(),
	lastClosure: {
		id: 'A',
		opened_at: '2026-09-17T00:00:00Z',
		number: 411,
		server_number: 412,
		closed_at: '2026-09-17T03:30:00Z',
		expected: { cash: '422' },
		counted: { cash: '412' },
		variance: { cash: '-10' },
		breakdowns: { register_name: 'Front till', closed_by_name: 'Pat' },
	},
});
let data = initialData();
jest.mock('../../../services/register-session/use-register-session', () => ({
	useRegisterSession: () => data,
}));
const print = jest.fn();
const report = jest.fn((_closure?: unknown, _reprint?: boolean, _known?: unknown) => ({ print }));
jest.mock('../../../services/register-session/use-session-report', () => ({
	useSessionReport: (closure?: unknown, reprint?: boolean, known?: unknown) =>
		report(closure, reprint, known),
}));
const get = jest.fn();
const http = { get };
let online = false;
const remotePrint = jest.fn();
jest.mock('../receipt/use-receipt-document', () => ({
	useReceiptDocument: () => ({ print: remotePrint }),
}));
jest.mock('../../../hooks/use-local-date', () => ({
	...jest.requireActual('../../../hooks/use-local-date'),
	// The cashier's locale is English here; the strip must format through this path.
	useLocalDate: () => ({ formatDate: jest.requireActual('date-fns').format }),
}));
let focused = true;
jest.mock('expo-router/react-navigation', () => ({ useIsFocused: () => focused }));
jest.mock('../hooks/use-rest-http-client', () => ({ useRestHttpClient: () => http }));
jest.mock('@wcpos/hooks/use-online-status', () => ({
	useOnlineStatus: () => ({ status: online ? 'online-website-available' : 'offline' }),
}));
beforeEach(() => {
	jest.clearAllMocks();
	data = initialData();
	size = 'lg';
	online = false;
	print.mockReset().mockResolvedValue(true);
	get.mockReset().mockImplementation((path: string) =>
		Promise.resolve({
			data: path === 'sessions' ? [] : { ...data.lastClosure, id: 'B', server_number: 413 },
		})
	);
});
// Removing terms, date-zone formatting, or the protected equals group breaks the equation.
it('shows four desktop terms with the expected result kept beside equals', () => {
	render(<TillStrip onOpenClosures={jest.fn()} />);
	expect(screen.getByTestId('till-title').textContent).toContain('Front till');
	expect(screen.getByTestId('till-status').textContent).toContain('Open');
	expect(screen.getByTestId('till-since').textContent).toBe('since 13:00 · Dylan');
	for (const [id, amount] of [
		['float', '£100.00'],
		['cash-sales', '£343.70'],
		['paid-out', '£150.00'],
	])
		expect(screen.getByTestId(`till-term-${id}`).textContent).toContain(amount);
	expect(screen.getByTestId('till-expected').textContent).toContain('£293.70');
	expect(screen.getByTestId('till-expected').parentElement?.textContent).toContain('=');
	expect(screen.getByTestId('till-equation').parentElement).toBe(
		screen.getByTestId('till-title').parentElement
	);
});
// Losing the busy/tablet branch leaves a wide equation squeezed beside the title.
it.each(['lg', 'md'])('puts a busy equation on its own row on %s', (width) => {
	size = width;
	data.terms.paidIn = [{ amount: '20', note: 'change' }];
	render(<TillStrip onOpenClosures={jest.fn()} />);
	expect(screen.getByTestId('till-equation').parentElement).toBe(
		screen.getByTestId('reports-till')
	);
	expect(screen.getByTestId('till-actions').parentElement).toBe(
		screen.getByTestId('till-title').parentElement
	);
	expect(screen.getByTestId('till-term-paid-in-0').textContent).toContain('£20.00');
});
it('shows closed Expected · Counted = short result and dispatches the local reprint offline', async () => {
	data.session = null;
	render(<TillStrip onOpenClosures={jest.fn()} />);
	expect(screen.getByTestId('till-expected').textContent).toContain('£422.00');
	expect(screen.getByTestId('till-counted').textContent).toContain('£412.00');
	expect(screen.getByTestId('till-result').textContent).toContain('£10.00 short');
	expect(screen.getByTestId('till-since').textContent).toBe('Closed 12:30 · Pat');
	fireEvent.click(screen.getByTestId('till-reprint'));
	await waitFor(() => expect(print).toHaveBeenCalledTimes(1));
	expect(report).toHaveBeenLastCalledWith(data.lastClosure, true, undefined);
	expect(get).not.toHaveBeenCalled();
});
it.each(['open', 'counting'])(
	'hides the equation for a blind %s cashier while keeping actions',
	(status) => {
		data.blind = true;
		data.session!.status = status;
		render(<TillStrip onOpenClosures={jest.fn()} />);
		expect(screen.queryByTestId('till-equation')).toBeNull();
		expect(screen.queryByTestId('till-expected')).toBeNull();
		expect(screen.getByTestId('till-xreport')).toBeTruthy();
		expect(screen.getByTestId('till-closures')).toBeTruthy();
	}
);
it('renders the phone ledger with the result row last and actions below it', () => {
	size = 'sm';
	data.terms.noSales = 2;
	data.terms.voids = 1;
	render(<TillStrip onOpenClosures={jest.fn()} />);
	const ledger = screen.getByTestId('till-ledger');
	expect(ledger.lastElementChild?.contains(screen.getByTestId('till-expected'))).toBe(true);
	expect(screen.getByTestId('reports-till').lastElementChild).toBe(
		screen.getByTestId('till-actions')
	);
	expect(screen.getByTestId('till-note').textContent).toContain('2 no-sales');
});
it.each(['unbound', 'off'])('keeps only the no-register title and chevron when %s', (state) => {
	if (state === 'off') data.sessionsOn = false;
	else data.binding.registerId = null;
	const open = jest.fn();
	render(<TillStrip onOpenClosures={open} />);
	expect(screen.getByTestId('till-title').textContent).toBe('No register on this device');
	expect(screen.queryByTestId('till-equation')).toBeNull();
	expect(screen.queryByTestId('till-xreport')).toBeNull();
	expect(screen.queryByTestId('till-reprint')).toBeNull();
	fireEvent.click(screen.getByTestId('till-closures'));
	expect(open).toHaveBeenCalledTimes(1);
});
it('keeps X-report busy and reports dispatch errors', async () => {
	let reject!: (error: Error) => void;
	print.mockImplementation(
		() =>
			new Promise((_resolve, fail) => {
				reject = fail;
			})
	);
	render(<TillStrip onOpenClosures={jest.fn()} />);
	fireEvent.click(screen.getByTestId('till-xreport'));
	expect((screen.getByTestId('till-xreport') as HTMLButtonElement).disabled).toBe(true);
	await act(async () => reject(new Error('reports.reprint_failed')));
	expect(screen.getByTestId('till-print-error').textContent).toBe('Printing failed. Try again.');
	expect((screen.getByTestId('till-xreport') as HTMLButtonElement).disabled).toBe(false);
});
// Allowing a stale local closure to print online violates the authoritative lookup rule.
it('disables reprint during the lookup, then uses the authoritative closure', async () => {
	data.session = null;
	online = true;
	let resolve!: (value: { data: typeof data.lastClosure }) => void;
	get.mockImplementation((path: string) =>
		path === 'sessions'
			? Promise.resolve({ data: [] })
			: new Promise((done) => {
					resolve = done;
				})
	);
	render(<TillStrip onOpenClosures={jest.fn()} />);
	expect((screen.getByTestId('till-reprint') as HTMLButtonElement).disabled).toBe(true);
	await waitFor(() => expect(get).toHaveBeenCalledWith('closures/last', expect.anything()));
	await act(async () => resolve({ data: { ...data.lastClosure, id: 'B', server_number: 413 } }));
	expect((screen.getByTestId('till-reprint') as HTMLButtonElement).disabled).toBe(false);
	expect(screen.getByTestId('till-last-closure').textContent).toContain('#413');
	expect(report).toHaveBeenLastCalledWith(undefined, true, expect.objectContaining({ id: 'B' }));
});
it('keeps the local reprint disabled after a failed online lookup', async () => {
	data.session = null;
	online = true;
	get.mockRejectedValueOnce(new Error('failed'));
	render(<TillStrip onOpenClosures={jest.fn()} />);
	await waitFor(() =>
		expect(screen.getByTestId('till-unavailable').textContent).toBe('Could not load closures')
	);
	expect((screen.getByTestId('till-reprint') as HTMLButtonElement).disabled).toBe(true);
});
// A register opened on another device is open here too: the server's session, not the local one, says so.
it('shows a session opened on another device as open with the server expected and prints its X-report', async () => {
	data.session = null;
	online = true;
	get.mockImplementation((path: string) =>
		Promise.resolve(
			path === 'sessions'
				? {
						data: [
							{ id: 'r1', status: 'open', opened_at_gmt: '2026-09-17T04:00:00Z', opened_by: 7 },
						],
					}
				: {
						data: {
							id: 'r1',
							status: 'open',
							opened_at_gmt: '2026-09-17T04:00:00Z',
							opened_by: 7,
							expected: { cash: '150.0000' },
							sales_count: 3,
						},
					}
		)
	);
	remotePrint.mockResolvedValue(true);
	render(<TillStrip onOpenClosures={jest.fn()} />);
	await waitFor(() => expect(screen.getByTestId('till-status').textContent).toContain('Open'));
	expect(screen.getByTestId('till-since').textContent).toBe('since 13:00 · Dylan');
	expect(screen.getByTestId('till-expected').textContent).toContain('£150.00');
	expect(screen.queryByTestId('till-term-float')).toBeNull();
	fireEvent.click(screen.getByTestId('till-xreport'));
	await waitFor(() => expect(remotePrint).toHaveBeenCalledTimes(1));
	expect(print).not.toHaveBeenCalled();
});
// Ledger closures 23/25: the lookup is invalidated while this device's own session is open.
it('forgets the lookup while the till is open here and reads afresh once it closes again', async () => {
	data.session = null;
	online = true;
	const { rerender } = render(<TillStrip onOpenClosures={jest.fn()} />);
	await waitFor(() => expect(get).toHaveBeenCalledWith('closures/last', expect.anything()));
	const reads = get.mock.calls.filter(([path]) => path === 'closures/last').length;
	data.session = { id: 's2', opened_at_gmt: '2026-09-17T06:00:00Z', opened_by: 7, status: 'open' };
	rerender(<TillStrip onOpenClosures={jest.fn()} />);
	expect(screen.getByTestId('till-xreport')).toBeTruthy();
	data.session = null;
	// Closing here wrote a new local closure.
	data.lastClosure = { ...data.lastClosure, id: 'A2', number: 412, server_number: 413 };
	rerender(<TillStrip onOpenClosures={jest.fn()} />);
	await waitFor(() =>
		expect(get.mock.calls.filter(([path]) => path === 'closures/last').length).toBe(reads + 1)
	);
});
it('resolves to the last closure when the listed session closed during the lookup', async () => {
	data.session = null;
	online = true;
	get.mockImplementation((path: string) =>
		Promise.resolve(
			path === 'sessions'
				? {
						data: [
							{ id: 'r9', status: 'open', opened_at_gmt: '2026-09-17T04:00:00Z', opened_by: 7 },
						],
					}
				: path === 'sessions/r9'
					? {
							data: {
								id: 'r9',
								status: 'closed',
								opened_at_gmt: '2026-09-17T04:00:00Z',
								opened_by: 7,
							},
						}
					: { data: { ...data.lastClosure, id: 'B', server_number: 413 } }
		)
	);
	render(<TillStrip onOpenClosures={jest.fn()} />);
	await waitFor(() => expect(get).toHaveBeenCalledWith('closures/last', expect.anything()));
	await waitFor(() =>
		expect(screen.getByTestId('till-last-closure').textContent).toContain('#413')
	);
	expect(screen.getByTestId('till-status').textContent).toContain('Closed');
	expect(screen.queryByTestId('till-xreport')).toBeNull();
});
// Ledger closures 23: the lookup follows the register it is asked about, never a previous one.
it('reads afresh when the bound register changes while closed', async () => {
	data.session = null;
	online = true;
	const { rerender } = render(<TillStrip onOpenClosures={jest.fn()} />);
	await waitFor(() => expect(get).toHaveBeenCalledWith('closures/last', expect.anything()));
	const reads = get.mock.calls.filter(([path]) => path === 'closures/last').length;
	data.binding = { registerId: 'r2', registerName: 'Back till' };
	rerender(<TillStrip onOpenClosures={jest.fn()} />);
	await waitFor(() =>
		expect(get.mock.calls.filter(([path]) => path === 'closures/last').length).toBe(reads + 1)
	);
	expect(get).toHaveBeenLastCalledWith(
		'closures/last',
		expect.objectContaining({ params: expect.objectContaining({ register_id: 'r2' }) })
	);
});
// The till now: a ready lookup is read again every minute while the screen is focused,
// and not while the screen is unfocused.
it('revalidates a ready lookup every minute while focused', async () => {
	data.session = null;
	online = true;
	jest.useFakeTimers();
	try {
		const { rerender } = render(<TillStrip onOpenClosures={jest.fn()} />);
		await waitFor(() =>
			expect(screen.getByTestId('till-last-closure').textContent).toContain('#413')
		);
		const reads = () => get.mock.calls.filter(([path]) => path === 'closures/last').length;
		const before = reads();
		await act(async () => {
			jest.advanceTimersByTime(60_000);
		});
		await waitFor(() => expect(reads()).toBe(before + 1));
		await waitFor(() =>
			expect(screen.getByTestId('till-last-closure').textContent).toContain('#413')
		);
		const settled = reads();
		focused = false;
		rerender(<TillStrip onOpenClosures={jest.fn()} />);
		await act(async () => {
			jest.advanceTimersByTime(120_000);
		});
		expect(reads()).toBe(settled);
	} finally {
		focused = true;
		jest.useRealTimers();
	}
});
