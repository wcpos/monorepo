/** @jest-environment jsdom */
import * as React from 'react';

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { of } from 'rxjs';

import { RemoteSessionCard, SessionCard } from './session-card';
jest.mock('@wcpos/components/text', () => ({ Text: require('react-native').Text }));
jest.mock('@wcpos/components/button', () => ({
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
jest.mock('../../../../contexts/translations', () => ({
	useT: () => jest.requireActual('../../../../../jest/translate').createTestT(),
}));
const credentials = of([{ id: 7, display_name: 'Pat' }]);
const viewedStores = of([
	{
		id: 2,
		timezone: 'Asia/Tokyo',
		currency: 'JPY',
		currency_pos: 'left',
		price_num_decimals: 0,
		price_decimal_sep: '.',
		price_thousand_sep: ',',
	},
]);
const appState = () => ({
	store: {
		id: 1,
		timezone: 'UTC',
		currency: 'GBP',
		currency_pos: 'left',
		price_num_decimals: 2,
		price_decimal_sep: '.',
		price_thousand_sep: ',',
	},
	wpCredentials: {
		capabilities: blind ? [] : ['view_woocommerce_pos_reports'],
		populate$: () => viewedStores,
	},
	site: { populate$: () => credentials },
});
jest.mock('../../../../contexts/app-state', () => ({
	useAppState: () => appState(),
	useStoreSession: () => appState(),
}));
let session: { opened_at_gmt: string; opened_by: number; status: string } | null;
let blind = false;
let lastClosure: { id: string } | null = { id: 'c' };
const print = jest.fn(async () => true);
const reprint = jest.fn(async () => true);
jest.mock('../../../../services/register-session/use-register-session', () => ({
	useRegisterSession: () => ({
		session,
		blind,
		expected: { cash: '155' },
		salesCount: 3,
		binding: { registerId: 'front', registerName: 'Front' },
		lastClosure,
	}),
}));
jest.mock('../../../../services/register-session/use-session-report', () => ({
	useSessionReport: (closure?: unknown, _isReprint?: boolean, known?: unknown) => ({
		print: closure || known ? reprint : print,
	}),
}));
beforeEach(() => {
	jest.clearAllMocks();
	blind = false;
	lastClosure = { id: 'c' };
	session = { opened_at_gmt: '2026-09-17T09:00:00Z', opened_by: 7, status: 'open' };
});
// Revert: render expected cash without the reports capability, or omit the card's session metadata.
it('keeps expected hidden for blind cashiers but retains the opener and sales count', () => {
	blind = true;
	render(<SessionCard />);
	expect(screen.queryByTestId('session-expected')).toBeNull();
	expect(screen.getByTestId('reports-session-card').textContent).toContain('Pat');
	expect(screen.getByTestId('reports-session-card').textContent).toContain('3');
	expect(screen.getByTestId('reports-session-card').textContent).not.toContain('155');
});
// Revert: omit the closed branch or dispatch X rather than the last closure.
it('offers the local last closure Reprint offline when the register is closed', async () => {
	session = null;
	online = false;
	render(<SessionCard />);
	expect(screen.getByTestId('reports-session-card').textContent).toContain('Register closed');
	fireEvent.click(screen.getByTestId('reports-session-print'));
	await waitFor(() => expect(reprint).toHaveBeenCalledTimes(1));
	expect(print).not.toHaveBeenCalled();
	expect(get).not.toHaveBeenCalled();
});
// Revert: omit the X-report action, its expected drawer, or print failure feedback.
// Revert: stringify the known failure key, or replace unexpected errors with generic copy.
it.each([
	['reports.reprint_failed', 'Printing failed. Try again.'],
	['paper', 'Error: paper'],
])('prints the live X-report and displays the %s failure', async (message, expected) => {
	print.mockRejectedValueOnce(new Error(message));
	render(<SessionCard />);
	expect(screen.getByTestId('session-expected').textContent).toContain('£155.00');
	fireEvent.click(screen.getByTestId('reports-session-print'));
	await waitFor(() => expect(screen.getByTestId('session-print-error').textContent).toBe(expected));
});

const get = jest.fn();
const http = { get };
let online = true;
const documentHook = jest.fn((_args: unknown) => ({ print }));
jest.mock('../../hooks/use-rest-http-client', () => ({ useRestHttpClient: () => http }));
jest.mock('@wcpos/hooks/use-online-status', () => ({
	useOnlineStatus: () => ({ status: online ? 'online-website-available' : 'offline' }),
}));
jest.mock('@wcpos/query', () => ({
	useDocField: (doc: unknown, pick: (doc: unknown) => unknown) => (doc ? pick(doc) : undefined),
}));
jest.mock('../../receipt/use-receipt-document', () => ({
	useReceiptDocument: (args: unknown) => documentHook(args as never),
}));
beforeEach(() => {
	online = true;
	get.mockReset().mockImplementation(async (url, config) => ({
		data:
			url === 'sessions'
				? config.params.status === 'counting'
					? [{ id: 'remote' }]
					: []
				: url === 'sessions/remote'
					? {
							id: 'remote',
							register_id: 'back',
							status: 'counting',
							opened_at_gmt: '2026-09-17 09:00:00',
							opened_by: 7,
							sales_count: 12,
							expected: { cash: '200' },
						}
					: null,
	}));
});
// Revert: omit storeId in SessionCardContent day/currency hooks or fail to pass the remote store id.
it('loads a remote counting session and prints its X document, retaining it offline', async () => {
	const view = render(<RemoteSessionCard register={{ id: 'back', name: 'Back' }} storeId={2} />);
	await waitFor(() => expect(screen.getByTestId('session-expected').textContent).toContain('¥200'));
	expect(screen.getByTestId('reports-session-card').textContent).toContain('12');
	expect(screen.getByTestId('reports-session-card').textContent).toContain('Back');
	// Revert: parse the server SQL UTC opening time as device-local time.
	expect(screen.getByTestId('reports-session-card').textContent).toContain('18:00');
	expect(get).toHaveBeenCalledWith(
		'sessions',
		expect.objectContaining({
			params: expect.objectContaining({ register_id: 'back', status: 'open', store_id: 2 }),
		})
	);
	expect(documentHook).toHaveBeenLastCalledWith(
		expect.objectContaining({ document: 'xreport:remote', storeId: 2, templateType: 'closure' })
	);
	online = false;
	view.rerender(<RemoteSessionCard register={{ id: 'back', name: 'Back' }} storeId={2} />);
	expect(screen.getByTestId('session-expected').textContent).toContain('¥200');
	expect(screen.getByTestId('session-unavailable')).toBeTruthy();
	expect((screen.getByTestId('reports-session-print') as HTMLButtonElement).disabled).toBe(true);
});
// Revert: expose remote expected figures without the reports capability.
it('does not expose remote expected figures to a blind cashier', async () => {
	blind = true;
	render(<RemoteSessionCard register={{ id: 'back', name: 'Back' }} storeId={2} />);
	await waitFor(() =>
		expect(screen.getByTestId('reports-session-card').textContent).toContain('12')
	);
	expect(screen.queryByTestId('session-expected')).toBeNull();
});
// Revert: read the local last closure for a remote closed register.
it.each([0, 2])(
	'uses the remote last closure for a closed register in store %s',
	async (storeId) => {
		get.mockImplementation(async (url) => ({
			data: url === 'sessions' ? [] : { id: 'last-remote', number: 5 },
		}));
		render(<RemoteSessionCard register={{ id: 'back', name: 'Back' }} storeId={storeId} />);
		await waitFor(() =>
			expect(screen.getByTestId('reports-session-card').textContent).toContain('Register closed')
		);
		expect(get).toHaveBeenCalledWith(
			'closures/last',
			expect.objectContaining({ params: { register_id: 'back', store_id: storeId || null } })
		);
		expect(documentHook).toHaveBeenLastCalledWith(
			expect.objectContaining({ document: 'closure:last-remote', isReprint: true })
		);
	}
);

// Revert: choose a scope-filtered historical row or omit the bound register's last-closure read.
it('fetches the actual last closure when the bound closed register has no local closure', async () => {
	session = null;
	lastClosure = null;
	get.mockImplementation(async (url) => ({
		data: url === 'sessions' ? [] : { id: 'latest', number: 9 },
	}));
	render(<SessionCard />);
	await waitFor(() => expect(screen.getByTestId('reports-session-print')).toBeTruthy());
	expect(get).toHaveBeenCalledWith('closures/last', {
		params: { register_id: 'front', store_id: 1 },
	});
	expect(documentHook).toHaveBeenLastCalledWith(
		expect.objectContaining({ document: 'closure:latest', isReprint: true })
	);
	fireEvent.click(screen.getByTestId('reports-session-print'));
	await waitFor(() => expect(print).toHaveBeenCalledTimes(1));
	expect(reprint).not.toHaveBeenCalled();
});

// Revert: show an actionable local card while closures/last is pending, or ignore its server row.
it('replaces local A with authoritative B for the bound register card and Reprint', async () => {
	session = null;
	lastClosure = { id: 'A' };
	let resolve!: (value: { data: { id: string; number: number } }) => void;
	const pending = new Promise((done) => {
		resolve = done;
	});
	get.mockImplementation(async (url) => (url === 'sessions' ? { data: [] } : pending));
	const view = render(<SessionCard />);
	expect(screen.getByTestId('reports-session-card').textContent).toContain('Register closed');
	expect((screen.getByTestId('reports-session-print') as HTMLButtonElement).disabled).toBe(true);
	expect(screen.getByTestId('session-unavailable').textContent).toContain('Loading');
	fireEvent.click(screen.getByTestId('reports-session-print'));
	expect(reprint).not.toHaveBeenCalled();
	await waitFor(() =>
		expect(get).toHaveBeenCalledWith('closures/last', {
			params: { register_id: 'front', store_id: 1 },
		})
	);
	await act(async () => {
		resolve({ data: { id: 'B', number: 10 } });
	});
	expect(documentHook).toHaveBeenLastCalledWith(
		expect.objectContaining({ document: 'closure:B', isReprint: true })
	);
	fireEvent.click(screen.getByTestId('reports-session-print'));
	await waitFor(() => expect(print).toHaveBeenCalledTimes(1));
	expect(reprint).not.toHaveBeenCalled();
	expect(screen.queryByTestId('session-unavailable')).toBeNull();
	online = false;
	view.rerender(<SessionCard />);
	fireEvent.click(screen.getByTestId('reports-session-print'));
	await waitFor(() => expect(reprint).toHaveBeenCalledTimes(1));
});

// Revert: hide the lookup error behind the local card or allow its stale closure to print.
it('disables the local Reprint after a failed lookup and retries to the server closure', async () => {
	session = null;
	lastClosure = { id: 'A' };
	get.mockImplementation(async (url) => {
		if (url === 'sessions') return { data: [] };
		throw new Error('lookup failed');
	});
	render(<SessionCard />);
	await waitFor(() => expect(screen.getByTestId('session-retry-front')).toBeTruthy());
	expect((screen.getByTestId('reports-session-print') as HTMLButtonElement).disabled).toBe(true);
	expect(screen.getByTestId('session-unavailable').textContent).toBe('Could not load closures');
	fireEvent.click(screen.getByTestId('reports-session-print'));
	expect(reprint).not.toHaveBeenCalled();
	get.mockImplementation(async (url) => ({
		data: url === 'sessions' ? [] : { id: 'B', number: 10 },
	}));
	fireEvent.click(screen.getByTestId('session-retry-front'));
	await waitFor(() => expect(screen.queryByTestId('session-unavailable')).toBeNull());
	expect(screen.queryByTestId('session-retry-front')).toBeNull();
	expect((screen.getByTestId('reports-session-print') as HTMLButtonElement).disabled).toBe(false);
	expect(documentHook).toHaveBeenLastCalledWith(
		expect.objectContaining({ document: 'closure:B', isReprint: true })
	);
	fireEvent.click(screen.getByTestId('reports-session-print'));
	await waitFor(() => expect(print).toHaveBeenCalledTimes(1));
	expect(reprint).not.toHaveBeenCalled();
});
